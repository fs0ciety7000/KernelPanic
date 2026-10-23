import { appById, type AppManifest } from './apps';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TOPBAR_H = 30;
export const DOCK_SPACE = 84;

export class WindowState {
  id: number;
  appId: string;
  title = $state('');
  x = $state(0);
  y = $state(0);
  w = $state(600);
  h = $state(400);
  z = $state(1);
  minimized = $state(false);
  maximized = $state(false);
  /** App-specific arguments (path to open…). Reassigned when a singleton is re-targeted. */
  args = $state<Record<string, unknown>>({});
  /** Bumps when args change on an existing window, so apps can react. */
  nonce = $state(0);

  constructor(id: number, app: AppManifest, rect: Rect, args: Record<string, unknown>) {
    this.id = id;
    this.appId = app.id;
    this.title = app.title;
    Object.assign(this, rect);
    this.args = args;
  }
}

export interface WindowSnapshot extends Rect {
  appId: string;
  args: Record<string, unknown>;
  maximized: boolean;
  minimized: boolean;
}

class WindowManager {
  windows = $state<WindowState[]>([]);
  private seq = 0;
  private zTop = 10;

  get focused(): WindowState | undefined {
    let top: WindowState | undefined;
    for (const w of this.windows) if (!w.minimized && (!top || w.z > top.z)) top = w;
    return top;
  }

  private viewport() {
    return { w: window.innerWidth, h: window.innerHeight - TOPBAR_H - DOCK_SPACE };
  }

  private nextRect(app: AppManifest): Rect {
    const vp = this.viewport();
    const w = Math.min(app.defaultSize.w, vp.w - 40);
    const h = Math.min(app.defaultSize.h, vp.h - 20);
    const n = this.windows.length % 6;
    return {
      w,
      h,
      x: Math.max(10, Math.round((vp.w - w) / 2 - 120 + n * 36)),
      y: Math.max(TOPBAR_H + 10, Math.round(TOPBAR_H + (vp.h - h) / 2 - 40 + n * 28)),
    };
  }

  open(appId: string, args: Record<string, unknown> = {}, rect?: Partial<Rect>): WindowState | undefined {
    const app = appById(appId);
    if (!app) return undefined;
    if (app.singleton) {
      const existing = this.windows.find((w) => w.appId === appId);
      if (existing) {
        if (Object.keys(args).length) {
          existing.args = args;
          existing.nonce++;
        }
        this.focus(existing.id);
        return existing;
      }
    }
    const win = new WindowState(++this.seq, app, { ...this.nextRect(app), ...rect }, args);
    win.z = ++this.zTop;
    this.windows.push(win);
    return win;
  }

  close(id: number): void {
    this.windows = this.windows.filter((w) => w.id !== id);
  }

  focus(id: number): void {
    const w = this.windows.find((x) => x.id === id);
    if (!w) return;
    w.minimized = false;
    if (w.z !== this.zTop) w.z = ++this.zTop;
  }

  minimize(id: number): void {
    const w = this.windows.find((x) => x.id === id);
    if (w) w.minimized = true;
  }

  toggleMaximize(id: number): void {
    const w = this.windows.find((x) => x.id === id);
    if (w) w.maximized = !w.maximized;
  }

  /** Dock click: launch, focus, or minimize if already focused. */
  activateApp(appId: string): void {
    const mine = this.windows.filter((w) => w.appId === appId);
    if (!mine.length) {
      this.open(appId);
      return;
    }
    const top = mine.reduce((a, b) => (b.z > a.z ? b : a));
    if (this.focused === top) this.minimize(top.id);
    else this.focus(top.id);
  }

  cycle(): void {
    const visible = this.windows.filter((w) => !w.minimized).sort((a, b) => a.z - b.z);
    if (visible.length > 1) this.focus(visible[0]!.id);
  }

  snapshot(): WindowSnapshot[] {
    return [...this.windows]
      .sort((a, b) => a.z - b.z)
      .map((w) => ({ appId: w.appId, args: $state.snapshot(w.args), x: w.x, y: w.y, w: w.w, h: w.h, maximized: w.maximized, minimized: w.minimized }));
  }

  restore(snaps: WindowSnapshot[]): void {
    this.windows = [];
    for (const s of snaps) {
      const win = this.open(s.appId, s.args, { x: s.x, y: s.y, w: s.w, h: s.h });
      if (win) {
        win.maximized = s.maximized;
        win.minimized = s.minimized;
      }
    }
  }

  reset(): void {
    this.windows = [];
  }
}

export const wm = new WindowManager();
