// ssh / scp between the workstation and the scenario's remote hosts (ADR-009).
// Auth is real: a key whose .pub is in the target's authorized_keys, or the account password.
import { ROOT, type Cred } from '../../vfs/vfs';
import { basename, normalize } from '../../vfs/path';
import { getopt } from '../args';
import { fsMessage, type CommandContext, type CommandDef } from '../shell';
import type { Host, System } from '../../host';

interface Dest {
  user?: string;
  host: string;
  path?: string;
}

/** `[user@]host[:path]` — a bare word without ':' is local for scp. */
function parseDest(arg: string): Dest {
  const at = arg.lastIndexOf('@', arg.includes(':') ? arg.indexOf(':') : arg.length);
  const user = at > 0 ? arg.slice(0, at) : undefined;
  const rest = at > 0 ? arg.slice(at + 1) : arg;
  const colon = rest.indexOf(':');
  return colon >= 0 ? { user, host: rest.slice(0, colon), path: rest.slice(colon + 1) } : { user, host: rest };
}

/** Finds the machine behind a name, as seen from the current one. Prints ssh-style errors. */
function reach(ctx: CommandContext, host: string, prog: string): System | null {
  const game = ctx.kernel.kernel;
  const sys = game.resolveHost(host);
  const known = ctx.kernel.network.hosts?.[host];
  if (!sys) {
    if (known) ctx.err(`${prog}: connect to host ${host} port 22: ${known.reachable === false ? 'Connection timed out' : 'Connection refused'}\n`);
    else ctx.err(`${prog}: Could not resolve hostname ${host}: Name or service not known\n`);
    return null;
  }
  if (game.runtime.hostIsolated(sys.id)) {
    ctx.err(`${prog}: connect to host ${host} port 22: No route to host\n`);
    return null;
  }
  const from = (sys as Host).def?.ssh?.from;
  if (from && !from.includes(ctx.kernel.id)) {
    ctx.err(`${prog}: connect to host ${host} port 22: Connection timed out\n`);
    return null;
  }
  return sys;
}

function readSilent(sys: System, path: string, cred: Cred): string | null {
  try {
    return sys.vfs.readFile(path, cred, { silent: true });
  } catch {
    return null;
  }
}

const keyBlob = (line: string) => line.trim().split(/\s+/)[1];

/** Tries public-key auth: a readable private key here whose .pub line is authorized there. */
function keyAuth(ctx: CommandContext, target: System, user: string, identity?: string): boolean {
  const home = ctx.sh.home;
  const candidates = identity ? [ctx.resolve(identity)] : ['id_ed25519', 'id_ecdsa', 'id_rsa'].map((k) => `${home}/.ssh/${k}`);
  const tHome = target.users.get(user)?.home;
  if (!tHome) return false;
  const authorized = (readSilent(target, `${tHome}/.ssh/authorized_keys`, ROOT) ?? '')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map(keyBlob);
  for (const key of candidates) {
    if (!ctx.kernel.vfs.exists(key, ctx.cred)) continue;
    try {
      ctx.kernel.vfs.readFile(key, ctx.cred); // the private key must be readable by us (emits fs.read)
    } catch (e) {
      if (identity) ctx.err(`Load key "${identity}": ${(e as Error).message}\n`);
      continue;
    }
    const pub = readSilent(ctx.kernel, `${key}.pub`, ctx.cred);
    const blob = pub ? keyBlob(pub) : undefined;
    if (blob && authorized.includes(blob)) return true;
  }
  return false;
}

function logAuth(target: System, line: string): void {
  const k = target.kernel;
  const stamp = k.time.short(k.now()) + ':' + k.time.hms(k.now()).slice(6);
  try {
    target.vfs.writeFile('/var/log/auth.log', `${stamp} ${target.machine.hostname} sshd[${2000 + (k.now() % 7000)}]: ${line}\n`, ROOT, { append: true });
  } catch {
    /* no auth.log on this machine */
  }
}

/** Authenticates `user` on `target`. Key first, then up to 3 password prompts. */
async function login(ctx: CommandContext, target: System, host: string, user: string, prog: string, identity?: string): Promise<boolean> {
  const src = ctx.kernel.machine.ip;
  const port = 40000 + (ctx.kernel.now() % 20000);
  const emit = (ok: boolean, method: 'password' | 'key') => ctx.kernel.bus.emit('auth.ssh', { user: ctx.cred.user, login: user, target: target.id, ok, method });
  const exists = !!target.users.get(user);
  if (exists && keyAuth(ctx, target, user, identity)) {
    logAuth(target, `Accepted publickey for ${user} from ${src} port ${port} ssh2`);
    emit(true, 'key');
    return true;
  }
  const banner = (target as Host).def?.ssh?.banner;
  if (banner) ctx.err(banner.replace(/\n?$/, '\n'));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pw = await ctx.sh.io.prompt(`${user}@${host}'s password: `, { secret: true });
    if (pw === null) return false;
    if (exists && target.users.verify(user, pw)) {
      logAuth(target, `Accepted password for ${user} from ${src} port ${port} ssh2`);
      emit(true, 'password');
      return true;
    }
    logAuth(target, `Failed password for ${exists ? '' : 'invalid user '}${user} from ${src} port ${port} ssh2`);
    if (attempt < 3) ctx.err('Permission denied, please try again.\n');
  }
  emit(false, 'password');
  ctx.err(`${user}@${host}: Permission denied (publickey,password).\n`);
  return false;
}

/** First contact: like OpenSSH with StrictHostKeyChecking=accept-new. */
function rememberHost(ctx: CommandContext, host: string, target: System): void {
  const file = `${ctx.sh.home}/.ssh/known_hosts`;
  const known = readSilent(ctx.kernel, file, ctx.cred) ?? '';
  if (known.split('\n').some((l) => l.split(/[\s,]/).includes(host))) return;
  ctx.err(`Warning: Permanently added '${host}' (ED25519) to the list of known hosts.\n`);
  try {
    const fp = [...target.machine.hostname].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36);
    ctx.kernel.vfs.writeFile(file, `${host},${target.machine.ip} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${fp.padEnd(12, 'x')}\n`, ctx.cred, { append: true });
  } catch {
    /* read-only or no ~/.ssh: OpenSSH warns and goes on */
  }
}

const ssh: CommandDef = {
  name: 'ssh',
  summary: 'OpenSSH remote login client',
  usage: 'ssh [-i identity_file] [-p port] [user@]host [command]',
  async run(ctx) {
    // Options stop at the destination: what follows is the remote command, flags included.
    const values: Record<string, string> = {};
    let i = 0;
    for (; i < ctx.argv.length && ctx.argv[i]!.startsWith('-'); i++) {
      const a = ctx.argv[i]!;
      const opt = a[1]!;
      if ('ipl'.includes(opt)) values[opt] = a.slice(2) || ctx.argv[++i] || '';
      else if (!/^-[vqtTAN]+$/.test(a)) {
        ctx.err(`ssh: illegal option -- ${opt}\n`);
        return 255;
      }
    }
    const rest = ctx.argv.slice(i);
    if (!rest.length) {
      ctx.err('usage: ssh [-i identity_file] [-p port] [user@]host [command]\n');
      return 255;
    }
    const dest = parseDest(rest[0]!);
    if (values.p && values.p !== '22') {
      ctx.err(`ssh: connect to host ${dest.host} port ${values.p}: Connection refused\n`);
      return 255;
    }
    const target = reach(ctx, dest.host, 'ssh');
    if (!target) return 255;
    const user = values.l ?? dest.user ?? ctx.cred.user;
    rememberHost(ctx, dest.host, target);
    if (!(await login(ctx, target, dest.host, user, 'ssh', values.i))) return 255;

    const remoteCmd = rest.slice(1);
    ctx.sh.pushHost(target, user);
    if (remoteCmd.length) {
      // `ssh host cmd`: run, print, disconnect (the command line is re-split like a remote shell would).
      const argv = remoteCmd.length === 1 ? remoteCmd[0]!.trim().split(/\s+/) : remoteCmd;
      let status = 255;
      try {
        status = await ctx.sh.exec(argv, { out: ctx.out, err: ctx.err, stdin: ctx.stdin, tty: ctx.tty });
      } finally {
        ctx.sh.popUser();
      }
      return status;
    }
    const k = target.kernel;
    const motd = (target as Host).def?.ssh?.motd;
    ctx.out(`Linux ${target.machine.hostname} ${target.machine.kernel} x86_64\n`);
    if (motd) ctx.out('\n' + motd.replace(/\n?$/, '\n'));
    ctx.out(`\nLast login: ${k.time.dateCmd(k.now() - 86_400_000 * 2).replace(/ [A-Z]{3,4} /, ' ')} from 10.0.0.1\n`);
    return 0;
  },
};

interface Side {
  sys: System;
  cred: Cred;
  path: string;
}

function copyNode(src: Side, dst: Side, recursive: boolean, ctx: CommandContext, display: string): number {
  const st = src.sys.vfs.stat(src.path, src.cred);
  let target = dst.path;
  try {
    if (dst.sys.vfs.stat(target, dst.cred).type === 'dir') target = normalize(`${target}/${basename(src.path)}`);
  } catch {
    /* new file */
  }
  if (st.type === 'dir') {
    if (!recursive) {
      ctx.err(`scp: ${display}: not a regular file\n`);
      return 1;
    }
    dst.sys.vfs.mkdir(target, dst.cred, { parents: false });
    let status = 0;
    for (const e of src.sys.vfs.readdir(src.path, src.cred, { silent: true })) {
      status |= copyNode({ ...src, path: e.path }, { ...dst, path: target }, true, ctx, e.name);
    }
    return status;
  }
  const content = src.sys.vfs.readFile(src.path, src.cred);
  dst.sys.vfs.writeFile(target, content, dst.cred);
  const size = content.length;
  ctx.out(`${basename(src.path).padEnd(40)} 100% ${String(size).padStart(7)}   ${(size / 1024 / 0.3).toFixed(1)}KB/s   00:00\n`);
  return 0;
}

const scp: CommandDef = {
  name: 'scp',
  summary: 'OpenSSH secure file copy',
  usage: 'scp [-r] [-i identity_file] source target',
  async run(ctx) {
    const { flags, values, rest } = getopt(ctx.argv, 'rpqv', 'iP');
    if (rest.length < 2) {
      ctx.err('usage: scp [-r] [-i identity_file] [[user@]host1:]file1 [[user@]host2:]file2\n');
      return 1;
    }
    const [srcArg, dstArg] = [rest[0]!, rest[rest.length - 1]!];
    const side = async (arg: string): Promise<Side | null> => {
      const d = parseDest(arg);
      if (d.path === undefined) return { sys: ctx.kernel, cred: ctx.cred, path: ctx.resolve(arg) };
      const sys = reach(ctx, d.host, 'scp');
      if (!sys) return null;
      const user = d.user ?? ctx.cred.user;
      rememberHost(ctx, d.host, sys);
      if (!(await login(ctx, sys, d.host, user, 'scp', values.i))) return null;
      const home = sys.users.get(user)?.home ?? '/';
      const p = d.path === '' ? home : d.path.startsWith('/') ? d.path : `${home}/${d.path.replace(/^~\/?/, '')}`;
      return { sys, cred: sys.users.cred(user), path: normalize(p) };
    };
    const src = await side(srcArg);
    if (!src) return 1;
    const dst = await side(dstArg);
    if (!dst) return 1;
    try {
      return copyNode(src, dst, flags.has('r'), ctx, srcArg);
    } catch (e) {
      ctx.err(fsMessage('scp', e));
      return 1;
    }
  },
};

export const remoteCommands: CommandDef[] = [ssh, scp];
