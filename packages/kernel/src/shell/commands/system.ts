import { ROOT } from '../../vfs/vfs';
import { basename, extname } from '../../vfs/path';
import { c, pad } from '../ansi';
import { getopt } from '../args';
import { fsMessage, type CommandContext, type CommandDef } from '../shell';
import { imageInfo } from '../../util/image';
import { humanSize } from './fs';
import { manPage } from './man';

const whoami: CommandDef = {
  name: 'whoami',
  summary: 'print effective user name',
  run(ctx) {
    ctx.out(ctx.cred.user + '\n');
    return 0;
  },
};

const id: CommandDef = {
  name: 'id',
  summary: 'print real and effective user and group IDs',
  run(ctx) {
    const name = ctx.argv[0] ?? ctx.cred.user;
    const u = ctx.kernel.users.get(name);
    if (!u) {
      ctx.err(`id: '${name}': no such user\n`);
      return 1;
    }
    const gid = (g: string) => (g === name ? u.uid : g === 'sudo' ? 27 : g === 'root' ? 0 : 1000 + (g.length * 37) % 100);
    const groups = ctx.kernel.users.groupsOf(name);
    ctx.out(`uid=${u.uid}(${name}) gid=${u.uid}(${groups[0]}) groups=${groups.map((g) => `${gid(g)}(${g})`).join(',')}\n`);
    return 0;
  },
};

const groups: CommandDef = {
  name: 'groups',
  summary: 'print the groups a user is in',
  run(ctx) {
    ctx.out(ctx.kernel.users.groupsOf(ctx.argv[0] ?? ctx.cred.user).join(' ') + '\n');
    return 0;
  },
};

const hostname: CommandDef = {
  name: 'hostname',
  summary: 'show the system host name',
  run(ctx) {
    const m = ctx.kernel.machine;
    ctx.out((ctx.argv.includes('-f') && m.domain ? `${m.hostname}.${m.domain}` : ctx.argv.includes('-I') ? m.ip : m.hostname) + '\n');
    return 0;
  },
};

const uname: CommandDef = {
  name: 'uname',
  summary: 'print system information',
  run(ctx) {
    const m = ctx.kernel.machine;
    const a = ctx.argv.join('');
    if (a.includes('a')) ctx.out(`Linux ${m.hostname} ${m.kernel} #48-Lumen SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n`);
    else if (a.includes('r')) ctx.out(m.kernel + '\n');
    else if (a.includes('n')) ctx.out(m.hostname + '\n');
    else ctx.out('Linux\n');
    return 0;
  },
};

const date: CommandDef = {
  name: 'date',
  summary: 'print the system date and time',
  run(ctx) {
    const t = ctx.kernel.time;
    const now = ctx.kernel.now();
    const fmt = ctx.argv.find((a) => a.startsWith('+'));
    if (!fmt) ctx.out(t.dateCmd(now) + '\n');
    else {
      const iso = t.iso(now);
      ctx.out(
        fmt
          .slice(1)
          .replace(/%s/g, String(Math.floor(now / 1000)))
          .replace(/%F/g, iso.slice(0, 10))
          .replace(/%T/g, iso.slice(11))
          .replace(/%H/g, iso.slice(11, 13))
          .replace(/%M/g, iso.slice(14, 16))
          .replace(/%Y/g, iso.slice(0, 4)) + '\n',
      );
    }
    return 0;
  },
};

const uptime: CommandDef = {
  name: 'uptime',
  summary: 'tell how long the system has been running',
  run(ctx) {
    const t = ctx.kernel.time;
    const extra = Math.floor(ctx.kernel.runtime.playtime() / 60000);
    const mins = 14 * 60 + 7 + extra;
    ctx.out(` ${t.hms(ctx.kernel.now())} up 3 days, ${Math.floor(mins / 60) % 24}:${String(mins % 60).padStart(2, '0')},  2 users,  load average: 0.41, 0.37, 0.33\n`);
    return 0;
  },
};

const ps: CommandDef = {
  name: 'ps',
  summary: 'report a snapshot of the current processes',
  usage: 'ps [aux]',
  run(ctx) {
    const procs = [...ctx.kernel.bundle.processes, { pid: 31337, user: ctx.cred.user, cmd: 'ps ' + ctx.argv.join(' ') }];
    if (!ctx.argv.length) {
      ctx.out('    PID TTY          TIME CMD\n   4242 pts/0    00:00:00 bash\n  31337 pts/0    00:00:00 ps\n');
      return 0;
    }
    ctx.out('USER         PID %CPU %MEM START   COMMAND\n');
    for (const p of procs) {
      ctx.out(
        `${pad(p.user, 10)} ${pad(String(p.pid), 5, true)} ${pad((p.cpu ?? 0).toFixed(1), 4, true)} ${pad(((p as { mem?: number }).mem ?? 0.1).toFixed(1), 4, true)} ${pad((p as { start?: string }).start ?? '08:12', 7)} ${p.cmd}\n`,
      );
    }
    return 0;
  },
};

const kill: CommandDef = {
  name: 'kill',
  summary: 'send a signal to a process',
  run(ctx) {
    const pid = ctx.argv.find((a) => /^\d+$/.test(a));
    if (!pid) {
      ctx.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid\n');
      return 2;
    }
    ctx.err(`bash: kill: (${pid}) - Operation not permitted: process control is frozen on this forensic snapshot\n`);
    return 1;
  },
};

const env: CommandDef = {
  name: 'env',
  summary: 'print the environment',
  run(ctx) {
    for (const [k, v] of Object.entries(ctx.sh.env).sort()) ctx.out(`${k}=${v}\n`);
    return 0;
  },
};

const exportCmd: CommandDef = {
  name: 'export',
  summary: 'set environment variables',
  run(ctx) {
    if (!ctx.argv.length) {
      for (const [k, v] of Object.entries(ctx.sh.env).sort()) ctx.out(`declare -x ${k}="${v}"\n`);
      return 0;
    }
    for (const a of ctx.argv) {
      const eq = a.indexOf('=');
      if (eq > 0) ctx.sh.env[a.slice(0, eq)] = a.slice(eq + 1);
    }
    return 0;
  },
};

const unset: CommandDef = {
  name: 'unset',
  summary: 'unset variables',
  run(ctx) {
    for (const a of ctx.argv) delete ctx.sh.env[a];
    return 0;
  },
};

const history: CommandDef = {
  name: 'history',
  summary: 'display the command history',
  run(ctx) {
    if (ctx.argv[0] === '-c') {
      ctx.kernel.history = [];
      return 0;
    }
    const h = ctx.kernel.history;
    const n = ctx.argv[0] ? Number(ctx.argv[0]) : h.length;
    h.slice(-n).forEach((l, i) => ctx.out(`${String(h.length - Math.min(n, h.length) + i + 1).padStart(5)}  ${l}\n`));
    return 0;
  },
};

const clear: CommandDef = {
  name: 'clear',
  summary: 'clear the terminal screen',
  run(ctx) {
    ctx.out('\x1b[2J\x1b[3J\x1b[H');
    return 0;
  },
};

const which: CommandDef = {
  name: 'which',
  summary: 'locate a command',
  run(ctx) {
    let status = 0;
    for (const name of ctx.argv) {
      const scripted = ctx.kernel.bundle.commands[name];
      if (scripted?.path) ctx.out(scripted.path + '\n');
      else if (ctx.kernel.commands.has(name)) {
        const sbin = ['sudo', 'ifconfig', 'ip'].includes(name);
        ctx.out(`/usr/${sbin ? 'sbin' : 'bin'}/${name}\n`);
      } else status = 1;
    }
    return status;
  },
};

const exit: CommandDef = {
  name: 'exit',
  summary: 'exit the shell',
  run(ctx) {
    ctx.out('logout\n');
    if (!ctx.sh.popUser()) ctx.sh.io.exit?.();
    return 0;
  },
};

function appendAuthLog(ctx: CommandContext, line: string): void {
  const k = ctx.kernel;
  const stamp = k.time.short(k.now()) + ':' + k.time.hms(k.now()).slice(6);
  try {
    k.vfs.writeFile('/var/log/auth.log', `${stamp} ${k.machine.hostname} ${line}\n`, ROOT, { append: true });
  } catch {
    /* no auth.log in this scenario */
  }
}

async function authenticate(ctx: CommandContext, user: string, label: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pw = await ctx.sh.io.prompt(label, { secret: true });
    if (pw === null) return false;
    if (ctx.kernel.users.verify(user, pw)) return true;
    if (attempt < 3) ctx.err('Sorry, try again.\n');
  }
  ctx.err('sudo: 3 incorrect password attempts\n');
  return false;
}

const sudo: CommandDef = {
  name: 'sudo',
  summary: 'execute a command as another user',
  usage: 'sudo [-i | -s | -l | -k] [COMMAND]',
  async run(ctx) {
    const k = ctx.kernel;
    const user = ctx.cred.user;
    const args = [...ctx.argv];
    if (!args.length) {
      ctx.err('usage: sudo -h | -K | -k | -V\nusage: sudo [-i | -s] [command]\n');
      return 1;
    }
    if (args[0] === '-k' || args[0] === '-K') {
      k.dropSudoTicket(user);
      return 0;
    }
    if (ctx.cred.uid !== 0 && !k.hasSudoTicket(user)) {
      const ok = await authenticate(ctx, user, `[sudo] password for ${user}: `);
      k.bus.emit('auth.sudo', { user, ok });
      if (!ok) {
        appendAuthLog(ctx, `sudo: pam_unix(sudo:auth): authentication failure; logname=${user} uid=1000 euid=0 tty=/dev/pts/0 ruser=${user} rhost=  user=${user}`);
        return 1;
      }
      if (!k.users.canSudo(user)) {
        ctx.err(`${user} is not in the sudoers file.  This incident will be reported.\n`);
        return 1;
      }
      k.grantSudoTicket(user);
    } else if (ctx.cred.uid !== 0) {
      k.bus.emit('auth.sudo', { user, ok: true });
    }
    appendAuthLog(ctx, `sudo:    ${user} : TTY=pts/0 ; PWD=${ctx.sh.cwd} ; USER=root ; COMMAND=${args.join(' ')}`);

    if (args[0] === '-l') {
      ctx.out(`User ${user} may run the following commands on ${k.machine.hostname}:\n    (ALL : ALL) ALL\n`);
      return 0;
    }
    if (args[0] === '-i' || args[0] === '-s' || (args[0] === 'su' && args.length <= 2) || args.join(' ') === 'bash') {
      ctx.sh.pushUser('root');
      return 0;
    }
    if (args[0] === '-u') args.splice(0, 2);
    return ctx.sh.exec(args, { cred: ROOT, stdin: ctx.stdin, out: ctx.out, err: ctx.err, tty: ctx.tty });
  },
};

const su: CommandDef = {
  name: 'su',
  summary: 'run a command with substitute user ID',
  async run(ctx) {
    const target = ctx.argv.filter((a) => a !== '-' && a !== '-l')[0] ?? 'root';
    const k = ctx.kernel;
    if (!k.users.get(target)) {
      ctx.err(`su: user ${target} does not exist or the user entry does not contain all the required fields\n`);
      return 1;
    }
    if (ctx.cred.uid !== 0) {
      const pw = await ctx.sh.io.prompt('Password: ', { secret: true });
      const ok = pw !== null && k.users.verify(target, pw);
      k.bus.emit('auth.su', { user: ctx.cred.user, target, ok });
      if (!ok) {
        ctx.err('su: Authentication failure\n');
        return 1;
      }
    }
    ctx.sh.pushUser(target);
    return 0;
  },
};

const open: CommandDef = {
  name: 'open',
  summary: 'open a file with its default application',
  usage: 'open [-a APP] [FILE]',
  run(ctx) {
    const { values, rest } = getopt(ctx.argv, '', 'a');
    if (!rest.length && values.a) {
      ctx.kernel.open(values.a);
      return 0;
    }
    if (!rest.length) {
      ctx.err('usage: open [-a app] file\n');
      return 1;
    }
    for (const f of rest) {
      const p = ctx.resolve(f);
      try {
        const st = ctx.kernel.vfs.stat(p, ctx.cred);
        if (st.type === 'file') ctx.kernel.vfs.readFile(p, ctx.cred, { silent: true });
        ctx.kernel.open(values.a, p);
      } catch (e) {
        ctx.err(fsMessage(ctx.name, e, f));
        return 1;
      }
    }
    return 0;
  },
};

const edit: (name: string) => CommandDef = (name) => ({
  name,
  summary: 'edit a text file (opens Notes)',
  hidden: name !== 'nano',
  run(ctx) {
    const f = ctx.argv.find((a) => !a.startsWith('-'));
    if (!f) {
      ctx.kernel.open('notes');
      return 0;
    }
    ctx.kernel.open('notes', ctx.resolve(f));
    ctx.out(c.gray(`[opened ${f} in Notes]\n`));
    return 0;
  },
});

const crontab: CommandDef = {
  name: 'crontab',
  summary: 'maintain crontab files for individual users',
  usage: 'crontab [-u user] -l',
  run(ctx) {
    const { flags, values } = getopt(ctx.argv, 'lerih', 'u');
    const user = values.u ?? ctx.cred.user;
    if (values.u && ctx.cred.uid !== 0 && values.u !== ctx.cred.user) {
      ctx.err('must be privileged to use -u\n');
      return 1;
    }
    if (flags.has('e') || flags.has('r')) {
      ctx.err('crontab: modification disabled — this is a forensic snapshot (read-only scheduler)\n');
      return 1;
    }
    if (!flags.has('l')) {
      ctx.err('usage: crontab [-u user] -l\n');
      return 1;
    }
    const path = `/var/spool/cron/crontabs/${user}`;
    if (!ctx.kernel.vfs.exists(path)) {
      ctx.err(`no crontab for ${user}\n`);
      return 1;
    }
    ctx.out(ctx.kernel.vfs.readFile(path, ROOT));
    return 0;
  },
};

const who: CommandDef = {
  name: 'who',
  summary: 'show who is logged on',
  run(ctx) {
    const k = ctx.kernel;
    ctx.out(`${pad(k.sessionUser, 8)} pts/0        ${k.time.iso(Date.parse(k.machine.clock)).slice(0, 16)} (:0)\n`);
    return 0;
  },
};

const last: CommandDef = {
  name: 'last',
  summary: 'show a listing of last logged in users',
  run(ctx) {
    try {
      ctx.out(ctx.kernel.vfs.readFile('/var/log/wtmp', ctx.cred));
      return 0;
    } catch (e) {
      ctx.err(fsMessage('last', e, '/var/log/wtmp'));
      return 1;
    }
  },
};

const exiftool: CommandDef = {
  name: 'exiftool',
  summary: 'read meta information in image files',
  run(ctx) {
    let status = 0;
    for (const f of ctx.argv) {
      try {
        const p = ctx.resolve(f);
        const content = ctx.kernel.vfs.readFile(p, ctx.cred);
        const st = ctx.kernel.vfs.stat(p, ctx.cred);
        if (!['svg', 'png', 'jpg', 'jpeg'].includes(extname(p))) {
          ctx.err(`Error: File format not supported - ${f}\n`);
          status = 1;
          continue;
        }
        const info = imageInfo(content);
        const rows: Array<[string, string]> = [
          ['File Name', basename(p)],
          ['File Size', humanSize(st.size) + (st.size < 1024 ? ' bytes' : 'B')],
          ['File Modification Date/Time', ctx.kernel.time.iso(st.mtime).replace(/-/g, ':')],
          ['MIME Type', info.mime],
        ];
        if (info.width) rows.push(['Image Size', `${info.width}x${info.height}`]);
        if (info.title) rows.push(['Title', info.title]);
        if (info.description) rows.push(['Description', info.description]);
        for (const [k, v] of info.exif) rows.push([k.replace(/([a-z])([A-Z])/g, '$1 $2'), v]);
        for (const [k, v] of rows) ctx.out(`${pad(k, 32)}: ${v}\n`);
      } catch (e) {
        ctx.err(fsMessage('exiftool', e, f));
        status = 1;
      }
    }
    return status;
  },
};

const help: CommandDef = {
  name: 'help',
  summary: 'list available commands',
  run(ctx) {
    const groups: Array<[string, string[]]> = [
      ['Fichiers', ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'find', 'tree', 'file', 'stat', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod']],
      ['Texte', ['grep', 'wc', 'sort', 'uniq', 'cut', 'tr', 'base64', 'xxd', 'strings', 'sha256sum', 'exiftool']],
      ['Système', ['whoami', 'id', 'sudo', 'su', 'ps', 'crontab', 'history', 'date', 'uname', 'who', 'last', 'env', 'export']],
      ['Réseau', ['ifconfig', 'ip', 'netstat', 'ping', 'curl', 'nslookup', 'ssh']],
      ['Bureau', ['open', 'nano', 'clear', 'man', 'help', 'exit']],
    ];
    for (const [title, names] of groups) {
      ctx.out(c.bold(c.cyan(title)) + '\n');
      for (const n of names) {
        const def = ctx.kernel.commands.get(n);
        if (def) ctx.out(`  ${pad(c.green(n), 20)}${c.gray(def.summary)}\n`);
      }
    }
    const scripted = Object.entries(ctx.kernel.bundle.commands);
    if (scripted.length) {
      ctx.out(c.bold(c.magenta('Outils installés')) + '\n');
      for (const [n, d] of scripted) ctx.out(`  ${pad(c.green(n), 20)}${c.gray(d.summary ?? '')}\n`);
    }
    ctx.out(c.gray('\nAstuces : Tab complète, ↑/↓ parcourt l’historique, `man <cmd>` pour le détail, Ctrl+L efface.\n'));
    return 0;
  },
};

const man: CommandDef = {
  name: 'man',
  summary: 'an interface to the system reference manuals',
  run(ctx) {
    const name = ctx.argv[0];
    if (!name) {
      ctx.err('What manual page do you want?\nFor example, try \'man man\'.\n');
      return 1;
    }
    const page = manPage(name, ctx.kernel);
    if (!page) {
      ctx.err(`No manual entry for ${name}\n`);
      return 16;
    }
    ctx.out(page);
    return 0;
  },
};

export const systemCommands: CommandDef[] = [
  whoami, id, groups, hostname, uname, date, uptime, ps, kill, env, { ...env, name: 'printenv' }, exportCmd, unset,
  history, clear, which, exit, { ...exit, name: 'logout' }, sudo, su, open, { ...open, name: 'xdg-open', hidden: true },
  edit('nano'), edit('vi'), edit('vim'), crontab, who, { ...who, name: 'w', hidden: true }, last, exiftool, help, man,
  { ...cat_alias('less'), hidden: true }, { ...cat_alias('more'), hidden: true },
];

function cat_alias(name: string): CommandDef {
  return {
    name,
    summary: 'file perusal filter (non-interactive here)',
    run: (ctx) => ctx.kernel.commands.get('cat')!.run(ctx),
  };
}
