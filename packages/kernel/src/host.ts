// A machine the shell can run on: the workstation (Kernel) or a remote Host reached with ssh (ADR-009).
import type { EventBus } from './events';
import type { Kernel } from './kernel';
import { ROOT, Vfs } from './vfs/vfs';
import { dirname, normalize } from './vfs/path';
import { Users } from './users';
import type { CommandDef } from './shell/shell';
import { makeScripted } from './shell/scripted';
import { builtinCommands } from './shell/commands';
import type { HostDef, MachineDef, NetworkDef, ProcessDef, ScriptedCommand } from './scenario/types';
import type { GameTime } from './util/time';
import type { ScenarioRuntime } from './scenario/runtime';

const SUDO_TICKET_MS = 5 * 60_000;

/** Everything a command may touch. Machine-specific state lives here; game state goes through `kernel`. */
export interface System {
  /** "local" for the workstation, the HostDef id otherwise. */
  readonly id: string;
  readonly kernel: Kernel;
  /** Tagged bus: events emitted on a remote machine carry `machine: id`. */
  readonly bus: EventBus;
  readonly vfs: Vfs;
  readonly users: Users;
  readonly machine: MachineDef;
  readonly network: NetworkDef;
  readonly processes: ProcessDef[];
  readonly commands: Map<string, CommandDef>;
  readonly scripted: Record<string, ScriptedCommand>;
  readonly time: GameTime;
  readonly runtime: ScenarioRuntime;
  /** User whose graphical/ssh session this is (who, mail…). */
  readonly sessionUser: string;
  history: string[];
  now(): number;
  pushHistory(line: string): void;
  commandByPath(path: string): CommandDef | undefined;
  hasSudoTicket(user: string): boolean;
  grantSudoTicket(user: string): void;
  dropSudoTicket(user: string): void;
  systemWrite(path: string, content: string, mode?: string, owner?: string, append?: boolean): void;
  open(appId: string | undefined, path?: string): void;
}

/** Commands of a machine: builtins + its scripted tools (also reachable by absolute path). */
export function machineCommands(scripted: Record<string, ScriptedCommand>) {
  const commands = new Map<string, CommandDef>();
  const byPath = new Map<string, CommandDef>();
  for (const cmd of builtinCommands) commands.set(cmd.name, cmd);
  for (const [name, def] of Object.entries(scripted)) {
    const cmd = makeScripted(name, def);
    commands.set(name, cmd);
    if (def.path) byPath.set(normalize(def.path), cmd);
  }
  return { commands, byPath };
}

export class SudoTickets {
  private tickets = new Map<string, number>();
  constructor(private now: () => number) {}
  has(user: string) {
    return (this.tickets.get(user) ?? 0) > this.now();
  }
  grant(user: string) {
    this.tickets.set(user, this.now() + SUDO_TICKET_MS);
  }
  drop(user: string) {
    this.tickets.delete(user);
  }
}

export class Host implements System {
  readonly bus: EventBus;
  readonly vfs: Vfs;
  readonly users: Users;
  readonly machine: MachineDef;
  readonly network: NetworkDef;
  readonly processes: ProcessDef[];
  readonly commands: Map<string, CommandDef>;
  readonly scripted: Record<string, ScriptedCommand>;
  sessionUser: string;
  private byPath: Map<string, CommandDef>;
  private sudo: SudoTickets;

  constructor(
    readonly kernel: Kernel,
    readonly def: HostDef,
  ) {
    const id = def.id;
    const tagged = { emit: (type: string, payload: object) => kernel.bus.emit(type as never, { ...payload, machine: id } as never) };
    this.bus = tagged as unknown as EventBus;
    this.machine = { ...def.machine, clock: kernel.machine.clock };
    this.network = def.network;
    this.processes = def.processes;
    this.scripted = def.commands;
    this.users = new Users(kernel.bundle.id, def.users);
    this.sessionUser = def.users.find((u) => u.uid >= 1000)?.name ?? 'root';
    this.vfs = new Vfs(this.bus, () => kernel.now());
    this.vfs.mount(def.fs);
    ({ commands: this.commands, byPath: this.byPath } = machineCommands(def.commands));
    this.sudo = new SudoTickets(() => kernel.now());
  }

  get id() {
    return this.def.id;
  }
  get time() {
    return this.kernel.time;
  }
  get runtime() {
    return this.kernel.runtime;
  }
  get history() {
    return this.kernel.history;
  }
  set history(h: string[]) {
    this.kernel.history = h;
  }

  /** Names that resolve to this machine. */
  names(): string[] {
    const m = this.def.machine;
    return [m.hostname, m.ip, ...(m.domain ? [`${m.hostname}.${m.domain}`] : []), ...(this.def.aliases ?? [])].map((n) => n.toLowerCase());
  }

  now() {
    return this.kernel.now();
  }
  pushHistory(line: string) {
    this.kernel.pushHistory(line);
  }
  commandByPath(path: string) {
    return this.byPath.get(normalize(path));
  }
  hasSudoTicket(user: string) {
    return this.sudo.has(user);
  }
  grantSudoTicket(user: string) {
    this.sudo.grant(user);
  }
  dropSudoTicket(user: string) {
    this.sudo.drop(user);
  }
  systemWrite(path: string, content: string, mode?: string, owner?: string, append = false) {
    this.vfs.mkdir(dirname(path), ROOT, { parents: true });
    this.vfs.writeFile(path, content, ROOT, { append });
    if (mode) this.vfs.chmod(path, parseInt(mode, 8), ROOT);
    if (owner) this.vfs.chown(path, owner, owner, ROOT);
  }
  /** The desktop shows the workstation only: remote files must be copied first (scp). */
  open() {}
}
