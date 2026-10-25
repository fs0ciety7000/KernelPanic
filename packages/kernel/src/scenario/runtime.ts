import type { AnyEvent, EventBus } from '../events';
import type { ChatReply, ChoiceOption, EndingDef, Effect, EvidenceDef, ObjectiveDef, ScenarioBundle, SocAlert, SocAsset, TimerDef, Trigger, TriggerLeaf, WriteEffect } from './types';
import { secretHash } from '../util/sha256';

export interface ScenarioState {
  completed: Record<string, number>;
  hints: Record<string, number>;
  flags: string[];
  /** Objectives whose trigger fired while they were still locked; completed on unlock. */
  early: string[];
  /** Evidence ids, in discovery order. */
  evidence: string[];
  /** objective id → chosen option id. */
  choices: Record<string, string>;
  /** Ending reached (when the scenario defines several). */
  ending?: string;
  chat: ChatState;
  startedAt: number;
  /** What happened, for the end-of-game replay (capped). */
  journal?: JournalEntry[];
  /** Timed mode chosen at the start of the game. */
  timed?: boolean;
  /** SOC console: raised alerts (game time), triage verdicts, alerts already looked at. */
  soc?: { alerts: Array<{ id: string; at: number }>; triage: Record<string, 'real' | 'false'>; seen: string[] };
  /** Timer ids already fired / warning keys ("id@before") already shown. */
  timers?: { fired: string[]; warned: string[] };
  endedAt?: number;
  /** Accumulated play time in ms (excludes time the game was closed). */
  playtime: number;
}

export interface ChatLine {
  from: string;
  text: string;
  /** Game time (ms). */
  at: number;
}

export interface ChatState {
  log: Record<string, ChatLine[]>;
  /** contact → node awaiting the player's reply. */
  pending: Record<string, string>;
  /** Nodes already played (each node plays once). */
  fired: string[];
  unread: Record<string, number>;
}

export interface ObjectiveView extends ObjectiveDef {
  status: 'locked' | 'available' | 'done';
  hintsShown: number;
}

export type JournalKind = 'objective' | 'evidence' | 'hint' | 'wrong' | 'ssh' | 'choice' | 'timer' | 'end' | 'alert' | 'action';

export interface JournalEntry {
  kind: JournalKind;
  /** Game time (ms). */
  at: number;
  /** Play time (ms) since the start. */
  t: number;
  text: string;
  /** How it happened: the command, the file, the answer… */
  detail?: string;
}

const JOURNAL_MAX = 400;

export interface RuntimeHost {
  deliver(name: string): void;
  write(w: WriteEffect): void;
  remove(path: string, machine?: string): void;
  /** Current game time (ms). */
  now(): number;
}

export function normalizeAnswer(value: string, ops: Array<'trim' | 'lower' | 'nospace'>): string {
  let v = value;
  for (const op of ops) {
    if (op === 'trim') v = v.trim();
    if (op === 'lower') v = v.toLowerCase();
    if (op === 'nospace') v = v.replace(/\s+/g, '');
  }
  return v;
}

function matchLeaf(t: TriggerLeaf, e: AnyEvent): boolean {
  if (t.event !== e.type) return false;
  const p = e.payload as Record<string, unknown>;
  // An event from a remote machine only matches triggers that name that machine,
  // so `where: { path: /var/log/auth.log }` keeps meaning the workstation's file.
  if (p.machine !== undefined && t.where?.machine === undefined && e.type !== 'auth.ssh') return false;
  for (const [k, v] of Object.entries(t.where ?? {})) {
    if (p[k] !== v) return false;
  }
  for (const [k, re] of Object.entries(t.regex ?? {})) {
    const value = Array.isArray(p[k]) ? (p[k] as unknown[]).join(' ') : String(p[k] ?? '');
    if (!new RegExp(re).test(value)) return false;
  }
  return true;
}

export function matchTrigger(t: Trigger, e: AnyEvent): boolean {
  return 'any' in t ? t.any.some((leaf) => matchLeaf(leaf, e)) : matchLeaf(t, e);
}

export class ScenarioRuntime {
  state: ScenarioState;
  private sessionStart = Date.now();
  private listeners = new Set<() => void>();

  constructor(
    public bundle: ScenarioBundle,
    private bus: EventBus,
    private host: RuntimeHost,
    saved?: ScenarioState,
    opts: { timed?: boolean } = {},
  ) {
    this.state = {
      completed: {},
      hints: {},
      flags: [],
      early: [],
      evidence: [],
      choices: {},
      chat: { log: {}, pending: {}, fired: [], unread: {} },
      startedAt: Date.now(),
      playtime: 0,
      timed: opts.timed ?? false,
      ...saved,
    };
    this.state.timers ??= { fired: [], warned: [] };
    this.state.journal ??= [];
    this.state.soc ??= { alerts: [], triage: {}, seen: [] };
    if (!saved?.chat) this.seedChatHistory();
    bus.onAny((e) => this.onEvent(e));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed() {
    for (const fn of this.listeners) fn();
  }

  get ended(): boolean {
    return this.state.endedAt !== undefined;
  }

  isDone(id: string): boolean {
    return id in this.state.completed;
  }

  isAvailable(o: ObjectiveDef): boolean {
    return !this.isDone(o.id) && (o.requires ?? []).every((r) => this.isDone(r));
  }

  objectives(): ObjectiveView[] {
    return this.bundle.objectives.map((o) => ({
      ...o,
      status: this.isDone(o.id) ? 'done' : this.isAvailable(o) ? 'available' : 'locked',
      hintsShown: this.state.hints[o.id] ?? 0,
    }));
  }

  progress(): { done: number; total: number } {
    const required = this.bundle.objectives.filter((o) => !o.optional);
    return { done: required.filter((o) => this.isDone(o.id)).length, total: required.length };
  }

  private onEvent(e: AnyEvent): void {
    if (this.ended) return;
    if (e.type === 'scenario.flag' && !this.state.flags.includes(e.payload.id)) {
      this.state.flags.push(e.payload.id);
    }
    if (e.type === 'auth.ssh' && e.payload.ok) {
      this.log('ssh', `${e.payload.login}@${this.hostname(e.payload.target)}`, e.payload.method === 'key' ? 'clé SSH' : 'mot de passe');
    }
    for (const a of this.bundle.soc?.alerts ?? []) {
      if (a.trigger && matchTrigger(a.trigger, e)) this.raiseAlert(a.id);
    }
    for (const node of this.bundle.chat?.nodes ?? []) {
      if (node.trigger && !this.state.chat.fired.includes(node.id) && matchTrigger(node.trigger, e)) this.fireChat(node.id);
    }
    for (const ev of this.bundle.evidence ?? []) {
      if (!this.state.evidence.includes(ev.id) && matchTrigger(ev.trigger, e)) {
        this.state.evidence.push(ev.id);
        this.log('evidence', ev.title, this.describe(e));
        this.bus.emit('evidence.found', { id: ev.id, title: ev.title });
        this.changed();
      }
    }
    // Decide against a snapshot, so completing one objective doesn't re-evaluate this event for others.
    const hits = this.bundle.objectives.filter((o) => o.trigger && !this.isDone(o.id) && matchTrigger(o.trigger, e));
    const ready = hits.filter((o) => this.isAvailable(o));
    for (const o of hits) {
      // Players explore freely: a discovery made before its objective unlocks still counts later.
      if (!ready.includes(o) && !this.state.early.includes(o.id)) this.state.early.push(o.id);
    }
    for (const o of ready) this.complete(o);
  }

  /** Returns true when the answer is accepted. */
  submit(id: string, value: string): boolean {
    const o = this.bundle.objectives.find((x) => x.id === id);
    if (!o?.answer || !this.isAvailable(o)) return false;
    const h = secretHash(this.bundle.id, normalizeAnswer(value, o.answer.normalize));
    if (!o.answer.hashes.includes(h)) {
      this.log('wrong', o.title, value.trim().slice(0, 80));
      this.changed();
      return false;
    }
    this.complete(o);
    return true;
  }

  hasEvidence(id: string): boolean {
    return this.state.evidence.includes(id);
  }

  /** Discovered evidence, in discovery order. */
  evidence(): EvidenceDef[] {
    const all = this.bundle.evidence ?? [];
    return this.state.evidence.map((id) => all.find((e) => e.id === id)).filter((e): e is EvidenceDef => !!e);
  }

  /** Evidence ids an option still needs (empty = selectable). */
  missingEvidence(opt: ChoiceOption): string[] {
    return (opt.requiresEvidence ?? []).filter((id) => !this.hasEvidence(id));
  }

  /** Picks an option of a choice objective. Returns false when not allowed. */
  choose(objectiveId: string, optionId: string): boolean {
    const o = this.bundle.objectives.find((x) => x.id === objectiveId);
    const opt = o?.choice?.options.find((x) => x.id === optionId);
    if (!o || !opt || !this.isAvailable(o) || this.missingEvidence(opt).length) return false;
    this.state.choices[o.id] = opt.id;
    // Flags first: the ending is selected from them when an `end` effect runs.
    for (const f of [`choice:${o.id}:${opt.id}`, ...(opt.flags ?? [])]) this.bus.emit('scenario.flag', { id: f });
    this.log('choice', opt.label);
    this.bus.emit('choice.made', { objective: o.id, option: opt.id });
    for (const fx of opt.onSelect ?? []) this.apply(fx);
    this.complete(o);
    return true;
  }

  /** The ending reached, or the one that would be reached with the current flags. */
  ending(): EndingDef | undefined {
    const endings = this.bundle.endings ?? [];
    if (this.state.ending) return endings.find((e) => e.id === this.state.ending);
    return endings.find(
      (e) => (e.flags ?? []).every((f) => this.state.flags.includes(f)) && !(e.notFlags ?? []).some((f) => this.state.flags.includes(f)),
    );
  }

  revealHint(id: string): string | undefined {
    const o = this.bundle.objectives.find((x) => x.id === id);
    const shown = this.state.hints[id] ?? 0;
    if (!o?.hints || shown >= o.hints.length) return undefined;
    this.state.hints[id] = shown + 1;
    this.log('hint', o.title, `indice ${shown + 1}/${o.hints.length}`);
    this.changed();
    return o.hints[shown];
  }

  private complete(o: ObjectiveDef): void {
    if (this.isDone(o.id)) return;
    this.state.completed[o.id] = Date.now();
    if (!o.choice) this.log('objective', o.title);
    this.bus.emit('objective.complete', { id: o.id, title: o.title });
    for (const fx of o.onComplete ?? []) this.apply(fx);
    for (const next of this.bundle.objectives) {
      if (!next.requires?.includes(o.id) || !this.isAvailable(next)) continue;
      if (this.state.early.includes(next.id)) this.complete(next);
      else this.bus.emit('objective.available', { id: next.id });
    }
    this.changed();
  }

  // ── Chat ─────────────────────────────────────────────────────────────

  private seedChatHistory(): void {
    for (const [contact, msgs] of Object.entries(this.bundle.chat?.history ?? {})) {
      this.state.chat.log[contact] = msgs.map((m) => ({ from: m.from, text: m.text, at: m.at ? Date.parse(m.at) : this.host.now() }));
    }
  }

  /** An NPC sends the messages of a node (once). */
  fireChat(nodeId: string): void {
    const node = this.bundle.chat?.nodes.find((n) => n.id === nodeId);
    const chat = this.state.chat;
    if (!node || chat.fired.includes(node.id)) return;
    chat.fired.push(node.id);
    const log = (chat.log[node.contact] ??= []);
    for (const text of node.messages) {
      log.push({ from: node.contact, text, at: this.host.now() });
      this.bus.emit('chat.message', { contact: node.contact, text });
    }
    chat.unread[node.contact] = (chat.unread[node.contact] ?? 0) + node.messages.length;
    if (node.replies?.length) chat.pending[node.contact] = node.id;
    else for (const fx of node.onComplete ?? []) this.apply(fx);
    this.changed();
  }

  /** Replies the player can pick right now for a contact. */
  chatReplies(contact: string): Array<ChatReply & { missing: string[] }> {
    const nodeId = this.state.chat.pending[contact];
    const node = this.bundle.chat?.nodes.find((n) => n.id === nodeId);
    return (node?.replies ?? []).map((r) => ({ ...r, missing: (r.requiresEvidence ?? []).filter((id) => !this.hasEvidence(id)) }));
  }

  chatReply(contact: string, replyId: string): boolean {
    const chat = this.state.chat;
    const node = this.bundle.chat?.nodes.find((n) => n.id === chat.pending[contact]);
    const reply = node?.replies?.find((r) => r.id === replyId);
    if (!node || !reply || (reply.requiresEvidence ?? []).some((id) => !this.hasEvidence(id))) return false;
    delete chat.pending[contact];
    (chat.log[contact] ??= []).push({ from: 'me', text: reply.text, at: this.host.now() });
    for (const f of reply.flags ?? []) this.bus.emit('scenario.flag', { id: f });
    this.bus.emit('chat.reply', { contact, node: node.id, reply: reply.id });
    for (const fx of reply.onSelect ?? []) this.apply(fx);
    for (const fx of node.onComplete ?? []) this.apply(fx);
    if (reply.next) this.fireChat(reply.next);
    this.changed();
    return true;
  }

  markChatRead(contact: string): void {
    if (!this.state.chat.unread[contact]) return;
    this.state.chat.unread[contact] = 0;
    this.changed();
  }

  private apply(fx: Effect): void {
    if ('deliver' in fx) this.host.deliver(fx.deliver);
    else if ('chat' in fx) this.fireChat(fx.chat);
    else if ('notify' in fx) this.bus.emit('scenario.notify', fx.notify);
    else if ('write' in fx) this.host.write(fx.write);
    else if ('alert' in fx) this.raiseAlert(fx.alert);
    else if ('remove' in fx) this.host.remove(fx.remove.path, fx.remove.machine);
    else if ('flag' in fx) this.bus.emit('scenario.flag', { id: fx.flag });
    else if ('end' in fx) {
      this.state.ending = this.ending()?.id;
      this.log('end', this.ending()?.title ?? this.bundle.outro?.title ?? 'Dossier clos');
      this.state.endedAt = Date.now();
      this.state.playtime = this.playtime();
      this.bus.emit('scenario.end', {});
    }
  }

  playtime(): number {
    if (this.ended) return this.state.playtime;
    return this.state.playtime + (Date.now() - this.sessionStart);
  }

  // ── Timers (timed mode) ───────────────────────────────────────────────

  private armed(t: TimerDef): boolean {
    if (t.timedOnly && !this.state.timed) return false;
    if (this.state.timers!.fired.includes(t.id)) return false;
    if ((t.ifFlags ?? []).some((f) => !this.state.flags.includes(f))) return false;
    return !(t.unlessFlags ?? []).some((f) => this.state.flags.includes(f));
  }

  /** Fires due warnings and timers. Called every second by the desktop (and by tests). */
  tick(): void {
    if (this.ended) return;
    const now = this.host.now();
    let changed = false;
    // Chronological order, so a chain (seed → spread) resolves within one tick after a jump.
    const timers = [...(this.bundle.timers ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const t of timers) {
      if (!this.armed(t)) continue;
      const at = Date.parse(t.at);
      // Only the most recent due warning fires: a reload or a jump must not replay stale ones.
      const warned = this.state.timers!.warned;
      const key = (w: { before: number }) => `${t.id}@${w.before}`;
      const [latest, ...stale] = (t.warnings ?? []).filter((w) => now >= at - w.before * 60_000 && now < at).sort((x, y) => x.before - y.before);
      for (const w of stale) if (!warned.includes(key(w))) warned.push(key(w));
      if (latest && !warned.includes(key(latest))) {
        warned.push(key(latest));
        for (const fx of latest.effects) this.apply(fx);
        changed = true;
      }
      if (now >= at) {
        this.state.timers!.fired.push(t.id);
        this.log('timer', t.journal ?? t.label ?? t.id);
        for (const fx of t.effects) this.apply(fx);
        changed = true;
        if (this.ended) break;
      }
    }
    if (changed) this.changed();
  }

  /** The nearest armed timer with a label, for the taskbar countdown. */
  upcoming(): { id: string; label: string; at: number } | null {
    const next = (this.bundle.timers ?? [])
      .filter((t) => t.label && this.armed(t))
      .map((t) => ({ id: t.id, label: t.label!, at: Date.parse(t.at) }))
      .sort((a, b) => a.at - b.at)[0];
    return this.ended ? null : (next ?? null);
  }

  // ── SOC console ──────────────────────────────────────────────────────

  private flag(id: string): void {
    if (!this.state.flags.includes(id)) this.bus.emit('scenario.flag', { id });
  }

  raiseAlert(id: string): void {
    const def = this.bundle.soc?.alerts.find((a) => a.id === id);
    const soc = this.state.soc!;
    if (!def || soc.alerts.some((a) => a.id === id)) return;
    soc.alerts.push({ id, at: this.host.now() });
    this.log('alert', def.title, def.asset ? this.assetName(def.asset) : undefined);
    this.bus.emit('soc.alert', { id, severity: def.severity, title: def.title, asset: def.asset });
    this.changed();
  }

  /** Raised alerts, newest first, with their definition and verdict. */
  socAlerts(): Array<SocAlert & { at: number; verdict?: 'real' | 'false'; seen: boolean }> {
    const soc = this.state.soc!;
    return soc.alerts
      .map((a) => ({ ...this.bundle.soc!.alerts.find((d) => d.id === a.id)!, at: a.at, verdict: soc.triage[a.id], seen: soc.seen.includes(a.id) }))
      .reverse();
  }

  socUnseen(): number {
    const soc = this.state.soc!;
    return soc.alerts.filter((a) => !soc.seen.includes(a.id)).length;
  }

  markAlertsSeen(): void {
    const soc = this.state.soc!;
    const unseen = soc.alerts.filter((a) => !soc.seen.includes(a.id));
    if (!unseen.length) return;
    soc.seen.push(...unseen.map((a) => a.id));
    this.changed();
  }

  /** Incident or false positive. Final, like a real ticket closure. Raises `triage:<id>:real|false`. */
  triage(alertId: string, verdict: 'real' | 'false'): boolean {
    const soc = this.state.soc!;
    if (!soc.alerts.some((a) => a.id === alertId) || soc.triage[alertId]) return false;
    soc.triage[alertId] = verdict;
    this.flag(`triage:${alertId}:${verdict}`);
    this.bus.emit('soc.triage', { alert: alertId, verdict });
    this.changed();
    return true;
  }

  assetState(id: string): 'isolated' | 'infected' | 'ok' {
    if (this.state.flags.includes(`isolated:${id}`)) return 'isolated';
    if (this.state.flags.includes(`infected:${id}`)) return 'infected';
    return 'ok';
  }

  /** Cuts a machine off the network (irreversible for the rest of the game). Raises `isolated:<id>`. */
  isolate(assetId: string): boolean {
    const asset = this.bundle.soc?.assets.find((a) => a.id === assetId);
    if (!asset || this.ended || this.state.flags.includes(`isolated:${assetId}`)) return false;
    this.log('action', `Isolement de ${asset.name}`, asset.ip);
    this.flag(`isolated:${assetId}`);
    this.bus.emit('soc.action', { action: 'isolate', target: assetId });
    this.changed();
    return true;
  }

  /** Perimeter firewall rule. Raises `blocked:<ip>`. */
  block(ip: string): boolean {
    const value = ip.trim();
    if (this.ended || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.split('.').some((n) => Number(n) > 255)) return false;
    if (this.state.flags.includes(`blocked:${value}`)) return false;
    this.log('action', `Blocage de ${value} au pare-feu`);
    this.flag(`blocked:${value}`);
    this.bus.emit('soc.action', { action: 'block', target: value });
    this.changed();
    return true;
  }

  blocked(): string[] {
    return this.state.flags.filter((f) => f.startsWith('blocked:')).map((f) => f.slice(8));
  }

  /** Is the ssh host behind this id isolated on the SOC map? */
  hostIsolated(hostId: string): boolean {
    return (this.bundle.soc?.assets ?? []).some((a) => a.host === hostId && this.assetState(a.id) === 'isolated');
  }

  private assetName(id: string): string {
    return this.bundle.soc?.assets.find((a: SocAsset) => a.id === id)?.name ?? id;
  }

  // ── Journal (end-of-game replay) ──────────────────────────────────────

  private log(kind: JournalKind, text: string, detail?: string): void {
    const j = this.state.journal!;
    if (j.length >= JOURNAL_MAX) return;
    j.push({ kind, at: this.host.now(), t: this.playtime(), text, ...(detail ? { detail } : {}) });
  }

  private hostname(id?: string): string {
    if (!id || id === 'local') return this.bundle.machine.hostname;
    return this.bundle.hosts?.find((h) => h.id === id)?.machine.hostname ?? id;
  }

  /** One line saying how an event revealed something (the command typed, the file read…). */
  private describe(e: AnyEvent): string | undefined {
    const p = e.payload as Record<string, unknown>;
    const where = p.machine ? `${this.hostname(String(p.machine))} ` : '';
    switch (e.type) {
      case 'cmd.exec':
        return `${where}$ ${e.payload.line}`.slice(0, 160);
      case 'fs.read':
      case 'fs.list':
        return `${where}${e.payload.path}`;
      case 'mail.open':
        return `mail « ${e.payload.subject} »`;
      case 'image.open':
        return e.payload.path;
      case 'web.visit':
        return e.payload.url;
      case 'chat.reply':
        return 'messagerie';
      default:
        return undefined;
    }
  }

  journal(): JournalEntry[] {
    return this.state.journal ?? [];
  }

  /** Moves game time forward (tests, debug). */
  advance(ms: number): void {
    this.state.playtime += ms;
  }

  /** Call before serializing so playtime survives reloads. */
  checkpoint(): ScenarioState {
    if (!this.ended) {
      this.state.playtime = this.playtime();
      this.sessionStart = Date.now();
    }
    return structuredClone(this.state);
  }

  score(): { score: number; hints: number; minutes: number; bonus: number } {
    const hints = Object.values(this.state.hints).reduce((a, b) => a + b, 0);
    const minutes = Math.floor(this.playtime() / 60000);
    const bonus = this.bundle.objectives.filter((o) => o.optional && this.isDone(o.id)).length * 150;
    // An ending reached before the work was done (a timer, a hasty report) scores accordingly.
    const required = this.bundle.objectives.filter((o) => !o.optional);
    const share = required.length ? required.filter((o) => this.isDone(o.id)).length / required.length : 1;
    const score = Math.round(Math.max(100, 1000 - 40 * hints - 2 * minutes) * share) + bonus;
    return { score, hints, minutes, bonus };
  }
}
