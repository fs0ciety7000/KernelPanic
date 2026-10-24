import { sound, type Cue } from './sound.svelte';

export type ToastKind = 'system' | 'objective' | 'evidence' | 'mail' | 'error' | 'success';

export interface Toast {
  id: number;
  /** Wall-clock time of arrival (for the notification center). */
  at?: number;
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
  /** Notification center: everything that was shown this session, newest first. */
  history = $state<Toast[]>([]);
  unread = $state(0);
  /** Do-not-disturb: toasts go straight to the center, silently. */
  quiet = $state(false);
  private seq = 0;
  private lastSound = 0;

  push(t: Omit<Toast, 'id'>, ttl = 6000): void {
    const id = ++this.seq;
    const now = Date.now();
    this.history = [{ ...t, id, at: now }, ...this.history].slice(0, 50);
    this.unread++;
    if (this.quiet) return;
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

  markRead(): void {
    this.unread = 0;
  }

  clear(): void {
    this.history = [];
    this.unread = 0;
  }
}

export const notify = new Notifier();
