// Per-browser desktop preferences (not part of a save game).

import { load, store } from './storage';

export const WALLPAPERS = [
  { id: 'noctis', name: 'Noctis', preview: 'radial-gradient(120% 90% at 50% 40%, #0d1420 0%, #080b11 55%, #05070b 100%)' },
  { id: 'aurora', name: 'Aurore', preview: 'linear-gradient(160deg, #0b1d2a 0%, #0a0e14 45%, #1a1030 100%)' },
  { id: 'circuit', name: 'Circuit', preview: 'linear-gradient(180deg, #07120f 0%, #05070b 100%)' },
  { id: 'dusk', name: 'Crépuscule', preview: 'linear-gradient(170deg, #1d1326 0%, #0b0d14 55%, #05070b 100%)' },
  { id: 'mono', name: 'Graphite', preview: 'linear-gradient(180deg, #111419 0%, #0a0c10 100%)' },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]['id'];

interface Prefs {
  wallpaper: WallpaperId;
  readable: boolean;
  desktopHidden: boolean;
}

const KEY = 'kp.settings';
const DEFAULTS: Prefs = { wallpaper: 'noctis', readable: false, desktopHidden: false };

class Settings {
  wallpaper = $state<WallpaperId>(DEFAULTS.wallpaper);
  /** Larger text, no grain/glow (DESIGN_SYSTEM §9). */
  readable = $state(DEFAULTS.readable);
  /** Show dotfiles on the desktop. */
  desktopHidden = $state(DEFAULTS.desktopHidden);

  constructor() {
    const p = { ...DEFAULTS, ...(load<Partial<Prefs>>(KEY) ?? {}) };
    this.wallpaper = p.wallpaper;
    this.readable = p.readable;
    this.desktopHidden = p.desktopHidden;
  }

  persist(): void {
    store(KEY, { wallpaper: this.wallpaper, readable: this.readable, desktopHidden: this.desktopHidden } satisfies Prefs);
  }
}

export const settings = new Settings();
