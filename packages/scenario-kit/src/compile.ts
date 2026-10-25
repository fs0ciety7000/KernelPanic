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
  type EvidenceDef,
  type EndingDef,
  type WebDef,
  type WebPage,
  type ChatDef,
  type HostDef,
  type ArchiveEntry,
  gzip,
  tar,
  zip,
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
  'app.open', 'scenario.flag', 'objective.complete', 'evidence.found', 'choice.made',
  'web.visit', 'chat.message', 'chat.reply', 'auth.ssh', 'soc.alert', 'soc.triage', 'soc.action',
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

type RawUser = UserDef & { password?: string };

/** Archive options by VFS path, e.g. `/srv/backup/hr.zip: { password: … }`. */
type RawArchives = Record<string, { password?: string }>;

interface RawHost extends Omit<HostDef, 'fs' | 'users' | 'commands' | 'processes' | 'network'> {
  users: RawUser[];
  archives?: RawArchives;
  permissions?: RawPermission[];
  defaults?: { mtime?: string };
  commands?: Record<string, ScriptedCommand>;
  processes?: HostDef['processes'];
  network?: HostDef['network'];
}

interface RawScenario extends Omit<ScenarioBundle, 'format' | 'fs' | 'deliveries' | 'users' | 'objectives' | 'evidence' | 'endings' | 'web' | 'chat' | 'hosts'> {
  hosts?: RawHost[];
  archives?: RawArchives;
  evidence?: EvidenceDef[];
  endings?: EndingDef[];
  web?: Omit<WebDef, 'pages'>;
  chat?: ChatDef;
  users: RawUser[];
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

  const local = buildMachine(dir, 'fs', raw.id, raw.users, raw.permissions ?? [], raw.defaults, raw.machine.clock, problems, '', raw.archives);
  const { users, entries } = local;
  if (!users.some((u) => u.name === raw.session.user)) problems.push(`session.user '${raw.session.user}' is not declared in users`);

  // ── Remote hosts (ADR-009): hosts/<id>/ holds each machine's files ──────
  const hostEntries = new Map<string, Map<string, FsEntry>>();
  const hosts: HostDef[] = (raw.hosts ?? []).map((h) => {
    const label = `host ${h.id}: `;
    if (!/^[a-z0-9-]+$/.test(h.id ?? '')) problems.push(`${label}id must be kebab-case`);
    if (h.id === 'local' || hostEntries.has(h.id)) problems.push(`${label}duplicate or reserved id`);
    if (!h.machine?.hostname || !h.machine.ip) problems.push(`${label}machine needs hostname and ip`);
    const m = buildMachine(dir, join('hosts', h.id), raw.id, h.users ?? [], h.permissions ?? [], h.defaults, raw.machine.clock, problems, label, h.archives);
    hostEntries.set(h.id, m.entries);
    checkCommands(h.commands ?? {}, problems, label);
    const { permissions: _p, defaults: _d, users: _u, archives: _a, ...rest } = h;
    return { ...rest, users: m.users, fs: [...m.entries.values()], commands: h.commands ?? {}, processes: h.processes ?? [], network: h.network ?? {} };
  });
  for (const h of hosts) {
    for (const id of h.ssh?.from ?? []) if (id !== 'local' && !hostEntries.has(id)) problems.push(`host ${h.id}: ssh.from references unknown host '${id}'`);
  }
  /** Does `path` exist on the machine an event/evidence refers to? */
  const pathExists = (path: string, machine?: unknown) =>
    machine === undefined ? entries.has(path) : hostEntries.get(String(machine))?.has(path) ?? false;

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
  checkCommands(commands, problems, '');
  const flags = new Set(
    [commands, ...hosts.map((h) => h.commands)].flatMap((cmds) => Object.values(cmds).flatMap((c) => c.rules.map((r) => r.emit).filter(Boolean) as string[])),
  );

  // ── SOC console: assets, alerts; player actions raise isolated:/triage:/blocked: flags ──
  const soc = raw.soc;
  const assetIds = new Set<string>();
  const alertIds = new Set<string>();
  if (soc) {
    for (const a of soc.assets ?? []) {
      if (assetIds.has(a.id)) problems.push(`soc: duplicate asset '${a.id}'`);
      assetIds.add(a.id);
      if (!a.name || !a.ip) problems.push(`soc asset ${a.id}: needs name and ip`);
      if (a.host && !hostEntries.has(a.host)) problems.push(`soc asset ${a.id}: unknown host '${a.host}'`);
      flags.add(`isolated:${a.id}`);
    }
    for (const al of soc.alerts ?? []) {
      if (alertIds.has(al.id)) problems.push(`soc: duplicate alert '${al.id}'`);
      alertIds.add(al.id);
      if (al.asset && !assetIds.has(al.asset)) problems.push(`soc alert ${al.id}: unknown asset '${al.asset}'`);
      if (!['low', 'medium', 'high', 'critical'].includes(al.severity)) problems.push(`soc alert ${al.id}: bad severity '${al.severity}'`);
      for (const leaf of al.trigger ? ('any' in al.trigger ? al.trigger.any : [al.trigger]) : []) {
        if (!KNOWN_EVENTS.has(leaf.event)) problems.push(`soc alert ${al.id}: unknown event '${leaf.event}'`);
      }
      flags.add(`triage:${al.id}:real`);
      flags.add(`triage:${al.id}:false`);
    }
  }
  /** blocked:<ip> is raised by the player's firewall; any valid IPv4 counts. */
  const raised = (f: string) => flags.has(f) || (!!soc && /^blocked:\d{1,3}(\.\d{1,3}){3}$/.test(f));

  // ── Web: web/<host>/<path>.html (index.html = folder) + scenario.yaml `web:` ──
  const pages: Record<string, WebPage> = {};
  const webDir = join(dir, 'web');
  if (existsSync(webDir)) {
    for (const full of walk(webDir).filter((f) => !f.endsWith('/') && /\.html?$/.test(f))) {
      const rel = relative(webDir, full).split(/[\\/]/);
      const host = rel.shift()!.toLowerCase();
      const path = rel.join('/').replace(/\.html?$/, '').replace(/(^|\/)index$/, '');
      const key = `${host}/${path}`;
      const html = readFileSync(full, 'utf8');
      const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
      if (!title) problems.push(`web: ${host}/${rel.join('/')} has no <title>`);
      if (/<script\b/i.test(html)) problems.push(`web: ${key} contains <script> — pages are rendered without scripts`);
      pages[key] = { key, title: title ?? key, html };
    }
  }
  for (const r of raw.web?.routes ?? []) {
    try {
      new RegExp(r.match);
    } catch {
      problems.push(`web route: invalid regex ${r.match}`);
    }
    if (r.page && !pages[r.page]) problems.push(`web route ${r.match}: page '${r.page}' not found in web/`);
    if (!r.page && !r.html) problems.push(`web route ${r.match}: needs page or html`);
    if (r.emit) flags.add(r.emit);
  }
  const web: WebDef | undefined = Object.keys(pages).length || raw.web ? { ...raw.web, pages } : undefined;

  // ── Chat ──────────────────────────────────────────────────────────────
  const chat = raw.chat;
  if (chat) {
    const contacts = new Set(chat.contacts.map((c) => c.id));
    const nodeIds = new Set(chat.nodes.map((n) => n.id));
    for (const c of Object.keys(chat.history ?? {})) if (!contacts.has(c)) problems.push(`chat history: unknown contact '${c}'`);
    for (const n of chat.nodes) {
      if (!contacts.has(n.contact)) problems.push(`chat node ${n.id}: unknown contact '${n.contact}'`);
      if (!n.messages?.length) problems.push(`chat node ${n.id}: needs messages`);
      for (const r of n.replies ?? []) {
        if (r.next && !nodeIds.has(r.next)) problems.push(`chat node ${n.id}: reply '${r.id}' → unknown node '${r.next}'`);
        for (const f of r.flags ?? []) flags.add(f);
      }
    }
  }

  // ── Objectives ────────────────────────────────────────────────────────
  const evidenceIds = new Set((raw.evidence ?? []).map((e) => e.id));
  for (const o of raw.objectives) {
    for (const opt of o.choice?.options ?? []) {
      flags.add(`choice:${o.id}:${opt.id}`);
      for (const f of opt.flags ?? []) flags.add(f);
    }
  }
  const ids = new Set<string>();
  const checkEffects = (o: RawObjective, fx: Effect[]) => {
    for (const e of fx) {
      if ('deliver' in e && !deliveries[e.deliver]) problems.push(`objective ${o.id}: delivery '${e.deliver}' not found in deliveries/`);
      if ('flag' in e) flags.add(e.flag);
    }
  };
  const leaves = (t: Trigger): TriggerLeaf[] => ('any' in t ? t.any : [t]);
  const checkMachine = (m: unknown, what: string) => {
    if (m !== undefined && !hostEntries.has(String(m))) problems.push(`${what}: unknown machine '${m}' (declare it in hosts:)`);
  };
  for (const o of raw.objectives) {
    if (ids.has(o.id)) problems.push(`duplicate objective id '${o.id}'`);
    ids.add(o.id);
    checkEffects(o, o.onComplete ?? []);
    for (const opt of o.choice?.options ?? []) checkEffects(o, opt.onSelect ?? []);
  }
  const objectives: ObjectiveDef[] = raw.objectives.map((o) => {
    if (!o.trigger && !o.answer && !o.choice) problems.push(`objective ${o.id}: needs a trigger, an answer or a choice`);
    if (o.choice) {
      const optIds = new Set<string>();
      if (!o.choice.options?.length) problems.push(`objective ${o.id}: choice has no options`);
      for (const opt of o.choice.options ?? []) {
        if (optIds.has(opt.id)) problems.push(`objective ${o.id}: duplicate option '${opt.id}'`);
        optIds.add(opt.id);
        for (const ev of opt.requiresEvidence ?? []) {
          if (!evidenceIds.has(ev)) problems.push(`objective ${o.id}: option '${opt.id}' requires unknown evidence '${ev}'`);
        }
      }
      if (!o.choice.options?.some((opt) => !opt.requiresEvidence?.length)) {
        problems.push(`objective ${o.id}: at least one option must need no evidence (the player can always decide)`);
      }
    }
    for (const r of o.requires ?? []) if (!ids.has(r)) problems.push(`objective ${o.id}: requires unknown '${r}'`);
    for (const leaf of o.trigger ? leaves(o.trigger) : []) {
      if (!KNOWN_EVENTS.has(leaf.event)) problems.push(`objective ${o.id}: unknown event '${leaf.event}'`);
      const p = leaf.where?.path;
      if (typeof p === 'string' && !pathExists(p, leaf.where?.machine)) problems.push(`objective ${o.id}: trigger path '${p}' not in ${leaf.where?.machine ? `hosts/${leaf.where.machine}/` : 'fs/'}`);
      checkMachine(leaf.where?.machine, `objective ${o.id}`);
      if (leaf.event === 'scenario.flag' && !raised(String(leaf.where?.id))) {
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

  // Evidence & endings
  const seenEv = new Set<string>();
  for (const ev of raw.evidence ?? []) {
    if (seenEv.has(ev.id)) problems.push(`duplicate evidence id '${ev.id}'`);
    seenEv.add(ev.id);
    if (!ev.title || !ev.summary) problems.push(`evidence ${ev.id}: needs title and summary`);
    if (ev.source && !pathExists(ev.source, ev.machine)) problems.push(`evidence ${ev.id}: source '${ev.source}' not in ${ev.machine ? `hosts/${ev.machine}/` : 'fs/'}`);
    if (!ev.trigger) problems.push(`evidence ${ev.id}: needs a trigger`);
    for (const leaf of ev.trigger ? leaves(ev.trigger) : []) {
      if (!KNOWN_EVENTS.has(leaf.event)) problems.push(`evidence ${ev.id}: unknown event '${leaf.event}'`);
      const p = leaf.where?.path;
      if (typeof p === 'string' && !pathExists(p, leaf.where?.machine)) problems.push(`evidence ${ev.id}: trigger path '${p}' not in ${leaf.where?.machine ? `hosts/${leaf.where.machine}/` : 'fs/'}`);
      checkMachine(leaf.where?.machine, `evidence ${ev.id}`);
    }
  }
  for (const n of chat?.nodes ?? []) {
    for (const r of n.replies ?? []) {
      for (const ev of r.requiresEvidence ?? []) if (!seenEv.has(ev)) problems.push(`chat node ${n.id}: reply '${r.id}' requires unknown evidence '${ev}'`);
    }
    for (const leaf of n.trigger ? leaves(n.trigger) : []) {
      if (!KNOWN_EVENTS.has(leaf.event)) problems.push(`chat node ${n.id}: unknown event '${leaf.event}'`);
    }
  }
  // Timers (timed mode)
  const timerIds = new Set<string>();
  for (const t of raw.timers ?? []) {
    if (timerIds.has(t.id)) problems.push(`duplicate timer id '${t.id}'`);
    timerIds.add(t.id);
    const at = Date.parse(t.at);
    if (Number.isNaN(at)) problems.push(`timer ${t.id}: 'at' is not a valid ISO date`);
    else if (at <= Date.parse(raw.machine.clock)) problems.push(`timer ${t.id}: fires before the scenario starts`);
    if (!t.effects?.length) problems.push(`timer ${t.id}: needs effects`);
    for (const fx of [...(t.effects ?? []), ...(t.warnings ?? []).flatMap((w) => w.effects)]) if ('flag' in fx) flags.add(fx.flag);
  }
  for (const t of raw.timers ?? []) {
    for (const f of [...(t.unlessFlags ?? []), ...(t.ifFlags ?? [])]) if (!raised(f)) problems.push(`timer ${t.id}: flag '${f}' is never raised`);
  }
  const allEffects = [
    ...(raw.timers ?? []).flatMap((t) => [...(t.effects ?? []), ...(t.warnings ?? []).flatMap((w) => w.effects)]),
    ...raw.objectives.flatMap((o) => [...(o.onComplete ?? []), ...(o.choice?.options ?? []).flatMap((x) => x.onSelect ?? [])]),
    ...(chat?.nodes ?? []).flatMap((n) => [...(n.onComplete ?? []), ...(n.replies ?? []).flatMap((r) => r.onSelect ?? [])]),
  ];
  for (const fx of allEffects) {
    if ('chat' in fx && !chat?.nodes.some((n) => n.id === fx.chat)) problems.push(`effect chat: unknown node '${fx.chat}'`);
    if ('deliver' in fx && !deliveries[fx.deliver]) problems.push(`effect deliver: '${fx.deliver}' not found in deliveries/`);
    if ('alert' in fx && !alertIds.has(fx.alert)) problems.push(`effect alert: unknown SOC alert '${fx.alert}'`);
    if ('write' in fx && fx.write.machine && fx.write.machine !== 'local' && !hostEntries.has(fx.write.machine)) problems.push(`effect write: unknown machine '${fx.write.machine}'`);
    if ('remove' in fx) {
      const m = fx.remove.machine && fx.remove.machine !== 'local' ? fx.remove.machine : undefined;
      if (m && !hostEntries.has(m)) problems.push(`effect remove: unknown machine '${m}'`);
      else if (!pathExists(fx.remove.path, m)) problems.push(`effect remove: '${fx.remove.path}' not in ${m ? `hosts/${m}/` : 'fs/'}`);
    }
  }

  const endings = raw.endings ?? [];
  for (const e of endings) {
    for (const f of [...(e.flags ?? []), ...(e.notFlags ?? [])]) {
      if (!raised(f)) problems.push(`ending ${e.id}: flag '${f}' is never raised`);
    }
  }
  if (endings.length && !endings.some((e) => !e.flags?.length && !e.notFlags?.length) && !raw.outro) {
    problems.push('endings: add an unconditional ending or an outro as fallback');
  }

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
    ...(hosts.length ? { hosts } : {}),
    ...(raw.timers?.length ? { timers: raw.timers } : {}),
    ...(soc ? { soc } : {}),
    objectives,
    evidence: raw.evidence ?? [],
    web,
    chat,
    endings,
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
    endings: b.endings?.length || undefined,
    timed: b.timers?.some((t) => t.timedOnly) || undefined,
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

/** Users + filesystem image of one machine (the workstation from fs/, a remote from hosts/<id>/). */
function buildMachine(
  dir: string,
  fsRel: string,
  salt: string,
  rawUsers: RawUser[],
  perms: RawPermission[],
  defaults: { mtime?: string } | undefined,
  clock: string,
  problems: string[],
  label: string,
  archives: RawArchives = {},
) {
  const users: UserDef[] = rawUsers.map(({ password, ...u }) => ({
    ...u,
    groups: u.groups ?? [],
    passwordHash: password ? secretHash(salt, password) : undefined,
  }));
  const userNames = new Set(users.map((u) => u.name));

  // ── Filesystem ────────────────────────────────────────────────────────
  const fsDir = join(dir, fsRel);
  const defaultMtime = Date.parse(defaults?.mtime ?? clock) - (defaults?.mtime ? 0 : 3 * 86400_000);
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

  const readContent = (full: string) => {
    const mime = BINARY_MIME[extname(full).toLowerCase()];
    return mime ? `data:${mime};base64,${readFileSync(full).toString('base64')}` : readFileSync(full, 'utf8');
  };
  if (!existsSync(fsDir)) problems.push(`${label}missing ${fsRel}/ directory`);
  else {
    let archiveDir: string | null = null;
    for (const full of walk(fsDir)) {
      if (archiveDir && full.startsWith(archiveDir)) continue; // packed into the archive below
      archiveDir = null;
      const rel = toPosix(relative(fsDir, full));
      // Authoring convenience: `name.zip.d/` (or .tar.d / .tgz.d / .tar.gz.d) becomes the archive `name.zip`.
      const packed = full.endsWith('/') && rel.match(/^(.*\.(zip|tar|tgz|tar\.gz))\.d$/);
      if (packed) {
        archiveDir = full;
        const path = packed[1]!;
        const members: ArchiveEntry[] = walk(full)
          .filter((f) => !f.endsWith('/.gitkeep'))
          .map((f) => {
            const inner = toPosix(relative(full, f)).slice(1);
            return f.endsWith('/')
              ? { path: inner, type: 'dir' as const, mode: 0o755, mtime: defaultMtime }
              : { path: inner, type: 'file' as const, mode: 0o644, mtime: defaultMtime, content: readContent(f) };
          });
        const opts = archives[path];
        if (opts?.password && packed[2] !== 'zip') problems.push(`${label}archive ${path}: only zip archives take a password`);
        const content =
          packed[2] === 'zip'
            ? zip(members, opts?.password)
            : packed[2] === 'tar'
              ? tar(members)
              : gzip(tar(members), path.split('/').pop()!.replace(/\.(tgz|tar\.gz)$/, '.tar'), defaultMtime);
        addEntry(path, 'file', content);
        continue;
      }
      if (full.endsWith('/')) {
        addEntry(rel, 'dir');
        continue;
      }
      if (rel.endsWith('/.gitkeep')) continue;
      if (rel.endsWith('.gz.src')) {
        const path = rel.slice(0, -'.src'.length);
        addEntry(path, 'file', gzip(readContent(full), path.split('/').pop()!.replace(/\.gz$/, ''), defaultMtime));
        continue;
      }
      addEntry(rel, 'file', readContent(full));
    }
  }
  for (const path of Object.keys(archives)) if (!entries.has(path)) problems.push(`${label}archives: '${path}' is not built (expected ${path}.d/ in ${fsRel}/)`);
  for (const p of perms) {
    const base = p.path.replace(/\/\*\*$/, '');
    if (!entries.has(base)) problems.push(`${label}permissions: '${p.path}' does not exist in ${fsRel}/`);
  }
  for (const u of users) {
    if (!entries.has(u.home)) problems.push(`${label}user ${u.name}: home ${u.home} missing from ${fsRel}/`);
  }
  return { users, entries };
}

function checkCommands(commands: Record<string, ScriptedCommand>, problems: string[], label: string) {
  for (const [name, cmd] of Object.entries(commands)) {
    if (!cmd.rules?.length) problems.push(`${label}command ${name}: needs at least one rule`);
    for (const r of cmd.rules ?? []) {
      try {
        new RegExp(r.match);
      } catch {
        problems.push(`${label}command ${name}: invalid regex ${r.match}`);
      }
    }
  }
}
