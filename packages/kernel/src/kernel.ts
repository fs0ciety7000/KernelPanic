import { EventBus } from './events';
import { ROOT, Vfs, type VfsDiff } from './vfs/vfs';
import { dirname, normalize } from './vfs/path';
import { Users } from './users';
import { Shell, type CommandDef, type ShellIO } from './shell/shell';
import { ScenarioRuntime, type ScenarioState } from './scenario/runtime';
import { BUNDLE_FORMAT, type MachineDef, type NetworkDef, type ProcessDef, type ScenarioBundle, type ScriptedCommand } from './scenario/types';
import { Host, machineCommands, SudoTickets, type System } from './host';
import { GameTime, parseOffset } from './util/time';
import { parseMail } from './util/mail';
import { fetchPage, type WebResult } from './web';

export const SAVE_VERSION = 1;

export interface SaveGame {
  version: typeof SAVE_VERSION;
  scenarioId: string;
  scenarioVersion: number;
  vfs: VfsDiff;
  /** Remote machines' changes, by host id. */
  hosts?: Record<string, VfsDiff>;
  scenario: ScenarioState;
  history: string[];
  savedAt: number;
}

/** The game: the workstation (it is itself a System) plus the remote hosts and the scenario runtime. */
export class Kernel implements System {
  readonly id = 'local';
  readonly bus = new EventBus();
  readonly vfs: Vfs;
  readonly users: Users;
  readonly machine: MachineDef;
  readonly time: GameTime;
  readonly commands: Map<string, CommandDef>;
  readonly scripted: Record<string, ScriptedCommand>;
  readonly network: NetworkDef;
  readonly processes: ProcessDef[];
  readonly runtime: ScenarioRuntime;
  readonly sessionUser: string;
  /** Remote machines, by id. */
  readonly hosts = new Map<string, Host>();
  history: string[] = [];
  private scriptedPaths: Map<string, CommandDef>;
  private sudo = new SudoTickets(() => this.now());
  private clockStart: number;

  constructor(readonly bundle: ScenarioBundle, save?: SaveGame, opts: { timed?: boolean } = {}) {
    if (bundle.format !== BUNDLE_FORMAT) throw new Error(`unsupported scenario format ${bundle.format}`);
    this.machine = bundle.machine;
    this.time = new GameTime(parseOffset(bundle.machine.clock));
    this.clockStart = Date.parse(bundle.machine.clock);
    this.sessionUser = bundle.session.user;
    this.users = new Users(bundle.id, bundle.users);
    this.vfs = new Vfs(this.bus, () => this.now());
    this.vfs.mount(bundle.fs);
    this.network = bundle.network;
    this.processes = bundle.processes;
    this.scripted = bundle.commands;
    ({ commands: this.commands, byPath: this.scriptedPaths } = machineCommands(bundle.commands));
    for (const def of bundle.hosts ?? []) this.hosts.set(def.id, new Host(this, def));

    const compatible = save && save.scenarioId === bundle.id && save.scenarioVersion === bundle.version;
    if (compatible) {
      this.vfs.applyDiff(save.vfs);
      for (const [id, diff] of Object.entries(save.hosts ?? {})) this.hosts.get(id)?.vfs.applyDiff(diff);
      this.history = [...save.history];
    }
    this.runtime = new ScenarioRuntime(
      bundle,
      this.bus,
      {
        deliver: (name) => this.deliver(name),
        write: (w) => this.machineFor(w.machine)?.systemWrite(w.path, w.content, w.mode, w.owner, w.append),
        remove: (path, machine) => {
          try {
            this.machineFor(machine)?.vfs.remove(path, ROOT, { recursive: true });
          } catch {
            /* already gone */
          }
        },
        now: () => this.now(),
      },
      compatible ? save.scenario : undefined,
      opts,
    );
  }

  /** Current in-game time (ms since epoch). Advances with play time only. */
  now(): number {
    // runtime is undefined while the constructor mounts the VFS.
    return this.clockStart + (this.runtime?.playtime() ?? 0);
  }

  get kernel(): Kernel {
    return this;
  }

  /** The workstation (no id / "local") or a remote host by id. */
  machineFor(id?: string): System | undefined {
    return !id || id === 'local' ? this : this.hosts.get(id);
  }

  /** Resolves a name/IP to a machine, the way ssh would (workstation included). */
  resolveHost(name: string): System | undefined {
    const n = name.toLowerCase();
    const m = this.machine;
    if ([m.hostname, m.ip, 'localhost', '127.0.0.1', ...(m.domain ? [`${m.hostname}.${m.domain}`] : [])].includes(n)) return this;
    for (const h of this.hosts.values()) if (h.names().includes(n)) return h;
    return undefined;
  }

  createShell(io: ShellIO, opts?: { user?: string; cwd?: string }): Shell {
    return new Shell(this, io, { cwd: this.bundle.session.cwd, ...opts });
  }

  commandByPath(path: string): CommandDef | undefined {
    return this.scriptedPaths.get(normalize(path));
  }

  pushHistory(line: string): void {
    if (this.history[this.history.length - 1] !== line) this.history.push(line);
    if (this.history.length > 500) this.history.shift();
  }

  hasSudoTicket(user: string): boolean {
    return this.sudo.has(user);
  }
  grantSudoTicket(user: string): void {
    this.sudo.grant(user);
  }
  dropSudoTicket(user: string): void {
    this.sudo.drop(user);
  }

  /** Write performed by the system (scenario effects), owned by `owner` (default root). */
  systemWrite(path: string, content: string, mode?: string, owner?: string, append = false): void {
    this.vfs.mkdir(dirname(path), ROOT, { parents: true });
    this.vfs.writeFile(path, content, ROOT, { append });
    if (mode) this.vfs.chmod(path, parseInt(mode, 8), ROOT);
    if (owner) this.vfs.chown(path, owner, owner, ROOT);
  }

  /** Drops a delivery .eml into the session user's Maildir/new. */
  deliver(name: string): string | undefined {
    const raw = this.bundle.deliveries[name];
    if (raw === undefined) return undefined;
    const user = this.users.get(this.sessionUser)!;
    const content = raw.replace(/\{\{date\}\}/g, this.time.rfc2822(this.now()));
    const file = `${user.home}/Maildir/new/${Math.floor(this.now() / 1000)}.${name.replace(/\.eml$/, '')}.${this.machine.hostname}.eml`;
    this.vfs.mkdir(`${user.home}/Maildir/new`, ROOT, { parents: true });
    this.vfs.writeFile(file, content, ROOT, { mode: 0o600 });
    this.vfs.chown(file, user.name, user.name, ROOT);
    const mail = parseMail(content);
    this.bus.emit('mail.delivered', { path: file, subject: mail.subject, from: mail.from });
    return file;
  }

  /** Simulated browser request (see web.ts). */
  fetch(url: string, cred = this.users.cred(this.sessionUser)): WebResult {
    return fetchPage(this, url, cred);
  }

  /** Ask the desktop to open a file or app (terminal `open`, scenario autostart…). */
  open(appId: string | undefined, path?: string): void {
    this.bus.emit('app.open', { appId: appId ?? '', path });
  }

  save(): SaveGame {
    return {
      version: SAVE_VERSION,
      scenarioId: this.bundle.id,
      scenarioVersion: this.bundle.version,
      vfs: this.vfs.diff(),
      ...(this.hosts.size ? { hosts: Object.fromEntries([...this.hosts].map(([id, h]) => [id, h.vfs.diff()])) } : {}),
      scenario: this.runtime.checkpoint(),
      history: [...this.history],
      savedAt: Date.now(),
    };
  }
}
