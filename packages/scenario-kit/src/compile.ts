// scenario.yaml + fs/ + deliveries/  →  ScenarioBundle (JSON)
// Authoring reference: SCENARIO_ENGINE.md

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  BUNDLE_FORMAT,
  secretHash,
  normalizeAnswer,
  type ScenarioBundle,
  type FsEntry,
  type ObjectiveDef,
  type Trigger,
  type TriggerLeaf,
  type UserDef,
  type ScriptedCommand,
  type Effect,
  type ScenarioIndexEntry,
} from '@kp/kernel';

const BINARY_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const KNOWN_EVENTS = new Set([
  'fs.read', 'fs.write', 'fs.list', 'cmd.exec', 'auth.sudo', 'auth.su', 'mail.open', 'image.open',
  'app.open', 'scenario.flag', 'objective.complete',
]);

export class ScenarioError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
  }
}

interface RawPermission {
  path: string;
  owner?: string;
  group?: string;
  mode?: string;
  mtime?: string;
}

interface RawObjective extends Omit<ObjectiveDef, 'answer'> {
  answer?: { label: string; placeholder?: string; accept: string[]; normalize?: Array<'trim' | 'lower' | 'nospace'> };
}

interface RawScenario extends Omit<ScenarioBundle, 'format' | 'fs' | 'deliveries' | 'users' | 'objectives'> {
  users: Array<UserDef & { password?: string }>;
  permissions?: RawPermission[];
  defaults?: { mtime?: string };
  objectives: RawObjective[];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(full + '/');
      out.push(...walk(full));
    } else out.push(full);
  }
  return out;
}

const toPosix = (p: string) => '/' + p.split(/[\\/]/).filter(Boolean).join('/');

function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return path === base || path.startsWith(base + '/');
  }
  return pattern === path;
}

export function compileScenario(dir: string): ScenarioBundle {
  const problems: string[] = [];
  const manifestPath = join(dir, 'scenario.yaml');
  if (!existsSync(manifestPath)) throw new ScenarioError([`${dir}: missing scenario.yaml`]);
  const raw = parseYaml(readFileSync(manifestPath, 'utf8')) as RawScenario;

  for (const key of ['id', 'title', 'machine', 'session', 'users', 'objectives'] as const) {
    if (!raw[key]) problems.push(`missing required field '${key}'`);
  }
  if (problems.length) throw new ScenarioError(problems);
  if (!/^[a-z0-9-]+$/.test(raw.id)) problems.push(`id '${raw.id}' must be kebab-case`);
  if (Number.isNaN(Date.parse(raw.machine.clock))) problems.push(`machine.clock is not a valid ISO date`);

  const users: UserDef[] = raw.users.map(({ password, ...u }) => ({
    ...u,
    groups: u.groups ?? [],
    passwordHash: password ? secretHash(raw.id, password) : undefined,
  }));
  const userNames = new Set(users.map((u) => u.name));
  if (!userNames.has(raw.session.user)) problems.push(`session.user '${raw.session.user}' is not declared in users`);

  // ── Filesystem ────────────────────────────────────────────────────────
  const fsDir = join(dir, 'fs');
  const defaultMtime = Date.parse(raw.defaults?.mtime ?? raw.machine.clock) - (raw.defaults?.mtime ? 0 : 3 * 86400_000);
  const perms = raw.permissions ?? [];
  const homeOwner = (path: string) => {
    const m = path.match(/^\/home\/([^/]+)/) ?? (path.startsWith('/root') ? [null, 'root'] : null);
    return m && userNames.has(m[1]!) ? m[1]! : 'root';
  };
  const entries = new Map<string, FsEntry>();
  const addEntry = (path: string, type: 'file' | 'dir', content?: string) => {
    const owner = homeOwner(path);
    const isHome = /^\/home\/[^/]+$/.test(path) || path === '/root';
    const entry: FsEntry = {
      path,
      type,
      mode: type === 'dir' ? (isHome ? 0o750 : 0o755) : 0o644,
      owner,
      group: owner,
      mtime: defaultMtime,
      content,
    };
    if (path === '/tmp') entry.mode = 0o1777;
    for (const p of perms) {
      if (!matches(p.path, path)) continue;
      // A recursive rule's mode applies to files; directories keep +x so they stay traversable.
      if (p.mode) {
        const m = parseInt(p.mode, 8);
        entry.mode = p.path.endsWith('/**') && type === 'dir' ? m | ((m & 0o444) >> 2) : m;
      }
      if (p.owner) entry.owner = p.owner;
      if (p.group ?? p.owner) entry.group = p.group ?? p.owner!;
      if (p.mtime) entry.mtime = Date.parse(p.mtime);
    }
    entries.set(path, entry);
  };

  if (!existsSync(fsDir)) problems.push('missing fs/ directory');
  else {
    for (const full of walk(fsDir)) {
      const rel = toPosix(relative(fsDir, full));
      if (full.endsWith('/')) {
        addEntry(rel, 'dir');
        continue;
      }
      if (rel.endsWith('/.gitkeep')) continue;
      const mime = BINARY_MIME[extname(full).toLowerCase()];
      const content = mime
        ? `data:${mime};base64,${readFileSync(full).toString('base64')}`
        : readFileSync(full, 'utf8');
      addEntry(rel, 'file', content);
    }
  }
  for (const p of perms) {
    const base = p.path.replace(/\/\*\*$/, '');
    if (!entries.has(base)) problems.push(`permissions: '${p.path}' does not exist in fs/`);
  }
  for (const u of users) {
    if (!entries.has(u.home)) problems.push(`user ${u.name}: home ${u.home} missing from fs/`);
  }

  // ── Deliveries ────────────────────────────────────────────────────────
  const deliveries: Record<string, string> = {};
  const delDir = join(dir, 'deliveries');
  if (existsSync(delDir)) {
    for (const name of readdirSync(delDir).filter((n) => n.endsWith('.eml'))) {
      deliveries[name] = readFileSync(join(delDir, name), 'utf8');
    }
  }

  // ── Commands ──────────────────────────────────────────────────────────
  const commands: Record<string, ScriptedCommand> = raw.commands ?? {};
  for (const [name, cmd] of Object.entries(commands)) {
    if (!cmd.rules?.length) problems.push(`command ${name}: needs at least one rule`);
    for (const r of cmd.rules ?? []) {
      try {
        new RegExp(r.match);
      } catch {
        problems.push(`command ${name}: invalid regex ${r.match}`);
      }
    }
  }
  const flags = new Set(Object.values(commands).flatMap((c) => c.rules.map((r) => r.emit).filter(Boolean) as string[]));

  // ── Objectives ────────────────────────────────────────────────────────
  const ids = new Set<string>();
  const checkEffects = (o: RawObjective, fx: Effect[]) => {
    for (const e of fx) {
      if ('deliver' in e && !deliveries[e.deliver]) problems.push(`objective ${o.id}: delivery '${e.deliver}' not found in deliveries/`);
      if ('flag' in e) flags.add(e.flag);
    }
  };
  const leaves = (t: Trigger): TriggerLeaf[] => ('any' in t ? t.any : [t]);
  for (const o of raw.objectives) {
    if (ids.has(o.id)) problems.push(`duplicate objective id '${o.id}'`);
    ids.add(o.id);
    checkEffects(o, o.onComplete ?? []);
  }
  const objectives: ObjectiveDef[] = raw.objectives.map((o) => {
    if (!o.trigger && !o.answer) problems.push(`objective ${o.id}: needs a trigger or an answer`);
    for (const r of o.requires ?? []) if (!ids.has(r)) problems.push(`objective ${o.id}: requires unknown '${r}'`);
    for (const leaf of o.trigger ? leaves(o.trigger) : []) {
      if (!KNOWN_EVENTS.has(leaf.event)) problems.push(`objective ${o.id}: unknown event '${leaf.event}'`);
      const p = leaf.where?.path;
      if (typeof p === 'string' && !entries.has(p)) problems.push(`objective ${o.id}: trigger path '${p}' not in fs/`);
      if (leaf.event === 'scenario.flag' && !flags.has(String(leaf.where?.id))) {
        problems.push(`objective ${o.id}: flag '${leaf.where?.id}' is never emitted`);
      }
      for (const re of Object.values(leaf.regex ?? {})) {
        try {
          new RegExp(re);
        } catch {
          problems.push(`objective ${o.id}: invalid regex ${re}`);
        }
      }
    }
    const { answer, ...rest } = o;
    if (!answer) return rest;
    if (!answer.accept?.length) problems.push(`objective ${o.id}: answer.accept is empty`);
    const normalize = answer.normalize ?? ['trim', 'lower'];
    return {
      ...rest,
      answer: {
        label: answer.label,
        placeholder: answer.placeholder,
        normalize,
        hashes: [...new Set(answer.accept.map((a) => secretHash(raw.id, normalizeAnswer(String(a), normalize))))],
      },
    };
  });

  // Dependency cycles
  const visiting = new Set<string>();
  const done = new Set<string>();
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const visit = (id: string, trail: string[]) => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      problems.push(`objective dependency cycle: ${[...trail, id].join(' → ')}`);
      return;
    }
    visiting.add(id);
    for (const r of byId.get(id)?.requires ?? []) visit(r, [...trail, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const o of objectives) visit(o.id, []);
  if (!objectives.some((o) => o.onComplete?.some((e) => 'end' in e))) problems.push('no objective ends the scenario (onComplete: [{ end: true }])');

  if (problems.length) throw new ScenarioError(problems.map((p) => `${raw.id}: ${p}`));

  return {
    format: BUNDLE_FORMAT,
    id: raw.id,
    version: raw.version ?? 1,
    title: raw.title,
    subtitle: raw.subtitle,
    summary: raw.summary,
    difficulty: raw.difficulty ?? 'beginner',
    estimatedMinutes: raw.estimatedMinutes,
    locale: raw.locale ?? 'fr',
    machine: raw.machine,
    session: raw.session,
    users,
    fs: [...entries.values()],
    deliveries,
    commands,
    processes: raw.processes ?? [],
    network: raw.network ?? {},
    objectives,
    intro: raw.intro,
    outro: raw.outro,
  };
}

export function indexEntry(b: ScenarioBundle): ScenarioIndexEntry {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    summary: b.summary,
    difficulty: b.difficulty,
    estimatedMinutes: b.estimatedMinutes,
    file: `${b.id}.json`,
  };
}

/** Every sub-directory containing a scenario.yaml. */
export function findScenarios(root: string): string[] {
  return readdirSync(root)
    .map((n) => join(root, n))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'scenario.yaml')))
    .sort();
}
