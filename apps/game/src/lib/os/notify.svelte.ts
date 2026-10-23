import { sound, type Cue } from './sound.svelte';

export type ToastKind = 'system' | 'objective' | 'evidence' | 'mail' | 'error' | 'success';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

const CUE: Record<ToastKind, Cue> = { system: 'notify', objective: 'objective', evidence: 'success', mail: 'mail', error: 'error', success: 'success' };
// When several toasts arrive together (objective done + next one unlocked + mail), only the first is heard.
const SOUND_GAP_MS = 400;

class Notifier {
  toasts = $state<Toast[]>([]);
  private seq = 0;
  private lastSound = 0;

  push(t: Omit<Toast, 'id'>, ttl = 6000): void {
    const id = ++this.seq;
    const now = Date.now();
    if (now - this.lastSound > SOUND_GAP_MS) {
      this.lastSound = now;
      sound.play(CUE[t.kind]);
    }
    this.toasts = [...this.toasts.slice(-3), { ...t, id }];
    if (ttl) setTimeout(() => this.dismiss(id), ttl);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const notify = new Notifier();
