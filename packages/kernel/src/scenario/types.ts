// Compiled scenario format (output of @kp/scenario-kit, input of the runtime).
// The authoring format (scenario.yaml) is documented in SCENARIO_ENGINE.md.

import type { EventName } from '../events';
import type { FsEntry } from '../vfs/vfs';
import type { UserDef } from '../users';

export const BUNDLE_FORMAT = 1;

export interface MachineDef {
  hostname: string;
  domain?: string;
  os: string;
  kernel: string;
  ip: string;
  /** ISO timestamp of in-game time when the scenario starts. */
  clock: string;
}

export interface ProcessDef {
  pid: number;
  user: string;
  cmd: string;
  cpu?: number;
  mem?: number;
  start?: string;
}

export interface NetworkDef {
  interfaces?: Array<{ name: string; ip: string; mac?: string; netmask?: string }>;
  connections?: Array<{ proto: string; local: string; remote: string; state: string; program?: string }>;
  hosts?: Record<string, { ip?: string; reachable?: boolean; http?: string }>;
}

export interface WriteEffect {
  path: string;
  content: string;
  mode?: string;
  owner?: string;
  /** Append instead of replacing (log lines). */
  append?: boolean;
  /** Host id (default: the workstation). */
  machine?: string;
}

export interface ScriptedRule {
  match: string;
  output?: string;
  exit?: number;
  requireRoot?: boolean;
  emit?: string;
  once?: boolean;
  /** One file or several (e.g. an archive extracted by a scenario tool). */
  write?: WriteEffect | WriteEffect[];
  /** Rule only applies once this scenario flag has been raised… */
  ifFlag?: string;
  /** …or only while it has not. */
  unlessFlag?: string;
}

export interface ScriptedCommand {
  path?: string;
  summary?: string;
  group?: string;
  rules: ScriptedRule[];
  fallback?: string;
}

export interface TriggerLeaf {
  event: EventName;
  where?: Record<string, string | number | boolean>;
  regex?: Record<string, string>;
}
export type Trigger = TriggerLeaf | { any: TriggerLeaf[] };

export interface AnswerDef {
  label: string;
  placeholder?: string;
  /** secretHash(scenarioId, normalized) of every accepted answer. */
  hashes: string[];
  normalize: Array<'trim' | 'lower' | 'nospace'>;
}

export type Effect =
  | { deliver: string }
  /** Start a chat conversation node (an NPC writes to the player). */
  | { chat: string }
  | { notify: { title: string; body: string } }
  | { write: WriteEffect }
  /** Raise a SOC alert (see SocDef). */
  | { alert: string }
  /** Delete a file (evidence destroyed by an NPC, retention…). */
  | { remove: { path: string; machine?: string } }
  | { flag: string }
  | { end: true };

export interface ChoiceOption {
  id: string;
  label: string;
  /** Consequence shown under the option before confirming. */
  detail?: string;
  /** Evidence the player must have found for this option to be available (Orwell-style: you act on what you know). */
  requiresEvidence?: string[];
  /** Flags raised when chosen (in addition to `choice:<objective>:<option>`). */
  flags?: string[];
  onSelect?: Effect[];
}

export interface ChoiceDef {
  prompt: string;
  options: ChoiceOption[];
}

export interface EvidenceDef {
  id: string;
  title: string;
  /** One-line fact, as it would be written in a report. */
  summary: string;
  /** VFS path the player can reopen from the case file. */
  source?: string;
  /** Host id when `source` lives on a remote machine (shown, not opened). */
  machine?: string;
  /** Free label shown as a badge (e.g. "vecteur", "témoin", "contradiction"). */
  tag?: string;
  trigger: Trigger;
}

export interface EndingDef {
  id: string;
  title: string;
  text: string;
  /** All of these flags must be raised… */
  flags?: string[];
  /** …and none of these. An ending with no condition is the default. */
  notFlags?: string[];
  /** Colour of the end screen: success (default), failure, or something in between. */
  tone?: 'good' | 'bad' | 'mixed';
}

// ── Web (simulated browser) ────────────────────────────────────────────

export interface WebPage {
  /** "host/path" without scheme, e.g. "intranet.lumengrid.local/wiki/vpn". */
  key: string;
  title: string;
  html: string;
}

export interface WebRoute {
  /** Regex on "host/path?query" (no scheme). First match wins, before static pages. */
  match: string;
  /** Page key to display instead. */
  page?: string;
  /** Or an inline response. */
  title?: string;
  html?: string;
  /** Raises a scenario flag (form submissions, searches…). */
  emit?: string;
}

export interface WebDef {
  home?: string;
  bookmarks?: Array<{ label: string; url: string }>;
  pages: Record<string, WebPage>;
  routes?: WebRoute[];
  /** host → reason shown on the "blocked by policy" page. */
  blocked?: Record<string, string>;
}

// ── Internal chat ──────────────────────────────────────────────────────

export interface ChatContact {
  id: string;
  name: string;
  role?: string;
  status?: string;
}

export interface ChatMessage {
  /** Contact id, or "me". */
  from: string;
  text: string;
  /** ISO timestamp (pre-existing history) — live messages use game time. */
  at?: string;
}

export interface ChatReply {
  id: string;
  text: string;
  next?: string;
  flags?: string[];
  requiresEvidence?: string[];
  onSelect?: Effect[];
}

export interface ChatNode {
  id: string;
  contact: string;
  /** Fires on its own when this trigger matches (once). Nodes without trigger are reached via `next` or a `chat` effect. */
  trigger?: Trigger;
  messages: string[];
  replies?: ChatReply[];
  onComplete?: Effect[];
}

export interface ChatDef {
  contacts: ChatContact[];
  history?: Record<string, ChatMessage[]>;
  nodes: ChatNode[];
}

export interface ObjectiveDef {
  id: string;
  title: string;
  description?: string;
  requires?: string[];
  optional?: boolean;
  trigger?: Trigger;
  answer?: AnswerDef;
  /** Decision objective: completed by picking an option in the case file. */
  choice?: ChoiceDef;
  hints?: string[];
  onComplete?: Effect[];
}

/** Something that happens at a given game time unless the player prevented it (timed mode, 3.3). */
export interface TimerDef {
  id: string;
  /** ISO game time. */
  at: string;
  /** Shown as a countdown in the taskbar while pending. */
  label?: string;
  /** Only armed when the player chose the timed mode. */
  timedOnly?: boolean;
  /** Defused as soon as one of these flags is raised. */
  unlessFlags?: string[];
  /** Only fires if all these flags are raised by then (chains: propagation from an infected asset…). */
  ifFlags?: string[];
  /** Line shown in the end-of-game replay when it fires (default: label or id). */
  journal?: string;
  /** Fired `before` minutes ahead (notifications, NPC messages…). */
  warnings?: Array<{ before: number; effects: Effect[] }>;
  effects: Effect[];
}

// ── SOC console (live incident response) ───────────────────────────────

/** A machine on the network map. State is read from flags: `infected:<id>` (unless `restored:<id>`), `isolated:<id>`. */
export interface SocAsset {
  id: string;
  name: string;
  ip: string;
  role: string;
  /** Network zone (column on the map). */
  zone?: string;
  /** HostDef id when the player can also ssh into it (isolated = unreachable). */
  host?: string;
  /** What isolating it breaks, shown before confirming. */
  impact?: string;
}

export interface SocAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  asset?: string;
  detail: string;
  /** Raised automatically when this matches (otherwise via an `alert` effect, e.g. from a timer). */
  trigger?: Trigger;
}

export interface SocDef {
  /** Console title, e.g. "SOC — Clinique des Tilleuls". */
  name?: string;
  assets: SocAsset[];
  alerts: SocAlert[];
  /** Zone order on the map (default: order of appearance). */
  zones?: string[];
  /** Wording of the `infected` state on the map (default "compromis"). */
  faultLabel?: string;
}

/** A remote machine reachable with `ssh` (ADR-009). Same building blocks as the local one. */
export interface HostDef {
  /** Stable id, carried by events from this machine as `machine`. */
  id: string;
  /** No clock: every machine shares the scenario's game time. */
  machine: Omit<MachineDef, 'clock'>;
  users: UserDef[];
  fs: FsEntry[];
  commands: Record<string, ScriptedCommand>;
  processes: ProcessDef[];
  network: NetworkDef;
  /** Other names that resolve to this machine (FQDN, DNS aliases). Hostname and IP always do. */
  aliases?: string[];
  ssh?: {
    /** Shown before the password prompt (legal notice…). */
    banner?: string;
    /** Printed after login. */
    motd?: string;
    /** Reachable only from these machine ids ("local" = the player's workstation). Default: everywhere. */
    from?: string[];
  };
}

/** How the case shows up on the Ironveil contract board. */
export interface ContractDef {
  client: string;
  /** Fee in euros (0 = training). */
  fee: number;
}

export interface ScenarioBundle {
  format: typeof BUNDLE_FORMAT;
  id: string;
  version: number;
  title: string;
  subtitle?: string;
  summary?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes?: number;
  locale: string;
  contract?: ContractDef;
  machine: MachineDef;
  session: {
    user: string;
    cwd?: string;
    /** Address shown by the Mail app (default: user@machine domain). */
    email?: string;
    autostart?: Array<{ app: string; path?: string }>;
  };
  users: UserDef[];
  fs: FsEntry[];
  deliveries: Record<string, string>;
  commands: Record<string, ScriptedCommand>;
  processes: ProcessDef[];
  network: NetworkDef;
  /** Remote machines (ssh). */
  hosts?: HostDef[];
  timers?: TimerDef[];
  soc?: SocDef;
  objectives: ObjectiveDef[];
  evidence?: EvidenceDef[];
  web?: WebDef;
  chat?: ChatDef;
  /** Evaluated in order when an `end` effect fires; first match wins, else `outro`. */
  endings?: EndingDef[];
  intro?: { title: string; lines: string[] };
  outro?: { title: string; text: string };
}

export interface ScenarioIndexEntry {
  id: string;
  title: string;
  subtitle?: string;
  summary?: string;
  difficulty: ScenarioBundle['difficulty'];
  estimatedMinutes?: number;
  /** Number of distinct endings (shown as a replay goal). */
  endings?: number;
  /** Offers a timed mode (some timers only fire when it is on). */
  timed?: boolean;
  contract?: ContractDef;
  evidence?: number;
  file: string;
}
