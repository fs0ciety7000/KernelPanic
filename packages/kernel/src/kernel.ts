import { EventBus } from './events';
import { ROOT, Vfs, type VfsDiff } from './vfs/vfs';
import { dirname, normalize } from './vfs/path';
import { Users } from './users';
import { Shell, type CommandDef, type ShellIO } from './shell/shell';
import { makeScripted } from './shell/scripted';
import { builtinCommands } from './shell/commands';
import { ScenarioRuntime, type ScenarioState } from './scenario/runtime';
import { BUNDLE_FORMAT, type MachineDef, type ScenarioBundle } from './scenario/types';
import { GameTime, parseOffset } from './util/time';
import { parseMail } from './util/mail';
import { fetchPage, type WebResult } from './web';

export const SAVE_VERSION = 1;

export interface SaveGame {
  version: typeof SAVE_VERSION;
  scenarioId: string;
  scenarioVersion: number;
  vfs: VfsDiff;
  scenario: ScenarioState;
  history: string[];
  savedAt: number;
}

const SUDO_TICKET_MS = 5 * 60_000;

export class Kernel {
  readonly bus = new EventBus();
  readonly vfs: Vfs;
  readonly users: Users;
  readonly machine: MachineDef;
  readonly time: GameTime;
  readonly commands = new Map<string, CommandDef>();
  readonly runtime: ScenarioRuntime;
  readonly sessionUser: string;
  history: string[] = [];
  /** user → game-time ms until which sudo won't ask for a password. */
  private sudoTickets = new Map<string, number>();
  private scriptedPaths = new Map<string, CommandDef>();
  private clockStart: number;

  constructor(readonly bundle: ScenarioBundle, save?: SaveGame) {
    if (bundle.format !== BUNDLE_FORMAT) throw new Error(`unsupported scenario format ${bundle.format}`);
    this.machine = bundle.machine;
    this.time = new GameTime(parseOffset(bundle.machine.clock));
    this.clockStart = Date.parse(bundle.machine.clock);
    this.sessionUser = bundle.session.user;
    this.users = new Users(bundle.id, bundle.users);
    this.vfs = new Vfs(this.bus, () => this.now());
    this.vfs.mount(bundle.fs);

    for (const cmd of builtinCommands) this.commands.set(cmd.name, cmd);
    for (const [name, def] of Object.entries(bundle.commands)) {
      const cmd = makeScripted(name, def);
      this.commands.set(name, cmd);
      if (def.path) this.scriptedPaths.set(normalize(def.path), cmd);
    }

    const compatible = save && save.scenarioId === bundle.id && save.scenarioVersion === bundle.version;
    if (compatible) {
      this.vfs.applyDiff(save.vfs);
      this.history = [...save.history];
    }
    this.runtime = new ScenarioRuntime(
      bundle,
      this.bus,
      {
        deliver: (name) => this.deliver(name),
        write: (path, content, mode, owner) => this.systemWrite(path, content, mode, owner),
        now: () => this.now(),
      },
      compatible ? save.scenario : undefined,
    );
  }

  /** Current in-game time (ms since epoch). Advances with play time only. */
  now(): number {
    // runtime is undefined while the constructor mounts the VFS.
    return this.clockStart + (this.runtime?.playtime() ?? 0);
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
    return (this.sudoTickets.get(user) ?? 0) > this.now();
  }
  grantSudoTicket(user: string): void {
    this.sudoTickets.set(user, this.now() + SUDO_TICKET_MS);
  }
  dropSudoTicket(user: string): void {
    this.sudoTickets.delete(user);
  }

  /** Write performed by the system (scenario effects), owned by `owner` (default root). */
  systemWrite(path: string, content: string, mode?: string, owner?: string): void {
    this.vfs.mkdir(dirname(path), ROOT, { parents: true });
    this.vfs.writeFile(path, content, ROOT);
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
      scenario: this.runtime.checkpoint(),
      history: [...this.history],
      savedAt: Date.now(),
    };
  }
}
