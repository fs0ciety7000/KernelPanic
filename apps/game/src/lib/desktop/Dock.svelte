<script lang="ts">
  import { APPS } from '$lib/os/apps';
  import { wm } from '$lib/os/wm.svelte';
  import Icon from './Icon.svelte';

  const running = $derived(new Set(wm.windows.map((w) => w.appId)));
  const focusedApp = $derived(wm.focused?.appId);
</script>

<nav class="dock" aria-label="Dock">
  {#each APPS.filter((a) => a.dock) as app (app.id)}
    <button
      class="item"
      class:running={running.has(app.id)}
      class:focused={focusedApp === app.id}
      onclick={() => wm.activateApp(app.id)}
      aria-label={app.title}
    >
      <span class="glyph"><Icon name={app.icon} size={22} /></span>
      <span class="label">{app.title}</span>
    </button>
  {/each}
</nav>

<style>
  .dock {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    padding: 7px;
    background: rgba(10, 14, 20, 0.7);
    backdrop-filter: blur(18px) saturate(140%);
    border: 1px solid var(--kp-line-strong);
    border-radius: var(--kp-radius-l);
    box-shadow: var(--kp-shadow-2);
    z-index: 9999;
  }
  .item {
    position: relative;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
    color: var(--kp-text-1);
    transition: transform var(--kp-dur-fast) var(--kp-ease), background var(--kp-dur-fast) var(--kp-ease), color var(--kp-dur-fast);
  }
  .item:hover {
    transform: translateY(-3px);
    background: var(--kp-bg-4);
    color: var(--kp-text-0);
  }
  .item.focused { color: var(--kp-cyan); border-color: rgba(62, 230, 245, 0.18); background: var(--kp-cyan-dim); }
  .item.running::after {
    content: '';
    position: absolute;
    bottom: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--kp-cyan);
    box-shadow: 0 0 8px var(--kp-cyan);
  }
  .label {
    position: absolute;
    bottom: 58px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(12, 16, 22, 0.95);
    border: 1px solid var(--kp-line-strong);
    color: var(--kp-text-0);
    font-size: 11.5px;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity var(--kp-dur-fast), transform var(--kp-dur-fast);
  }
  .item:hover .label { opacity: 1; transform: none; }
</style>
