import { modeString, type Stat } from '../../vfs/vfs';
import { basename, dirname, extname } from '../../vfs/path';
import { c, pad } from '../ansi';
import { getopt } from '../args';
import { archiveKind, gunzip, zipInfo } from '../../util/archive';
import { fsMessage, type CommandContext, type CommandDef } from '../shell';

function colorName(st: Stat, tty: boolean): string {
  if (!tty) return st.name;
  if (st.type === 'dir') return c.bold(c.blue(st.name));
  if (st.type === 'symlink') return c.cyan(st.name);
  if (st.mode & 0o111) return c.bold(c.green(st.name));
  return st.name;
}

export function humanSize(n: number): string {
  if (n < 1024) return String(n);
  const units = ['K', 'M', 'G'];
  let v = n;
  let u = -1;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + units[u];
}

/** Reads files given as args, or stdin when none. Calls `each` per input. Returns exit status. */
export function eachInput(
  ctx: CommandContext,
  files: string[],
  each: (text: string, name: string) => void,
): number {
  if (!files.length || (files.length === 1 && files[0] === '-')) {
    each(ctx.stdin ?? '', '-');
    return 0;
  }
  let status = 0;
  for (const f of files) {
    try {
      each(ctx.kernel.vfs.readFile(ctx.resolve(f), ctx.cred), f);
    } catch (e) {
      ctx.err(fsMessage(ctx.name, e, f));
      status = 1;
    }
  }
  return status;
}

const ls: CommandDef = {
  name: 'ls',
  summary: 'list directory contents',
  usage: 'ls [-alhd1] [FILE]...',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'alAh1dtr', '', { all: 'a', 'almost-all': 'A', 'human-readable': 'h' });
    const all = flags.has('a');
    const almost = flags.has('A');
    const long = flags.has('l');
    const targets = rest.length ? rest : ['.'];
    const vfs = ctx.kernel.vfs;
    let status = 0;

    const render = (entries: Stat[]) => {
      if (flags.has('t')) entries.sort((a, b) => b.mtime - a.mtime);
      if (flags.has('r')) entries.reverse();
      if (long) {
        const sizeOf = (s: Stat) => (flags.has('h') ? humanSize(s.size) : String(s.size));
        const w = {
          owner: Math.max(...entries.map((e) => e.owner.length), 1),
          group: Math.max(...entries.map((e) => e.group.length), 1),
          size: Math.max(...entries.map((e) => sizeOf(e).length), 1),
        };
        for (const e of entries) {
          const links = e.type === 'dir' ? 2 : 1;
          const name = colorName(e, ctx.tty) + (e.type === 'symlink' ? ` -> ${e.target}` : '');
          ctx.out(
            `${modeString(e.type, e.mode)} ${links} ${pad(e.owner, w.owner)} ${pad(e.group, w.group)} ` +
              `${pad(sizeOf(e), w.size, true)} ${ctx.kernel.time.short(e.mtime)} ${name}\n`,
          );
        }
      } else if (flags.has('1') || !ctx.tty) {
        for (const e of entries) ctx.out(colorName(e, ctx.tty) + '\n');
      } else if (entries.length) {
        ctx.out(entries.map((e) => colorName(e, true)).join('  ') + '\n');
      }
    };

    const files: Stat[] = [];
    const dirs: string[] = [];
    for (const t of targets) {
      try {
        const st = vfs.stat(ctx.resolve(t), ctx.cred);
        if (st.type === 'dir' && !flags.has('d')) dirs.push(t);
        else files.push({ ...st, name: t });
      } catch (e) {
        ctx.err(fsMessage('ls', e, `cannot access '${t}'`));
        status = 2;
      }
    }
    if (files.length) render(files);
    dirs.forEach((d, i) => {
      if (targets.length > 1) ctx.out(`${files.length || i ? '\n' : ''}${d}:\n`);
      try {
        const path = ctx.resolve(d);
        let entries = vfs.readdir(path, ctx.cred);
        if (!all && !almost) entries = entries.filter((e) => !e.hidden);
        if (all) {
          const self = vfs.stat(path, ctx.cred);
          const parent = vfs.stat(dirname(path), ctx.cred);
          entries = [{ ...self, name: '.' }, { ...parent, name: '..' }, ...entries];
        }
        if (long) ctx.out(`total ${entries.reduce((a, e) => a + Math.ceil(e.size / 4096) * 4, 0)}\n`);
        render(entries);
      } catch (e) {
        ctx.err(fsMessage('ls', e, `cannot open directory '${d}'`));
        status = 2;
      }
    });
    return status;
  },
};

const cd: CommandDef = {
  name: 'cd',
  summary: 'change the working directory',
  usage: 'cd [DIR]',
  run(ctx) {
    const target = ctx.argv[0] === '-' ? (ctx.sh.env.OLDPWD ?? ctx.sh.cwd) : (ctx.argv[0] ?? ctx.sh.home);
    try {
      ctx.sh.chdir(target);
      if (ctx.argv[0] === '-') ctx.out(ctx.sh.cwd + '\n');
      return 0;
    } catch (e) {
      ctx.err(fsMessage('bash: cd', e, target));
      return 1;
    }
  },
};

const pwd: CommandDef = {
  name: 'pwd',
  summary: 'print name of current directory',
  run(ctx) {
    ctx.out(ctx.sh.cwd + '\n');
    return 0;
  },
};

const cat: CommandDef = {
  name: 'cat',
  summary: 'concatenate files and print on the standard output',
  usage: 'cat [-n] [FILE]...',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'nA');
    let n = 0;
    return eachInput(ctx, rest, (text) => {
      if (flags.has('n')) {
        const lines = text.replace(/\n$/, '').split('\n');
        ctx.out(lines.map((l) => `${String(++n).padStart(6)}  ${l}`).join('\n') + '\n');
      } else {
        ctx.out(text);
      }
    });
  },
};

function headTail(which: 'head' | 'tail'): CommandDef {
  return {
    name: which,
    summary: which === 'head' ? 'output the first part of files' : 'output the last part of files',
    usage: `${which} [-n NUM] [FILE]...`,
    run(ctx) {
      const argv = ctx.argv.map((a) => (/^-\d+$/.test(a) ? `-n${a.slice(1)}` : a));
      const { values, rest } = getopt(argv, 'qf', 'n');
      const raw = values.n ?? '10';
      const n = Math.abs(parseInt(raw, 10) || 10);
      return eachInput(ctx, rest, (text, name) => {
        if (rest.length > 1) ctx.out(`==> ${name} <==\n`);
        const lines = text.replace(/\n$/, '').split('\n');
        const pick = which === 'head' ? lines.slice(0, n) : raw.startsWith('+') ? lines.slice(n - 1) : lines.slice(-n);
        if (text) ctx.out(pick.join('\n') + '\n');
      });
    },
  };
}

const touch: CommandDef = {
  name: 'touch',
  summary: 'change file timestamps / create empty files',
  run(ctx) {
    let status = 0;
    for (const f of ctx.argv.filter((a) => !a.startsWith('-'))) {
      const p = ctx.resolve(f);
      try {
        const vfs = ctx.kernel.vfs;
        if (vfs.exists(p, ctx.cred)) vfs.writeFile(p, vfs.readFile(p, ctx.cred, { silent: true }), ctx.cred);
        else vfs.writeFile(p, '', ctx.cred);
      } catch (e) {
        ctx.err(fsMessage('touch', e, `cannot touch '${f}'`));
        status = 1;
      }
    }
    return status;
  },
};

const mkdir: CommandDef = {
  name: 'mkdir',
  summary: 'make directories',
  usage: 'mkdir [-p] DIR...',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'pv', '', { parents: 'p' });
    let status = 0;
    for (const d of rest) {
      try {
        ctx.kernel.vfs.mkdir(ctx.resolve(d), ctx.cred, { parents: flags.has('p') });
      } catch (e) {
        ctx.err(fsMessage('mkdir', e, `cannot create directory '${d}'`));
        status = 1;
      }
    }
    return status;
  },
};

const rm: CommandDef = {
  name: 'rm',
  summary: 'remove files or directories',
  usage: 'rm [-rf] FILE...',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'rRfiv', '', { recursive: 'r', force: 'f' });
    let status = 0;
    if (!rest.length && !flags.has('f')) {
      ctx.err('rm: missing operand\n');
      return 1;
    }
    for (const f of rest) {
      try {
        ctx.kernel.vfs.remove(ctx.resolve(f), ctx.cred, { recursive: flags.has('r') || flags.has('R') });
      } catch (e) {
        if (flags.has('f') && (e as { code?: string }).code === 'ENOENT') continue;
        ctx.err(fsMessage('rm', e, `cannot remove '${f}'`));
        status = 1;
      }
    }
    return status;
  },
};

const rmdir: CommandDef = {
  name: 'rmdir',
  summary: 'remove empty directories',
  run(ctx) {
    let status = 0;
    for (const d of ctx.argv) {
      try {
        ctx.kernel.vfs.remove(ctx.resolve(d), ctx.cred, { dirOnly: true });
      } catch (e) {
        ctx.err(fsMessage('rmdir', e, `failed to remove '${d}'`));
        status = 1;
      }
    }
    return status;
  },
};

const mv: CommandDef = {
  name: 'mv',
  summary: 'move (rename) files',
  usage: 'mv SOURCE... DEST',
  run(ctx) {
    const { rest } = getopt(ctx.argv, 'fiv');
    if (rest.length < 2) {
      ctx.err(`mv: missing destination file operand\n`);
      return 1;
    }
    const dest = rest.pop()!;
    let status = 0;
    for (const s of rest) {
      try {
        ctx.kernel.vfs.move(ctx.resolve(s), ctx.resolve(dest), ctx.cred);
      } catch (e) {
        ctx.err(fsMessage('mv', e, `cannot move '${s}'`));
        status = 1;
      }
    }
    return status;
  },
};

const cp: CommandDef = {
  name: 'cp',
  summary: 'copy files and directories',
  usage: 'cp [-r] SOURCE... DEST',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'rRafv', '', { recursive: 'r' });
    if (rest.length < 2) {
      ctx.err(`cp: missing destination file operand\n`);
      return 1;
    }
    const dest = rest.pop()!;
    let status = 0;
    for (const s of rest) {
      try {
        ctx.kernel.vfs.copy(ctx.resolve(s), ctx.resolve(dest), ctx.cred, {
          recursive: flags.has('r') || flags.has('R') || flags.has('a'),
        });
      } catch (e) {
        ctx.err(fsMessage('cp', e, `cannot copy '${s}'`));
        status = 1;
      }
    }
    return status;
  },
};

/** Applies "755", "+x", "u+rw,go-w" … to a mode. */
export function applyChmod(spec: string, mode: number): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let m = mode;
  for (const clause of spec.split(',')) {
    const r = clause.match(/^([ugoa]*)([+\-=])([rwxt]*)$/);
    if (!r) return null;
    const who = r[1] || 'a';
    let bits = 0;
    for (const p of r[3]!) bits |= p === 'r' ? 4 : p === 'w' ? 2 : p === 'x' ? 1 : 0;
    let mask = 0;
    if (who.includes('u') || who.includes('a')) mask |= bits << 6;
    if (who.includes('g') || who.includes('a')) mask |= bits << 3;
    if (who.includes('o') || who.includes('a')) mask |= bits;
    if (r[3]!.includes('t')) mask |= 0o1000;
    if (r[2] === '+') m |= mask;
    else if (r[2] === '-') m &= ~mask;
    else {
      let clear = 0;
      if (who.includes('u') || who.includes('a')) clear |= 0o700;
      if (who.includes('g') || who.includes('a')) clear |= 0o070;
      if (who.includes('o') || who.includes('a')) clear |= 0o007;
      m = (m & ~clear) | mask;
    }
  }
  return m;
}

const chmod: CommandDef = {
  name: 'chmod',
  summary: 'change file mode bits',
  usage: 'chmod MODE FILE...',
  run(ctx) {
    const [spec, ...files] = ctx.argv;
    if (!spec || !files.length) {
      ctx.err('chmod: missing operand\n');
      return 1;
    }
    let status = 0;
    for (const f of files) {
      try {
        const p = ctx.resolve(f);
        const st = ctx.kernel.vfs.stat(p, ctx.cred);
        const m = applyChmod(spec, st.mode);
        if (m === null) {
          ctx.err(`chmod: invalid mode: '${spec}'\n`);
          return 1;
        }
        ctx.kernel.vfs.chmod(p, m, ctx.cred);
      } catch (e) {
        ctx.err(fsMessage('chmod', e, `changing permissions of '${f}'`));
        status = 1;
      }
    }
    return status;
  },
};

const chown: CommandDef = {
  name: 'chown',
  summary: 'change file owner and group',
  run(ctx) {
    const [spec, ...files] = ctx.argv;
    if (!spec || !files.length) {
      ctx.err('chown: missing operand\n');
      return 1;
    }
    const [owner, group] = spec.split(':') as [string, string | undefined];
    let status = 0;
    for (const f of files) {
      try {
        const st = ctx.kernel.vfs.stat(ctx.resolve(f), ctx.cred);
        ctx.kernel.vfs.chown(ctx.resolve(f), owner || st.owner, group || st.group, ctx.cred);
      } catch (e) {
        ctx.err(fsMessage('chown', e, `changing ownership of '${f}'`));
        status = 1;
      }
    }
    return status;
  },
};

const stat: CommandDef = {
  name: 'stat',
  summary: 'display file status',
  run(ctx) {
    let status = 0;
    for (const f of ctx.argv) {
      try {
        const st = ctx.kernel.vfs.stat(ctx.resolve(f), ctx.cred, false);
        const kind = st.type === 'dir' ? 'directory' : st.type === 'symlink' ? 'symbolic link' : st.size ? 'regular file' : 'regular empty file';
        const uid = ctx.kernel.users.get(st.owner)?.uid ?? 0;
        const t = ctx.kernel.time.iso(st.mtime) + '.000000000 ' + ctx.kernel.time.rfc2822(st.mtime).slice(-5);
        ctx.out(
          `  File: ${f}${st.target ? ` -> ${st.target}` : ''}\n` +
            `  Size: ${pad(String(st.size), 15)} Blocks: ${pad(String(Math.ceil(st.size / 512) * 8), 10)} IO Block: 4096   ${kind}\n` +
            `Access: (${st.mode.toString(8).padStart(4, '0')}/${modeString(st.type, st.mode)})  Uid: (${pad(String(uid), 5, true)}/${pad(st.owner, 8, true)})   Gid: (${pad(String(uid), 5, true)}/${pad(st.group, 8, true)})\n` +
            `Modify: ${t}\nChange: ${t}\n`,
        );
      } catch (e) {
        ctx.err(fsMessage('stat', e, `cannot statx '${f}'`));
        status = 1;
      }
    }
    return status;
  },
};

export function describeFile(name: string, content: string, st: Stat): string {
  if (st.type === 'dir') return 'directory';
  if (st.type === 'symlink') return `symbolic link to ${st.target}`;
  if (!content) return 'empty';
  if (content.startsWith('data:image/png')) return 'PNG image data';
  if (content.startsWith('data:image/jpeg')) return 'JPEG image data, JFIF standard 1.01';
  if (content.startsWith('data:')) return 'data';
  if (content.trimStart().startsWith('<svg') || (content.startsWith('<?xml') && content.includes('<svg')))
    return 'SVG Scalable Vector Graphics image';
  if (content.startsWith('\x7fELF')) return 'ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped';
  if (/^LUMENFW/.test(content)) return 'Lumen firmware image, data';
  const archive = archiveKind(content);
  if (archive === 'gzip') return `gzip compressed data, was "${gunzip(content).name}", from Unix`;
  if (archive === 'tar') return 'POSIX tar archive (GNU)';
  if (archive === 'zip') return `Zip archive data, at least v2.0 to extract${zipInfo(content).encrypted ? ', encrypted' : ''}`;
  const shebang = content.match(/^#!\s*(\S+)/);
  if (shebang) {
    const interp = basename(shebang[1]!);
    const kind = interp === 'sh' || interp === 'bash' ? 'POSIX shell script' : `${interp} script`;
    return `${kind}, ASCII text executable`;
  }
  if (/^(Return-Path|Received|From|Message-ID|Delivered-To):/m.test(content.slice(0, 400)) && extname(name) === 'eml')
    return 'RFC 822 mail, ASCII text';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0e-\x1f]/.test(content)) return 'data';
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7f]/.test(content) ? 'Unicode text, UTF-8 text' : 'ASCII text';
}

const file: CommandDef = {
  name: 'file',
  summary: 'determine file type',
  run(ctx) {
    let status = 0;
    for (const f of ctx.argv) {
      try {
        const p = ctx.resolve(f);
        const st = ctx.kernel.vfs.stat(p, ctx.cred, false);
        const content = st.type === 'file' ? ctx.kernel.vfs.readFile(p, ctx.cred, { silent: true }) : '';
        ctx.out(`${f}: ${describeFile(f, content, st)}\n`);
      } catch (e) {
        ctx.out(`${f}: cannot open \`${f}' (${(e as Error).message})\n`);
        status = 1;
      }
    }
    return status;
  },
};

const find: CommandDef = {
  name: 'find',
  summary: 'search for files in a directory hierarchy',
  usage: 'find [PATH...] [-name PATTERN] [-iname PATTERN] [-type f|d] [-user NAME] [-perm MODE] [-maxdepth N]',
  run(ctx) {
    const paths: string[] = [];
    let i = 0;
    while (i < ctx.argv.length && !ctx.argv[i]!.startsWith('-')) paths.push(ctx.argv[i++]!);
    if (!paths.length) paths.push('.');
    const tests: Array<(s: Stat) => boolean> = [];
    let maxdepth = Infinity;
    const toRe = (g: string, flags = '') =>
      new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', flags);
    for (; i < ctx.argv.length; i++) {
      const a = ctx.argv[i]!;
      const v = ctx.argv[++i];
      if (v === undefined) {
        ctx.err(`find: missing argument to \`${a}'\n`);
        return 1;
      }
      if (a === '-name') tests.push((s) => toRe(v).test(s.name));
      else if (a === '-iname') tests.push((s) => toRe(v, 'i').test(s.name));
      else if (a === '-type') tests.push((s) => (v === 'd' ? s.type === 'dir' : v === 'l' ? s.type === 'symlink' : s.type === 'file'));
      else if (a === '-user') tests.push((s) => s.owner === v);
      else if (a === '-group') tests.push((s) => s.group === v);
      else if (a === '-perm') {
        const want = parseInt(v.replace(/^[-/]/, ''), 8);
        tests.push((s) => (v.startsWith('-') ? (s.mode & want) === want : v.startsWith('/') ? (s.mode & want) !== 0 : (s.mode & 0o7777) === want));
      } else if (a === '-maxdepth') maxdepth = Number(v);
      else if (a === '-newer') {
        try {
          const ref = ctx.kernel.vfs.stat(ctx.resolve(v), ctx.cred).mtime;
          tests.push((s) => s.mtime > ref);
        } catch (e) {
          ctx.err(fsMessage('find', e, v));
          return 1;
        }
      } else {
        ctx.err(`find: unknown predicate \`${a}'\n`);
        return 1;
      }
    }
    let status = 0;
    const vfs = ctx.kernel.vfs;
    const walk = (shown: string, abs: string, depth: number) => {
      let st: Stat;
      try {
        st = vfs.stat(abs, ctx.cred, false);
      } catch (e) {
        ctx.err(fsMessage('find', e, `'${shown}'`));
        status = 1;
        return;
      }
      if (tests.every((t) => t({ ...st, name: depth === 0 ? basename(shown) : st.name }))) ctx.out(shown + '\n');
      if (st.type !== 'dir' || depth >= maxdepth) return;
      try {
        for (const child of vfs.readdir(abs, ctx.cred, { silent: true })) {
          walk(`${shown === '/' ? '' : shown}/${child.name}`, child.path, depth + 1);
        }
      } catch (e) {
        ctx.err(fsMessage('find', e, `'${shown}'`));
        status = 1;
      }
    };
    for (const p of paths) walk(p.replace(/\/$/, '') || '/', ctx.resolve(p), 0);
    return status;
  },
};

const tree: CommandDef = {
  name: 'tree',
  summary: 'list contents of directories in a tree-like format',
  usage: 'tree [-a] [DIR]',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'ad', 'L');
    const root = rest[0] ?? '.';
    const max = Number(ctx.argv.includes('-L') ? getopt(ctx.argv, 'ad', 'L').values.L : Infinity);
    let dirs = 0;
    let files = 0;
    ctx.out(c.bold(c.blue(root)) + '\n');
    const walk = (abs: string, prefix: string, depth: number) => {
      let entries: Stat[];
      try {
        entries = ctx.kernel.vfs.readdir(abs, ctx.cred, { silent: true });
      } catch {
        ctx.out(`${prefix}  [error opening dir]\n`);
        return;
      }
      if (!flags.has('a')) entries = entries.filter((e) => !e.hidden);
      if (flags.has('d')) entries = entries.filter((e) => e.type === 'dir');
      entries.forEach((e, i) => {
        const lastOne = i === entries.length - 1;
        ctx.out(`${prefix}${lastOne ? '└── ' : '├── '}${colorName(e, ctx.tty)}\n`);
        if (e.type === 'dir') {
          dirs++;
          if (depth + 1 < max) walk(e.path, prefix + (lastOne ? '    ' : '│   '), depth + 1);
        } else files++;
      });
    };
    try {
      ctx.kernel.vfs.readdir(ctx.resolve(root), ctx.cred);
    } catch (e) {
      ctx.err(fsMessage('tree', e, root));
      return 1;
    }
    walk(ctx.resolve(root), '', 0);
    ctx.out(`\n${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}\n`);
    return 0;
  },
};

const wc: CommandDef = {
  name: 'wc',
  summary: 'print newline, word, and byte counts',
  usage: 'wc [-lwc] [FILE]...',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'lwcm');
    const pick = flags.size ? flags : new Set(['l', 'w', 'c']);
    const total = [0, 0, 0];
    const line = (counts: number[], name: string) => {
      const cols: string[] = [];
      if (pick.has('l')) cols.push(String(counts[0]));
      if (pick.has('w')) cols.push(String(counts[1]));
      if (pick.has('c') || pick.has('m')) cols.push(String(counts[2]));
      ctx.out(cols.map((x) => x.padStart(cols.length > 1 ? 7 : 0)).join(' ') + (name === '-' ? '' : ` ${name}`) + '\n');
    };
    const status = eachInput(ctx, rest, (text, name) => {
      const counts = [(text.match(/\n/g) ?? []).length, text.split(/\s+/).filter(Boolean).length, new TextEncoder().encode(text).length];
      counts.forEach((n, k) => (total[k]! += n));
      line(counts, name);
    });
    if (rest.length > 1) line(total, 'total');
    return status;
  },
};

export const fsCommands: CommandDef[] = [
  ls, cd, pwd, cat, headTail('head'), headTail('tail'), touch, mkdir, rm, rmdir, mv, cp, chmod, chown, stat, file, find, tree, wc,
];
