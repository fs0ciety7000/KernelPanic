export type ToastKind = 'system' | 'objective' | 'mail' | 'error' | 'success';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

class Notifier {
  toasts = $state<Toast[]>([]);
  private seq = 0;

  push(t: Omit<Toast, 'id'>, ttl = 6000): void {
    const id = ++this.seq;
    this.toasts = [...this.toasts.slice(-3), { ...t, id }];
    if (ttl) setTimeout(() => this.dismiss(id), ttl);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const notify = new Notifier();
