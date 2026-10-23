import type { AnyEvent, EventBus } from '../events';
import type { Effect, ObjectiveDef, ScenarioBundle, Trigger, TriggerLeaf } from './types';
import { secretHash } from '../util/sha256';

export interface ScenarioState {
  completed: Record<string, number>;
  hints: Record<string, number>;
  flags: string[];
  /** Objectives whose trigger fired while they were still locked; completed on unlock. */
  early: string[];
  startedAt: number;
  endedAt?: number;
  /** Accumulated play time in ms (excludes time the game was closed). */
  playtime: number;
}

export interface ObjectiveView extends ObjectiveDef {
  status: 'locked' | 'available' | 'done';
  hintsShown: number;
}

export interface RuntimeHost {
  deliver(name: string): void;
  write(path: string, content: string, mode?: string, owner?: string): void;
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
  ) {
    this.state = { completed: {}, hints: {}, flags: [], early: [], startedAt: Date.now(), playtime: 0, ...saved };
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
    if (!o.answer.hashes.includes(h)) return false;
    this.complete(o);
    return true;
  }

  revealHint(id: string): string | undefined {
    const o = this.bundle.objectives.find((x) => x.id === id);
    const shown = this.state.hints[id] ?? 0;
    if (!o?.hints || shown >= o.hints.length) return undefined;
    this.state.hints[id] = shown + 1;
    this.changed();
    return o.hints[shown];
  }

  private complete(o: ObjectiveDef): void {
    if (this.isDone(o.id)) return;
    this.state.completed[o.id] = Date.now();
    this.bus.emit('objective.complete', { id: o.id, title: o.title });
    for (const fx of o.onComplete ?? []) this.apply(fx);
    for (const next of this.bundle.objectives) {
      if (!next.requires?.includes(o.id) || !this.isAvailable(next)) continue;
      if (this.state.early.includes(next.id)) this.complete(next);
      else this.bus.emit('objective.available', { id: next.id });
    }
    this.changed();
  }

  private apply(fx: Effect): void {
    if ('deliver' in fx) this.host.deliver(fx.deliver);
    else if ('notify' in fx) this.bus.emit('scenario.notify', fx.notify);
    else if ('write' in fx) this.host.write(fx.write.path, fx.write.content, fx.write.mode, fx.write.owner);
    else if ('flag' in fx) this.bus.emit('scenario.flag', { id: fx.flag });
    else if ('end' in fx) {
      this.state.endedAt = Date.now();
      this.state.playtime = this.playtime();
      this.bus.emit('scenario.end', {});
    }
  }

  playtime(): number {
    if (this.ended) return this.state.playtime;
    return this.state.playtime + (Date.now() - this.sessionStart);
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
    const score = Math.max(100, 1000 - 40 * hints - 2 * minutes) + bonus;
    return { score, hints, minutes, bonus };
  }
}
