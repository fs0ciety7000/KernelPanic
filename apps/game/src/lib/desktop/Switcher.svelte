<script lang="ts">
  import { wm } from '$lib/os/wm.svelte';
  import { appById } from '$lib/os/apps';
  import Icon from './Icon.svelte';

  const wins = $derived(wm.switcher.order.map((id) => wm.windows.find((w) => w.id === id)).filter((w) => !!w));
</script>

{#if wm.switcher.open}
  <div class="switcher" role="listbox" aria-label="Fenêtres ouvertes">
    {#each wins as w, i (w.id)}
      <div class="card" class:on={i === wm.switcher.index} role="option" aria-selected={i === wm.switcher.index}>
        <span class="ic"><Icon name={appById(w.appId)?.icon ?? 'file'} size={26} /></span>
        <span class="t">{w.title}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .switcher {
    position: absolute;
    left: 50%;
    top: 42%;
    transform: translate(-50%, -50%);
    display: flex;
    gap: 8px;
    max-width: calc(100vw - 40px);
    padding: 14px;
    background: rgba(12, 16, 22, 0.9);
    backdrop-filter: blur(22px);
    border: 1px solid var(--kp-line-strong);
    border-radius: var(--kp-radius-l);
    box-shadow: var(--kp-shadow-2);
    z-index: 15000;
    overflow: hidden;
  }
  .card { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 120px; padding: 14px 8px; border-radius: var(--kp-radius-m); border: 1px solid transparent; }
  .card.on { background: var(--kp-cyan-dim); border-color: rgba(62, 230, 245, 0.4); }
  .ic { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--kp-bg-3); color: var(--kp-cyan); }
  .t { font-size: 11.5px; text-align: center; color: var(--kp-text-1); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .on .t { color: var(--kp-text-0); }
</style>
