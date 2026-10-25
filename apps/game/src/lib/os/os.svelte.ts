// Bridge between the framework-agnostic kernel and Svelte's reactivity.

import { base } from '$app/paths';
import { Kernel, parseMail, type SaveGame, type ScenarioBundle, type ScenarioIndexEntry } from '@kp/kernel';
import { notify } from './notify.svelte';
import { sound } from './sound.svelte';
import { load, remove, store } from './storage';
import { appForPath, appById } from './apps';
import { wm, type WindowSnapshot } from './wm.svelte';
import { desktop, type Cell } from './desktop.svelte';

type Phase = 'boot' | 'select' | 'intro' | 'login' | 'desktop' | 'ended';

interface StoredGame {
  save: SaveGame;
  windows: WindowSnapshot[];
  /** Desktop icon positions (older saves don't have it). */
  desktop?: Record<string, Cell>;
}

const SAVE_KEY = (id: string) => `kp.save.${id}`;
/** Endings reached across all playthroughs (survives "Nouvelle partie"). */
const ENDINGS_KEY = (id: string) => `kp.endings.${id}`;
const AUTOSAVE_MS = 15_000;

class OS {
  phase = $state<Phase>('boot');
  kernel = $state.raw<Kernel | null>(null);
  scenarios = $state<ScenarioIndexEntry[]>([]);
  /** Bumped (coalesced per microtask) whenever the VFS or scenario state changes. */
  version = $state(0);
  /** Wall-clock tick for the top bar clock. */
  tick = $state(0);
  error = $state<string | null>(null);
  /** Screen lock over a running desktop (Ctrl+Alt+L, launcher). */
  locked = $state(false);
  /** True until the first login of a fresh game (autostart apps run once). */
  private firstSession = false;

  private pending = false;
  private timers: ReturnType<typeof setInterval>[] = [];

  /** Schedules a reactive refresh outside of the current derivation. */
  invalidate = () => {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.version++;
    });
  };

  async loadIndex(): Promise<void> {
    try {
      const res = await fetch(`${base}/scenarios/index.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.scenarios = await res.json();
    } catch (e) {
      this.error = `Impossible de charger les scénarios (${(e as Error).message}). Lancez \`pnpm scenarios\`.`;
    }
  }

  discoveredEndings(id: string): string[] {
    return load<string[]>(ENDINGS_KEY(id)) ?? [];
  }

  hasSave(id: string): boolean {
    return !!load<StoredGame>(SAVE_KEY(id));
  }

  async start(id: string, opts: { fresh?: boolean } = {}): Promise<void> {
    const entry = this.scenarios.find((s) => s.id === id);
    if (!entry) return;
    const bundle: ScenarioBundle = await (await fetch(`${base}/scenarios/${entry.file}`)).json();
    if (opts.fresh) remove(SAVE_KEY(id));
    const stored = load<StoredGame>(SAVE_KEY(id));
    const kernel = new Kernel(bundle, stored?.save);
    this.wire(kernel);
    this.kernel = kernel;
    wm.reset();
    desktop.reset();
    this.locked = false;
    if (stored && stored.save.scenarioVersion === bundle.version) {
      this.firstSession = false;
      this.phase = kernel.runtime.ended ? 'ended' : 'login';
      wm.restore(stored.windows);
      desktop.positions = stored.desktop ?? {};
    } else {
      this.firstSession = true;
      this.phase = bundle.intro ? 'intro' : 'login';
    }
    this.startTimers();
  }

  /** Called when the intro is dismissed: show the session login screen. */
  toLogin(): void {
    this.phase = 'login';
  }

  /** Login screen → desktop. Autostart apps only on the very first session. */
  enterDesktop(): void {
    const k = this.kernel;
    if (!k) return;
    this.phase = 'desktop';
    this.locked = false;
    if (this.firstSession) {
      this.firstSession = false;
      for (const a of k.bundle.session.autostart ?? []) {
        if (a.path) this.openPath(a.path);
        else wm.open(a.app);
      }
    }
    this.save();
  }

  lock(): void {
    if (this.phase !== 'desktop') return;
    this.save();
    this.locked = true;
  }

  private wire(k: Kernel): void {
    // Kernel events can fire while Svelte is evaluating a $derived (e.g. a read emitting fs.read);
    // UI state is therefore only touched from a microtask.
    const on: typeof k.bus.on = (type, fn) => k.bus.on(type, (p) => queueMicrotask(() => fn(p)));
    k.bus.on('fs.change', this.invalidate);
    k.runtime.subscribe(this.invalidate);
    on('objective.complete', (e) => {
      notify.push({ kind: 'objective', title: 'Objectif atteint', body: e.title });
      this.save();
    });
    on('objective.available', (e) => {
      const o = k.bundle.objectives.find((x) => x.id === e.id);
      if (o && !o.optional) notify.push({ kind: 'system', title: 'Nouvel objectif', body: o.title, action: { label: 'Dossier', run: () => wm.open('case') } }, 7000);
    });
    on('mail.delivered', (e) => {
      notify.push({
        kind: 'mail',
        title: e.from.replace(/<.*>/, '').trim() || 'Nouveau message',
        body: e.subject,
        action: { label: 'Lire', run: () => wm.open('mail', { path: e.path }) },
      }, 9000);
    });
    on('evidence.found', (e) => {
      notify.push({ kind: 'evidence', title: 'Pièce ajoutée au dossier', body: e.title, action: { label: 'Voir', run: () => wm.open('case', { tab: 'evidence' }) } }, 6000);
    });
    on('scenario.notify', (e) => notify.push({ kind: 'system', title: e.title, body: e.body }));
    on('scenario.end', () => {
      const ending = k.runtime.state.ending;
      if (ending) {
        const seen = this.discoveredEndings(k.bundle.id);
        if (!seen.includes(ending)) store(ENDINGS_KEY(k.bundle.id), [...seen, ending]);
      }
      this.save();
      setTimeout(() => {
        this.phase = 'ended';
        sound.play('end');
      }, 2500);
    });
    on('chat.message', (e) => {
      const name = k.bundle.chat?.contacts.find((c) => c.id === e.contact)?.name ?? e.contact;
      notify.push({ kind: 'mail', title: name, body: e.text, action: { label: 'Répondre', run: () => wm.open('chat', { contact: e.contact }) } }, 7000);
    });
    on('app.open', (e) => {
      if (e.path && /^(https?|file):\/\//.test(e.path)) wm.open('browser', { url: e.path });
      else if (e.path) this.openPath(e.path, e.appId || undefined);
      else if (e.appId && appById(e.appId)) wm.open(e.appId);
      else if (e.appId) notify.push({ kind: 'error', title: 'open', body: `Application inconnue : ${e.appId}` });
    });
  }

  /** Opens a VFS path with the right app (permission checks happen in the app). */
  openPath(path: string, appId?: string): void {
    const k = this.kernel;
    if (!k) return;
    let isDir = false;
    try {
      isDir = k.vfs.stat(path, this.cred).type === 'dir';
    } catch {
      /* the app will show the error */
    }
    const app = appId ? appById(appId) : appForPath(path, isDir);
    if (!app) return;
    if (app.id === 'mail') {
      wm.open('mail', { path });
      return;
    }
    wm.open(app.id, { path });
  }

  get cred() {
    return this.kernel!.users.cred(this.kernel!.sessionUser);
  }

  mailMeta(path: string) {
    return parseMail(this.kernel!.vfs.readFile(path, this.cred, { silent: true }));
  }

  private startTimers(): void {
    this.stopTimers();
    this.timers.push(setInterval(() => this.tick++, 1000));
    this.timers.push(setInterval(() => this.save(), AUTOSAVE_MS));
    window.addEventListener('beforeunload', this.save);
  }

  private stopTimers(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    window.removeEventListener('beforeunload', this.save);
  }

  save = (): void => {
    const k = this.kernel;
    if (!k || this.phase === 'intro') return;
    store(SAVE_KEY(k.bundle.id), { save: k.save(), windows: wm.snapshot(), desktop: $state.snapshot(desktop.positions) } satisfies StoredGame);
  };

  quitToMenu(): void {
    this.save();
    this.stopTimers();
    wm.reset();
    this.kernel = null;
    this.phase = 'select';
  }

  async restart(): Promise<void> {
    const id = this.kernel?.bundle.id;
    if (!id) return;
    this.stopTimers();
    this.kernel = null;
    await this.start(id, { fresh: true });
  }
}

export const os = new OS();
