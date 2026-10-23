<script lang="ts">
  import { notify } from '$lib/os/notify.svelte';
  import Icon from './Icon.svelte';

  const ICON = { system: 'info', objective: 'diamond', evidence: 'key', mail: 'mail', error: 'alert', success: 'check-circle' } as const;
</script>

<div class="toasts" aria-live="polite">
  {#each notify.toasts as t (t.id)}
    <div class="toast {t.kind}">
      <span class="ico"><Icon name={ICON[t.kind]} size={16} /></span>
      <div class="txt">
        <div class="title">{t.title}</div>
        {#if t.body}<div class="body">{t.body}</div>{/if}
      </div>
      {#if t.action}
        <button class="kp-btn" onclick={() => { t.action!.run(); notify.dismiss(t.id); }}>{t.action.label}</button>
      {/if}
      <button class="close" aria-label="Fermer" onclick={() => notify.dismiss(t.id)}><Icon name="x" size={12} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    top: 42px;
    right: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10001;
    width: 340px;
  }
  .toast {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 34px 12px 14px;
    background: rgba(12, 16, 22, 0.88);
    backdrop-filter: blur(18px) saturate(140%);
    border: 1px solid var(--kp-line-strong);
    border-radius: var(--kp-radius-m);
    box-shadow: var(--kp-shadow-2);
    animation: slide var(--kp-dur-slow) var(--kp-ease);
  }
  @keyframes slide { from { opacity: 0; transform: translateX(16px); } }
  .toast.objective { border-left: 2px solid var(--kp-violet); box-shadow: var(--kp-shadow-2), 0 0 40px -12px rgba(157, 123, 255, 0.5); }
  .ico { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; background: var(--kp-cyan-dim); color: var(--kp-cyan); }
  .objective .ico, .evidence .ico { background: var(--kp-violet-dim); color: var(--kp-violet); }
  .toast.evidence { border-left: 2px solid rgba(157, 123, 255, 0.6); }
  .mail .ico { background: var(--kp-cyan-dim); color: var(--kp-cyan); }
  .error .ico { background: var(--kp-red-dim); color: var(--kp-red); }
  .success .ico { background: var(--kp-green-dim); color: var(--kp-green); }
  .txt { flex: 1; min-width: 0; }
  .title { font-weight: 600; font-size: 12.5px; }
  .body { color: var(--kp-text-1); font-size: 12px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .close { position: absolute; top: 8px; right: 8px; border: 0; background: transparent; color: var(--kp-text-2); padding: 2px; display: grid; border-radius: 4px; }
  .close:hover { color: var(--kp-text-0); background: var(--kp-bg-4); }
</style>
