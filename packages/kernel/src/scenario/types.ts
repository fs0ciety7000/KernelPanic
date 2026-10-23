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
}

export interface ScriptedRule {
  match: string;
  output?: string;
  exit?: number;
  requireRoot?: boolean;
  emit?: string;
  once?: boolean;
  write?: WriteEffect;
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
  | { notify: { title: string; body: string } }
  | { write: WriteEffect }
  | { flag: string }
  | { end: true };

export interface ObjectiveDef {
  id: string;
  title: string;
  description?: string;
  requires?: string[];
  optional?: boolean;
  trigger?: Trigger;
  answer?: AnswerDef;
  hints?: string[];
  onComplete?: Effect[];
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
  machine: MachineDef;
  session: { user: string; cwd?: string; autostart?: Array<{ app: string; path?: string }> };
  users: UserDef[];
  fs: FsEntry[];
  deliveries: Record<string, string>;
  commands: Record<string, ScriptedCommand>;
  processes: ProcessDef[];
  network: NetworkDef;
  objectives: ObjectiveDef[];
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
  file: string;
}
