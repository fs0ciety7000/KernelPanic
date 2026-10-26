import type { Kernel } from '../kernel';
import type { System } from '../host';
import { FsError, type Cred } from '../vfs/vfs';
import { basename, normalize, resolve, tildify } from '../vfs/path';
import { expandWord, globToRegExp, parse, ParseError, tokenize, type SimpleCommand, type Word } from './parser';
import { c } from './ansi';

export interface ShellIO {
  /** Raw text to the terminal; '\n' line endings (the terminal adapter converts). */
  write(text: string): void;
  /** Interactive line input (passwords, confirmations). null = cancelled (Ctrl+C). */
  prompt(question: string, opts?: { secret?: boolean }): Promise<string | null>;
  /** The session asked to close (exit at the base user). */
  exit?(): void;
}

export interface CommandContext {
  name: string;
  argv: string[];
  stdin: string | null;
  out(text: string): void;
  err(text: string): void;
  sh: Shell;
  /** The machine the command runs on (the workstation, or a host reached with ssh). */
  kernel: System;
  cred: Cred;
  /** True when stdout goes straight to the terminal (enables colors). */
  tty: boolean;
  resolve(path: string): string;
}

export interface CommandDef {
  name: string;
  summary: string;
  usage?: string;
  hidden?: boolean;
  run(ctx: CommandContext): number | Promise<number>;
}

export interface ExecOptions {
  cred?: Cred;
  stdin?: string | null;
  out?: (t: string) => void;
  err?: (t: string) => void;
  tty?: boolean;
}

/** Formats an FsError the way coreutils does: "cat: /x: No such file or directory". */
export function fsMessage(cmd: string, e: unknown, path?: string): string {
  if (e instanceof FsError) return `${cmd}: ${path ?? e.path}: ${e.message}\n`;
  return `${cmd}: ${(e as Error).message}\n`;
}

/** One level of the session: `su`/`sudo -i` push a user, `ssh` pushes a machine too. */
interface Frame {
  sys: System;
  user: string;
  /** Set on ssh frames: where to come back on exit. */
  ssh?: { returnCwd: string; returnEnv: Record<string, string> };
}

export class Shell {
  private frames: Frame[];
  cwd: string;
  env: Record<string, string>;
  lastExit = 0;
  /** Stdout sinks of running command substitutions (innermost last). */
  private captures: Array<(t: string) => void> = [];
  private substDepth = 0;

  constructor(
    public game: Kernel,
    public io: ShellIO,
    opts: { user?: string; cwd?: string } = {},
  ) {
    const user = opts.user ?? game.sessionUser;
    this.frames = [{ sys: game, user }];
    this.cwd = opts.cwd ?? game.users.get(user)?.home ?? '/';
    this.env = this.baseEnv(user);
  }

  /** The machine this shell currently runs on. */
  get kernel(): System {
    return this.frames[this.frames.length - 1]!.sys;
  }
  /** Depth of nested ssh sessions (0 = on the workstation). */
  get sshDepth(): number {
    return this.frames.filter((f) => f.ssh).length;
  }

  private baseEnv(user: string): Record<string, string> {
    const u = this.kernel.users.get(user);
    return {
      USER: user,
      LOGNAME: user,
      HOME: u?.home ?? '/',
      SHELL: u?.shell ?? '/bin/bash',
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOSTNAME: this.kernel.machine.hostname,
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      PWD: this.cwd ?? '/',
    };
  }

  get user(): string {
    return this.frames[this.frames.length - 1]!.user;
  }
  get cred(): Cred {
    return this.kernel.users.cred(this.user);
  }
  get home(): string {
    return this.kernel.users.get(this.user)?.home ?? '/';
  }
  get isRoot(): boolean {
    return this.cred.uid === 0;
  }

  pushUser(user: string): void {
    this.frames.push({ sys: this.kernel, user });
    this.env = { ...this.baseEnv(user), PWD: this.cwd };
    if (user === 'root' || this.frames.length > 1) this.chdir(this.home, true);
  }

  /** Opens a login session on another machine (ssh). */
  pushHost(sys: System, user: string): void {
    this.frames.push({ sys, user, ssh: { returnCwd: this.cwd, returnEnv: this.env } });
    this.cwd = sys.users.get(user)?.home ?? '/';
    if (!sys.vfs.exists(this.cwd, this.cred)) this.cwd = '/';
    this.env = this.baseEnv(user);
  }

  /** Returns false when the base session ends. On an ssh frame, returns the host that was left. */
  popUser(): boolean | { left: System } {
    if (this.frames.length <= 1) return false;
    const frame = this.frames.pop()!;
    if (frame.ssh) {
      this.cwd = frame.ssh.returnCwd;
      this.env = frame.ssh.returnEnv;
      return { left: frame.sys };
    }
    this.env = { ...this.baseEnv(this.user), PWD: this.cwd };
    if (!this.kernel.vfs.exists(this.cwd, this.cred)) this.chdir(this.home, true);
    return true;
  }

  chdir(path: string, force = false): void {
    const target = resolve(this.cwd, path, this.home);
    if (!force) {
      const st = this.kernel.vfs.stat(target, this.cred);
      if (st.type !== 'dir') throw new FsError('ENOTDIR', path);
      // Traversal requires +x on the target itself too.
      this.kernel.vfs.readdir(target, { ...this.cred }, { silent: true });
    }
    this.env.OLDPWD = this.cwd;
    this.cwd = target;
    this.env.PWD = target;
  }

  resolve(path: string): string {
    return resolve(this.cwd, path, this.home);
  }

  promptString(): string {
    const root = this.isRoot;
    const host = this.kernel.machine.hostname;
    const where = tildify(this.cwd, this.home);
    const userHost = root ? c.red(`${this.user}@${host}`) : c.green(`${this.user}@${host}`);
    return `${c.bold(userHost)}:${c.cyan(where)}${root ? c.red('#') : '$'} `;
  }

  // ── Execution ───────────────────────────────────────────────────────────

  async run(line: string): Promise<number> {
    const trimmed = line.trim();
    if (!trimmed) return this.lastExit;
    this.kernel.pushHistory(trimmed);
    return this.runLine(trimmed);
  }

  /** Runs a command line without recording it (loops, substitutions). */
  private async runLine(line: string): Promise<number> {
    const loop = line.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.*?)\s*;\s*do\s+(.*?)\s*;?\s*done\s*(?:;\s*(.*))?$/s);
    if (loop) return this.runFor(loop[1]!, loop[2]!, loop[3]!, loop[4]);
    if (/^(for|while|until|if)\b/.test(line)) {
      this.io.write(`bash: only one-line loops are supported: for VAR in WORDS; do COMMANDS; done\n`);
      return (this.lastExit = 2);
    }
    let list;
    try {
      list = parse(line);
    } catch (e) {
      if (e instanceof ParseError) {
        this.io.write(`bash: ${e.message}\n`);
        return (this.lastExit = 2);
      }
      throw e;
    }
    let status = 0;
    let skip = false;
    for (const item of list) {
      if (!skip) {
        status = await this.runPipeline(item.pipeline.commands, line);
        this.lastExit = status;
      }
      skip = (item.next === '&&' && status !== 0) || (item.next === '||' && status === 0);
    }
    return status;
  }

  private async runFor(name: string, words: string, body: string, after?: string): Promise<number> {
    let values: string[];
    try {
      values = [];
      for (const t of tokenize(words)) {
        if (t.kind !== 'word') throw new ParseError(`syntax error near unexpected token \`${t.op}'`);
        values.push(...expandWord(await this.substitute(t.word), this.expandCtx()));
      }
    } catch (e) {
      if (e instanceof ParseError) {
        this.io.write(`bash: ${e.message}\n`);
        return (this.lastExit = 2);
      }
      throw e;
    }
    let status = 0;
    for (const v of values.slice(0, 1000)) {
      this.env[name] = v;
      status = await this.runLine(body);
    }
    if (after?.trim()) status = await this.runLine(after.trim());
    return (this.lastExit = status);
  }

  /** Runs $(…) segments of a word and replaces them by their output (trailing newlines removed). */
  private async substitute(word: Word): Promise<Word> {
    if (!word.some((s) => s.cmd !== undefined)) return word;
    const out: Word = [];
    for (const seg of word) {
      if (seg.cmd === undefined) {
        out.push(seg);
        continue;
      }
      let buf = '';
      if (this.substDepth < 8) {
        this.substDepth++;
        this.captures.push((t) => (buf += t));
        try {
          await this.runLine(seg.cmd.trim());
        } finally {
          this.captures.pop();
          this.substDepth--;
        }
      }
      out.push({ text: buf.replace(/\n+$/, ''), quote: seg.quote === 'double' ? 'double' : 'none', literal: true });
    }
    return out;
  }

  /** Where a command's terminal stdout goes: the screen, or the enclosing $(…). */
  private writeOut(t: string): void {
    const sink = this.captures[this.captures.length - 1];
    if (sink) sink(t);
    else this.io.write(t);
  }

  private async runPipeline(commands: SimpleCommand[], line: string): Promise<number> {
    let stdin: string | null = null;
    let status = 0;
    for (let i = 0; i < commands.length; i++) {
      const last = i === commands.length - 1;
      const res = await this.runSimple(commands[i]!, stdin, last, line);
      stdin = res.stdout;
      status = res.status;
    }
    return status;
  }

  private expandCtx() {
    return {
      env: { ...this.env, '?': String(this.lastExit) },
      home: this.home,
      glob: (p: string) => this.glob(p),
    };
  }

  private async runSimple(
    cmd: SimpleCommand,
    stdin: string | null,
    last: boolean,
    line: string,
  ): Promise<{ stdout: string | null; status: number }> {
    const words: Word[] = [];
    for (const w of cmd.words) words.push(await this.substitute(w));
    const ectx = this.expandCtx();
    const argv = words.flatMap((w) => expandWord(w, ectx));

    // Leading VAR=value assignments.
    while (argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]!)) {
      const a = argv.shift()!;
      const eq = a.indexOf('=');
      this.env[a.slice(0, eq)] = a.slice(eq + 1);
    }

    let outBuf = '';
    let errToOut = false;
    let outFile: { path: string; append: boolean } | null = null;
    let errFile: { path: string; append: boolean } | null = null;
    let errBuf = '';

    for (const r of cmd.redirects) {
      if (r.op === '2>&1') {
        errToOut = true;
        continue;
      }
      const target = expandWord(r.target!, ectx)[0] ?? '';
      const path = this.resolve(target);
      if (r.op === '<') {
        try {
          stdin = this.kernel.vfs.readFile(path, this.cred);
        } catch (e) {
          this.io.write(fsMessage('bash', e, target));
          return { stdout: null, status: 1 };
        }
      } else if (r.op === '>' || r.op === '>>') outFile = { path, append: r.op === '>>' };
      else if (r.op === '2>' || r.op === '2>>') errFile = { path, append: r.op === '2>>' };
      else if (r.op === '&>') {
        outFile = { path, append: false };
        errToOut = true;
      }
    }

    const toTerminal = last && !outFile;
    const out = (t: string) => {
      if (toTerminal) this.writeOut(t);
      else outBuf += t;
    };
    const err = (t: string) => {
      if (errToOut) out(t);
      else if (errFile) errBuf += t;
      else this.io.write(t);
    };

    let status = 0;
    if (argv.length) {
      status = await this.exec(argv, { stdin, out, err, tty: toTerminal }, line);
    }

    const flush = (f: { path: string; append: boolean } | null, data: string) => {
      if (!f || f.path === '/dev/null') return true;
      try {
        this.kernel.vfs.writeFile(f.path, data, this.cred, { append: f.append });
        return true;
      } catch (e) {
        this.io.write(fsMessage('bash', e, tildify(f.path, this.home)));
        return false;
      }
    };
    if (outFile && !flush(outFile, outBuf)) status = 1;
    if (errFile && !flush(errFile, errBuf)) status = 1;

    return { stdout: last ? null : outBuf, status };
  }

  /** Runs one command (already expanded). Used by the pipeline and by sudo. */
  async exec(argv: string[], opts: ExecOptions = {}, line = argv.join(' ')): Promise<number> {
    const [name, ...args] = argv as [string, ...string[]];
    const cred = opts.cred ?? this.cred;
    const out = opts.out ?? ((t: string) => this.writeOut(t));
    const err = opts.err ?? ((t: string) => this.io.write(t));
    let status: number;

    const def = this.lookupCommand(name, cred, err);
    if (typeof def === 'number') {
      status = def;
    } else {
      try {
        status = await def.run({
          name,
          argv: args,
          stdin: opts.stdin ?? null,
          out,
          err,
          sh: this,
          kernel: this.kernel,
          cred,
          tty: opts.tty ?? true,
          resolve: (p) => this.resolve(p),
        });
      } catch (e) {
        err(fsMessage(name, e));
        status = 1;
      }
    }
    this.kernel.bus.emit('cmd.exec', { name: basename(name), argv: args, line, exit: status, user: cred.user });
    return status;
  }

  private lookupCommand(name: string, cred: Cred, err: (t: string) => void): CommandDef | number {
    if (name.includes('/')) {
      const path = this.resolve(name);
      const vfs = this.kernel.vfs;
      try {
        const st = vfs.stat(path, cred);
        if (st.type === 'dir') {
          err(`bash: ${name}: Is a directory\n`);
          return 126;
        }
        const scripted = this.kernel.commandByPath(path);
        if (scripted) return scripted;
        if (!(st.mode & 0o111)) {
          err(`bash: ${name}: Permission denied\n`);
          return 126;
        }
        err(
          `bash: ${name}: ${c.yellow('execution blocked')} — forensic snapshot is read-only for untrusted binaries.\n` +
            `      inspect it instead: ${c.cyan(`cat ${name}`)}, ${c.cyan(`file ${name}`)}, ${c.cyan(`strings ${name}`)}\n`,
        );
        return 126;
      } catch (e) {
        err(fsMessage('bash', e, name));
        return 127;
      }
    }
    const def = this.kernel.commands.get(name);
    if (!def) {
      err(`${name}: command not found\n`);
      return 127;
    }
    return def;
  }

  // ── Globbing & completion ───────────────────────────────────────────────

  glob(pattern: string): string[] {
    const abs = pattern.startsWith('/');
    const parts = pattern.split('/').filter(Boolean);
    let bases = [abs ? '/' : this.cwd];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const next: string[] = [];
      const isGlob = /(^|[^\\])[*?]/.test(part);
      for (const base of bases) {
        if (!isGlob) {
          const p = normalize(`${base}/${part.replace(/\\(.)/g, '$1')}`);
          if (this.kernel.vfs.exists(p, this.cred)) next.push(p);
          continue;
        }
        let entries;
        try {
          entries = this.kernel.vfs.readdir(base, this.cred, { silent: true });
        } catch {
          continue;
        }
        const re = globToRegExp(part);
        for (const e of entries) {
          if (e.hidden && !part.startsWith('.')) continue;
          if (re.test(e.name)) next.push(e.path);
        }
      }
      bases = next;
      if (!bases.length) return [];
    }
    const cwdPrefix = this.cwd === '/' ? '/' : this.cwd + '/';
    return bases.sort().map((p) => (abs ? p : p.startsWith(cwdPrefix) ? p.slice(cwdPrefix.length) : p));
  }

  /** Tab completion for the word under the cursor. */
  complete(line: string): { prefix: string; matches: string[] } {
    const m = line.match(/(\S*)$/);
    const word = m?.[1] ?? '';
    const before = line.slice(0, line.length - word.length);
    const isCommand = !before.trim() || /(\||&&|;|sudo)\s*$/.test(before);

    if (isCommand && !word.includes('/')) {
      const names = [...this.kernel.commands.keys()].filter((n) => n.startsWith(word)).sort();
      return { prefix: word, matches: names };
    }
    const expanded = word.startsWith('~') ? this.home + word.slice(1) : word;
    const dirPart = expanded.includes('/') ? expanded.slice(0, expanded.lastIndexOf('/') + 1) : '';
    const filePart = expanded.slice(dirPart.length);
    const dir = this.resolve(dirPart || '.');
    let entries;
    try {
      entries = this.kernel.vfs.readdir(dir, this.cred, { silent: true });
    } catch {
      return { prefix: word, matches: [] };
    }
    const shownDir = word.slice(0, word.length - filePart.length);
    const matches = entries
      .filter((e) => e.name.startsWith(filePart) && (filePart.startsWith('.') || !e.hidden))
      .map((e) => shownDir + e.name + (e.type === 'dir' ? '/' : ''));
    return { prefix: word, matches };
  }
}

