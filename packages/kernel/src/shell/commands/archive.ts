// tar, gzip/gunzip/zcat, zip/unzip over the VFS archive format (util/archive.ts).
import { basename, dirname, normalize } from '../../vfs/path';
import { modeString } from '../../vfs/vfs';
import { fsMessage, type CommandContext, type CommandDef } from '../shell';
import { getopt } from '../args';
import { ArchiveError, archiveKind, gunzip, gzip, tar, untar, unzip, zip, zipInfo, type ArchiveEntry } from '../../util/archive';

const read = (ctx: CommandContext, f: string) => ctx.kernel.vfs.readFile(ctx.resolve(f), ctx.cred);

/** Collects files/dirs under `paths` as archive entries (relative to cwd, like tar). */
function collect(ctx: CommandContext, paths: string[], recursive: boolean): ArchiveEntry[] {
  const vfs = ctx.kernel.vfs;
  const out: ArchiveEntry[] = [];
  const walk = (shown: string, abs: string) => {
    const st = vfs.stat(abs, ctx.cred);
    if (st.type === 'dir') {
      out.push({ path: shown, type: 'dir', mode: st.mode, mtime: st.mtime });
      if (!recursive) return;
      for (const e of vfs.readdir(abs, ctx.cred, { silent: true })) walk(`${shown}/${e.name}`, e.path);
    } else out.push({ path: shown, type: 'file', mode: st.mode, mtime: st.mtime, content: vfs.readFile(abs, ctx.cred) });
  };
  for (const p of paths) walk(normalize(p).replace(/^\//, '') || '.', ctx.resolve(p));
  return out;
}

/** Writes entries under `dest`; returns false if something could not be written. */
function extract(ctx: CommandContext, entries: ArchiveEntry[], dest: string, onEntry: (e: ArchiveEntry) => void): boolean {
  const vfs = ctx.kernel.vfs;
  let ok = true;
  for (const e of entries) {
    const target = normalize(`${ctx.resolve(dest)}/${e.path.replace(/^(\.\.\/|\/)+/, '')}`);
    try {
      if (e.type === 'dir') vfs.mkdir(target, ctx.cred, { parents: true });
      else {
        vfs.mkdir(dirname(target), ctx.cred, { parents: true });
        vfs.writeFile(target, e.content ?? '', ctx.cred, { mode: e.mode & 0o777 });
      }
      onEntry(e);
    } catch (err) {
      ctx.err(fsMessage(ctx.name, err, e.path));
      ok = false;
    }
  }
  return ok;
}

const listing = (k: CommandContext['kernel'], e: ArchiveEntry, owner: string) =>
  `${modeString(e.type === 'dir' ? 'dir' : 'file', e.mode)} ${owner}/${owner} ${String(e.content?.length ?? 0).padStart(8)} ${k.time.iso(e.mtime).slice(0, 16).replace('T', ' ')} ${e.path}${e.type === 'dir' ? '/' : ''}\n`;

const tarCmd: CommandDef = {
  name: 'tar',
  summary: 'an archiving utility',
  usage: 'tar -c|-x|-t [-z] [-v] -f ARCHIVE [-C DIR] [FILE]...',
  run(ctx) {
    // Old-style bundled flags: `tar xzf a.tgz` == `tar -xzf a.tgz`.
    const argv = ctx.argv[0] && /^[ctxzvfC]+$/.test(ctx.argv[0]) ? ['-' + ctx.argv[0], ...ctx.argv.slice(1)] : ctx.argv;
    let flags, values, rest;
    try {
      ({ flags, values, rest } = getopt(argv, 'ctxzvjp', 'fC', { create: 'c', extract: 'x', list: 't', gzip: 'z', verbose: 'v', file: 'f', directory: 'C' }));
    } catch (e) {
      ctx.err(`tar: ${(e as Error).message}\n`);
      return 2;
    }
    const mode = ['c', 'x', 't'].filter((m) => flags.has(m));
    if (mode.length !== 1) {
      ctx.err("tar: You must specify one of the '-ctx' options\nTry 'tar --help' for more information.\n");
      return 2;
    }
    const file = values.f;
    if (!file) {
      ctx.err('tar: Refusing to read/write archive from/to the terminal (missing -f option?)\n');
      return 2;
    }
    if (mode[0] === 'c') {
      if (!rest.length) {
        ctx.err('tar: Cowardly refusing to create an empty archive\n');
        return 2;
      }
      try {
        const entries = collect(ctx, rest, true);
        if (flags.has('v')) for (const e of entries) ctx.out(e.path + (e.type === 'dir' ? '/' : '') + '\n');
        const data = tar(entries);
        const gz = flags.has('z') || /\.(tgz|tar\.gz)$/.test(file);
        ctx.kernel.vfs.writeFile(ctx.resolve(file), gz ? gzip(data, basename(file).replace(/\.(tgz|gz)$/, '.tar'), ctx.kernel.now()) : data, ctx.cred);
        return 0;
      } catch (e) {
        ctx.err(fsMessage('tar', e));
        return 2;
      }
    }
    let entries: ArchiveEntry[];
    try {
      let data = read(ctx, file);
      if (archiveKind(data) === 'gzip') data = gunzip(data).content; // tar auto-detects compression
      entries = untar(data);
    } catch (e) {
      ctx.err(e instanceof ArchiveError ? `tar: ${e.message}\ntar: Exiting with failure status due to previous errors\n` : fsMessage('tar', e, file));
      return 2;
    }
    const wanted = rest.length ? entries.filter((e) => rest.some((r) => e.path === r.replace(/\/$/, '') || e.path.startsWith(r.replace(/\/$/, '') + '/'))) : entries;
    if (mode[0] === 't') {
      for (const e of wanted) ctx.out(flags.has('v') ? listing(ctx.kernel, e, ctx.cred.user) : e.path + (e.type === 'dir' ? '/' : '') + '\n');
      return 0;
    }
    return extract(ctx, wanted, values.C ?? '.', (e) => flags.has('v') && ctx.out(e.path + (e.type === 'dir' ? '/' : '') + '\n')) ? 0 : 2;
  },
};

const gzipCmd = (name: 'gzip' | 'gunzip' | 'zcat'): CommandDef => ({
  name,
  summary: name === 'gzip' ? 'compress files' : name === 'gunzip' ? 'decompress files' : 'decompress files to standard output',
  usage: `${name} [-${name === 'gzip' ? 'dkc' : 'kc'}] FILE...`,
  run(ctx) {
    const { flags, rest } = getopt(ctx.argv, 'dkcfvl');
    const decompress = name !== 'gzip' || flags.has('d');
    const toStdout = name === 'zcat' || flags.has('c');
    if (!rest.length) {
      if (ctx.stdin === null) {
        ctx.err(`${name}: compressed data not ${decompress ? 'read from' : 'written to'} a terminal.\n`);
        return 1;
      }
      try {
        ctx.out(decompress ? gunzip(ctx.stdin).content : gzip(ctx.stdin, '', ctx.kernel.now()));
        return 0;
      } catch {
        ctx.err(`${name}: stdin: not in gzip format\n`);
        return 1;
      }
    }
    let status = 0;
    for (const f of rest) {
      const path = ctx.resolve(f);
      try {
        const data = ctx.kernel.vfs.readFile(path, ctx.cred);
        if (decompress) {
          if (archiveKind(data) !== 'gzip') {
            ctx.err(`${name}: ${f}: not in gzip format\n`);
            status = 1;
            continue;
          }
          const { content } = gunzip(data);
          if (toStdout) ctx.out(content);
          else {
            if (!/\.(gz|tgz)$/.test(path)) {
              ctx.err(`${name}: ${f}: unknown suffix -- ignored\n`);
              status = 1;
              continue;
            }
            ctx.kernel.vfs.writeFile(path.replace(/\.gz$/, '').replace(/\.tgz$/, '.tar'), content, ctx.cred);
            if (!flags.has('k')) ctx.kernel.vfs.remove(path, ctx.cred);
          }
        } else {
          const packed = gzip(data, basename(path), ctx.kernel.now());
          if (toStdout) ctx.out(packed);
          else {
            ctx.kernel.vfs.writeFile(`${path}.gz`, packed, ctx.cred);
            if (!flags.has('k')) ctx.kernel.vfs.remove(path, ctx.cred);
          }
        }
      } catch (e) {
        ctx.err(fsMessage(name, e, f));
        status = 1;
      }
    }
    return status;
  },
});

const zipCmd: CommandDef = {
  name: 'zip',
  summary: 'package and compress (archive) files',
  usage: 'zip [-r] [-e | -P PASSWORD] ARCHIVE.zip FILE...',
  async run(ctx) {
    const { flags, values, rest } = getopt(ctx.argv, 'rqe9', 'P');
    if (rest.length < 2) {
      ctx.err('zip error: Nothing to do! (try: zip -r archive.zip folder)\n');
      return 12;
    }
    let password = values.P;
    if (flags.has('e')) {
      const a = await ctx.sh.io.prompt('Enter password: ', { secret: true });
      const b = a === null ? null : await ctx.sh.io.prompt('Verify password: ', { secret: true });
      if (a === null || a !== b) {
        ctx.err('zip error: Invalid command arguments (password verification failed)\n');
        return 16;
      }
      password = a;
    }
    const [archive, ...files] = rest as [string, ...string[]];
    try {
      const entries = collect(ctx, files, flags.has('r'));
      for (const e of entries) if (!flags.has('q')) ctx.out(`  adding: ${e.path}${e.type === 'dir' ? '/' : ''} (deflated 42%)\n`);
      ctx.kernel.vfs.writeFile(ctx.resolve(archive.endsWith('.zip') ? archive : `${archive}.zip`), zip(entries, password), ctx.cred);
      return 0;
    } catch (e) {
      ctx.err(fsMessage('zip', e));
      return 18;
    }
  },
};

const unzipCmd: CommandDef = {
  name: 'unzip',
  summary: 'list, test and extract compressed files in a ZIP archive',
  usage: 'unzip [-l] [-o] [-P PASSWORD] [-d DIR] ARCHIVE.zip',
  async run(ctx) {
    const { flags, values, rest } = getopt(ctx.argv, 'lqotZ', 'Pd');
    const file = rest[0];
    if (!file) {
      ctx.err('UnZip 6.00 of 20 April 2009.\nUsage: unzip [-l] [-o] [-P password] [-d exdir] file[.zip]\n');
      return 10;
    }
    let data: string;
    try {
      data = read(ctx, file);
    } catch {
      ctx.err(`unzip:  cannot find or open ${file}, ${file}.zip or ${file}.ZIP.\n`);
      return 9;
    }
    if (archiveKind(data) !== 'zip') {
      ctx.err(`  End-of-central-directory signature not found.  Either this file is not\n  a zipfile, or it constitutes one disk of a multi-part archive.\nunzip:  cannot find zipfile directory in ${file}.\n`);
      return 9;
    }
    const info = zipInfo(data);
    if (flags.has('l')) {
      ctx.out(`Archive:  ${file}\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n`);
      let total = 0;
      for (const e of info.entries) {
        total += e.size;
        ctx.out(`${String(e.size).padStart(9)}  ${ctx.kernel.time.iso(e.mtime).slice(0, 16).replace('T', ' ')}   ${e.path}${e.type === 'dir' ? '/' : ''}\n`);
      }
      ctx.out(`---------                     -------\n${String(total).padStart(9)}                     ${info.entries.length} file${info.entries.length > 1 ? 's' : ''}\n`);
      return 0;
    }
    ctx.out(`Archive:  ${file}\n`);
    let password = values.P;
    if (info.encrypted && password === undefined) {
      const first = info.entries.find((e) => e.type === 'file')?.path ?? '';
      const answer = await ctx.sh.io.prompt(`[${file}] ${first} password: `, { secret: true });
      if (answer === null) return 1;
      password = answer;
    }
    const entries = unzip(data, password);
    if (!entries) {
      for (const e of info.entries) if (e.type === 'file') ctx.err(`   skipping: ${e.path.padEnd(24)} incorrect password\n`);
      return 82;
    }
    return extract(ctx, entries, values.d ?? '.', (e) => {
      if (!flags.has('q')) ctx.out(e.type === 'dir' ? `   creating: ${e.path}/\n` : `  inflating: ${e.path}\n`);
    })
      ? 0
      : 50;
  },
};

export const archiveCommands: CommandDef[] = [tarCmd, gzipCmd('gzip'), gzipCmd('gunzip'), gzipCmd('zcat'), zipCmd, unzipCmd];
