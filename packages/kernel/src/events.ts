// Typed event bus. Everything observable by the scenario runtime flows through here.

export interface KernelEvents {
  // `machine` is set on events that happen on a remote host (ADR-009); absent = the workstation.
  'fs.read': { path: string; user: string; machine?: string };
  'fs.write': { path: string; user: string; machine?: string };
  'fs.list': { path: string; user: string; machine?: string };
  'fs.change': { path: string; machine?: string };
  'cmd.exec': { name: string; argv: string[]; line: string; exit: number; user: string; machine?: string };
  'auth.sudo': { user: string; ok: boolean; machine?: string };
  'auth.su': { user: string; target: string; ok: boolean; machine?: string };
  /** ssh/scp login attempt from `machine` (absent = workstation) to `target`. */
  'auth.ssh': { user: string; target: string; ok: boolean; method: 'password' | 'key'; machine?: string };
  'mail.open': { path: string; messageId: string; subject: string; from: string };
  'mail.delivered': { path: string; subject: string; from: string };
  'image.open': { path: string };
  'app.open': { appId: string; path?: string };
  'scenario.flag': { id: string };
  'objective.available': { id: string };
  'objective.complete': { id: string; title: string };
  'evidence.found': { id: string; title: string };
  'web.visit': { url: string; host: string; path: string; title: string; status: string };
  'chat.message': { contact: string; text: string };
  'chat.reply': { contact: string; node: string; reply: string };
  'choice.made': { objective: string; option: string };
  'scenario.notify': { title: string; body: string };
  'scenario.end': Record<string, never>;
  'shell.clear': Record<string, never>;
}

export type EventName = keyof KernelEvents;
export type AnyEvent = { [K in EventName]: { type: K; payload: KernelEvents[K] } }[EventName];
type Handler<K extends EventName> = (payload: KernelEvents[K]) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<Handler<any>>>();
  private wildcard = new Set<(e: AnyEvent) => void>();

  on<K extends EventName>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  onAny(fn: (e: AnyEvent) => void): () => void {
    this.wildcard.add(fn);
    return () => this.wildcard.delete(fn);
  }

  emit<K extends EventName>(type: K, payload: KernelEvents[K]): void {
    for (const fn of this.handlers.get(type) ?? []) fn(payload);
    for (const fn of this.wildcard) fn({ type, payload } as AnyEvent);
  }
}
