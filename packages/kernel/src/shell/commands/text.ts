import { c } from '../ansi';
import { getopt } from '../args';
import { fsMessage, type CommandDef } from '../shell';
import { eachInput } from './fs';
import { decodeBase64, encodeBase64 } from '../../util/base64';
import { sha256 } from '../../util/sha256';

const echo: CommandDef = {
  name: 'echo',
  summary: 'display a line of text',
  run(ctx) {
    let args = ctx.argv;
    let newline = true;
    let escapes = false;
    while (args[0] && /^-[neE]+$/.test(args[0])) {
      if (args[0].includes('n')) newline = false;
      if (args[0].includes('e')) escapes = true;
      args = args.slice(1);
    }
    let text = args.join(' ');
    if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\e/g, '\x1b');
    ctx.out(text + (newline ? '\n' : ''));
    return 0;
  },
};

const grep: CommandDef = {
  name: 'grep',
  summary: 'print lines that match patterns',
  usage: 'grep [-ivnrclHoE] PATTERN [FILE]...',
  run(ctx) {
    const { flags, values, rest } = getopt(ctx.argv, 'ivnrRclHhoEFws', 'e', {
      'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', recursive: 'r', count: 'c', color: 'H',
    });
    const pattern = values.e ?? rest.shift();
    if (pattern === undefined) {
      ctx.err('Usage: grep [OPTION]... PATTERNS [FILE]...\n');
      return 2;
    }
    let src = flags.has('F') ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
    // Basic-regex compat: \| means alternation, \( \) groups.
    if (!flags.has('E') && !flags.has('F')) src = src.replace(/\\\|/g, '|').replace(/\\([()])/g, '$1');
    if (flags.has('w')) src = `\\b(?:${src})\\b`;
    let re: RegExp;
    try {
      re = new RegExp(src, flags.has('i') ? 'gi' : 'g');
    } catch {
      ctx.err(`grep: invalid regular expression\n`);
      return 2;
    }
    const recursive = flags.has('r') || flags.has('R');
    const vfs = ctx.kernel.vfs;
    let files = rest;
    if (recursive) {
      files = [];
      const walk = (shown: string, abs: string) => {
        try {
          const st = vfs.stat(abs, ctx.cred);
          if (st.type === 'file') return files.push(shown);
          for (const child of vfs.readdir(abs, ctx.cred, { silent: true })) walk(`${shown.replace(/\/$/, '')}/${child.name}`, child.path);
        } catch (e) {
          if (!flags.has('s')) ctx.err(fsMessage('grep', e, shown));
        }
        return 0;
      };
      for (const r of rest.length ? rest : ['.']) walk(r, ctx.resolve(r));
    }
    const showName = (files.length > 1 || recursive) && !flags.has('h');
    let matched = false;
    const status = eachInput(ctx, files, (text, name) => {
      if (text.startsWith('data:')) return;
      const lines = text.replace(/\n$/, '').split('\n');
      let count = 0;
      lines.forEach((line, idx) => {
        re.lastIndex = 0;
        const hit = re.test(line) !== flags.has('v');
        if (!hit) return;
        count++;
        matched = true;
        if (flags.has('c') || flags.has('l')) return;
        const prefix = (showName ? (ctx.tty ? c.magenta(name) + c.cyan(':') : name + ':') : '') +
          (flags.has('n') ? (ctx.tty ? c.green(String(idx + 1)) + c.cyan(':') : `${idx + 1}:`) : '');
        if (flags.has('o') && !flags.has('v')) {
          for (const m of line.matchAll(re)) ctx.out(prefix + (ctx.tty ? c.bold(c.red(m[0])) : m[0]) + '\n');
        } else {
          const body = ctx.tty && !flags.has('v') ? line.replace(re, (m) => c.bold(c.red(m))) : line;
          ctx.out(prefix + body + '\n');
        }
      });
      if (flags.has('c')) ctx.out((showName ? `${name}:` : '') + count + '\n');
      if (flags.has('l') && count) ctx.out(name + '\n');
    });
    if (status) return 2;
    return matched ? 0 : 1;
  },
};

const sort: CommandDef = {
  name: 'sort',
  summary: 'sort lines of text files',
  usage: 'sort [-rnuf] [-t SEP] [-k FIELD] [FILE]...',
  run(ctx) {
    const { flags, values, rest } = getopt(ctx.argv, 'rnuf', 'tk', { reverse: 'r', 'numeric-sort': 'n', unique: 'u' });
    const all: string[] = [];
    const status = eachInput(ctx, rest, (t) => all.push(...t.replace(/\n$/, '').split('\n')));
    let lines = all.filter((l, i) => l || i < all.length - 1);
    // -k N[,M]: compare from field N (1-based) to M (default: end of line).
    const [from, to] = (values.k ?? '').split(',').map((x) => parseInt(x, 10));
    const sep = values.t;
    const key = (line: string) => {
      if (!from) return line;
      const fields = sep !== undefined ? line.split(sep) : line.trim().split(/\s+/);
      return fields.slice(from - 1, to ? to : undefined).join(sep ?? ' ');
    };
    const cmp = flags.has('n')
      ? (a: string, b: string) => (parseFloat(key(a)) || 0) - (parseFloat(key(b)) || 0)
      : flags.has('f')
        ? (a: string, b: string) => key(a).toLowerCase().localeCompare(key(b).toLowerCase())
        : (a: string, b: string) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
    lines.sort(cmp);
    if (flags.has('r')) lines.reverse();
    if (flags.has('u')) lines = [...new Set(lines)];
    if (lines.length) ctx.out(lines.join('\n') + '\n');
    return status;
  },
};

const uniq: CommandDef = {
  name: 'uniq',
  summary: 'report or omit repeated lines',
  usage: 'uniq [-cd] [FILE]',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'cdu');
    return eachInput(ctx, rest.slice(0, 1), (text) => {
      const lines = text.replace(/\n$/, '').split('\n');
      const groups: Array<[string, number]> = [];
      for (const l of lines) {
        const last = groups[groups.length - 1];
        if (last && last[0] === l) last[1]++;
        else groups.push([l, 1]);
      }
      for (const [l, n] of groups) {
        if (flags.has('d') && n < 2) continue;
        if (flags.has('u') && n > 1) continue;
        ctx.out((flags.has('c') ? `${String(n).padStart(7)} ` : '') + l + '\n');
      }
    });
  },
};

const cut: CommandDef = {
  name: 'cut',
  summary: 'remove sections from each line of files',
  usage: 'cut -d DELIM -f LIST [FILE]...',
  run(ctx) {
    const { values, rest } = getopt(ctx.argv, 's', 'dfc');
    const delim = values.d ?? '\t';
    const spec = values.f ?? values.c;
    if (!spec) {
      ctx.err('cut: you must specify a list of bytes, characters, or fields\n');
      return 1;
    }
    const wanted = (n: number) =>
      spec.split(',').some((part) => {
        const [a, b] = part.split('-');
        const lo = a ? Number(a) : 1;
        const hi = part.includes('-') ? (b ? Number(b) : Infinity) : lo;
        return n >= lo && n <= hi;
      });
    return eachInput(ctx, rest, (text) => {
      for (const line of text.replace(/\n$/, '').split('\n')) {
        if (values.c) ctx.out([...line].filter((_, i) => wanted(i + 1)).join('') + '\n');
        else ctx.out(line.split(delim).filter((_, i) => wanted(i + 1)).join(delim) + '\n');
      }
    });
  },
};

const tr: CommandDef = {
  name: 'tr',
  summary: 'translate or delete characters',
  usage: 'tr [-d] SET1 [SET2]',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'ds');
    const expand = (s: string) =>
      s
        .replace(/\[:upper:\]/g, 'A-Z')
        .replace(/\[:lower:\]/g, 'a-z')
        .replace(/(.)-(.)/g, (_m, a: string, b: string) => {
          let out = '';
          for (let x = a.charCodeAt(0); x <= b.charCodeAt(0); x++) out += String.fromCharCode(x);
          return out;
        })
        .replace(/\\n/g, '\n');
    const s1 = expand(rest[0] ?? '');
    const s2 = expand(rest[1] ?? '');
    const input = ctx.stdin ?? '';
    let out = '';
    for (const ch of input) {
      const i = s1.indexOf(ch);
      if (i === -1) out += ch;
      else if (!flags.has('d')) out += s2[Math.min(i, s2.length - 1)] ?? '';
    }
    ctx.out(out);
    return 0;
  },
};

const rev: CommandDef = {
  name: 'rev',
  summary: 'reverse lines characterwise',
  run(ctx) {
    return eachInput(ctx, ctx.argv, (text) => {
      ctx.out(text.replace(/\n$/, '').split('\n').map((l) => [...l].reverse().join('')).join('\n') + '\n');
    });
  },
};

const base64: CommandDef = {
  name: 'base64',
  summary: 'base64 encode/decode data and print to standard output',
  usage: 'base64 [-d] [FILE]',
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'diw', '', { decode: 'd' });
    return eachInput(ctx, rest, (text) => {
      if (flags.has('d')) {
        try {
          ctx.out(decodeBase64(text));
        } catch {
          ctx.err('base64: invalid input\n');
        }
      } else {
        ctx.out((encodeBase64(text).match(/.{1,76}/g) ?? ['']).join('\n') + '\n');
      }
    });
  },
};

const xxd: CommandDef = {
  name: 'xxd',
  summary: 'make a hex dump',
  usage: 'xxd [-p] [-r -p] [-l LEN] [FILE]',
  run(ctx) {
    const { flags, values, rest } = getopt(ctx.argv, 'pr', 'l');
    const limit = values.l ? Number(values.l) : 1024;
    if (flags.has('r')) {
      // Reverse a plain hex dump back to bytes (only the -p form is supported).
      return eachInput(ctx, rest, (text) => {
        const hex = text.replace(/[^0-9a-fA-F]/g, '');
        const bytes = new Uint8Array(Math.floor(hex.length / 2));
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        ctx.out(new TextDecoder().decode(bytes));
      });
    }
    if (flags.has('p')) {
      return eachInput(ctx, rest, (text) => {
        const hex = [...new TextEncoder().encode(text).slice(0, limit)].map((b) => b.toString(16).padStart(2, '0')).join('');
        ctx.out((hex.match(/.{1,60}/g) ?? ['']).join('\n') + '\n');
      });
    }
    return eachInput(ctx, rest, (text) => {
      const bytes = new TextEncoder().encode(text).slice(0, limit);
      for (let off = 0; off < bytes.length; off += 16) {
        const chunk = bytes.slice(off, off + 16);
        const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0'));
        const groups: string[] = [];
        for (let i = 0; i < 16; i += 2) groups.push((hex[i] ?? '  ') + (hex[i + 1] ?? '  '));
        const ascii = [...chunk].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
        ctx.out(`${off.toString(16).padStart(8, '0')}: ${groups.join(' ')}  ${ascii}\n`);
      }
      if (new TextEncoder().encode(text).length > limit) ctx.out(c.gray(`… (truncated, use -l to see more)\n`));
    });
  },
};

const strings: CommandDef = {
  name: 'strings',
  summary: 'print the sequences of printable characters in files',
  usage: 'strings [-n MIN] FILE...',
  run(ctx) {
    const { values, rest } = getopt(ctx.argv, 'a', 'n');
    const min = Number(values.n ?? 4);
    return eachInput(ctx, rest, (text) => {
      const re = new RegExp(`[\\x20-\\x7e\\t]{${min},}`, 'g');
      for (const m of text.match(re) ?? []) ctx.out(m + '\n');
    });
  },
};

const sha256sum: CommandDef = {
  name: 'sha256sum',
  summary: 'compute SHA256 message digest',
  run(ctx) {
    return eachInput(ctx, ctx.argv, (text, name) => ctx.out(`${sha256(text)}  ${name}\n`));
  },
};

export const textCommands: CommandDef[] = [echo, grep, sort, uniq, cut, tr, rev, base64, xxd, strings, sha256sum];
