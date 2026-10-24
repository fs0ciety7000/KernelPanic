<script lang="ts">
  import { tick } from 'svelte';
  import { contextMenu, type MenuItem } from '$lib/os/menu.svelte';
  import Icon from './Icon.svelte';

  let el = $state<HTMLDivElement>();
  let pos = $state({ x: 0, y: 0 });
  let active = $state(-1);
  let sub = $state<{ index: number; x: number; y: number } | null>(null);

  // Keep the menu inside the viewport (flip left/up near the edges).
  $effect(() => {
    if (!contextMenu.open) return;
    void contextMenu.items;
    active = -1;
    sub = null;
    pos = { x: contextMenu.x, y: contextMenu.y };
    tick().then(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      pos = {
        x: Math.max(4, Math.min(contextMenu.x, window.innerWidth - r.width - 4)),
        y: Math.max(4, contextMenu.y + r.height > window.innerHeight - 4 ? contextMenu.y - r.height : contextMenu.y),
      };
      el.focus();
    });
  });

  function run(item: MenuItem) {
    if (item.disabled || item.separator || item.submenu) return;
    contextMenu.close();
    item.run?.();
  }

  function openSub(i: number, target: HTMLElement) {
    const r = target.getBoundingClientRect();
    const right = r.right + 200 > window.innerWidth ? r.left - 204 : r.right + 2;
    sub = { index: i, x: right, y: r.top - 5 };
  }

  const selectable = $derived(contextMenu.items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0));

  function onKey(e: KeyboardEvent) {
    if (!contextMenu.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (sub) sub = null;
      else contextMenu.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = selectable.indexOf(active);
      const next = e.key === 'ArrowDown' ? selectable[(idx + 1) % selectable.length] : selectable[(idx - 1 + selectable.length) % selectable.length];
      active = next ?? -1;
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      run(contextMenu.items[active]!);
    }
  }
</script>

<svelte:window
  onpointerdown={(e) => { if (contextMenu.open && !(e.target as HTMLElement).closest('.ctx')) contextMenu.close(); }}
  onkeydown={onKey}
  onblur={() => contextMenu.close()}
/>

{#if contextMenu.open}
  <div class="ctx" role="menu" tabindex="-1" bind:this={el} style="left:{pos.x}px;top:{pos.y}px" oncontextmenu={(e) => e.preventDefault()}>
    {#each contextMenu.items as item, i (i)}
      {#if item.separator}
        <div class="sep" role="separator"></div>
      {:else}
        <button
          role="menuitem"
          class:danger={item.danger}
          class:active={active === i}
          disabled={item.disabled}
          onpointerenter={(e) => { active = i; if (item.submenu) openSub(i, e.currentTarget); else sub = null; }}
          onclick={(e) => (item.submenu ? openSub(i, e.currentTarget) : run(item))}
        >
          <span class="ico">{#if item.checked}<Icon name="check" size={14} />{:else if item.icon}<Icon name={item.icon} size={14} />{/if}</span>
          <span class="lbl">{item.label}</span>
          {#if item.shortcut}<span class="kbd mono">{item.shortcut}</span>{/if}
          {#if item.submenu}<span class="more"><Icon name="chevron-right" size={12} /></span>{/if}
        </button>
      {/if}
    {/each}
  </div>
  {#if sub}
    {@const items = contextMenu.items[sub.index]?.submenu ?? []}
    <div class="ctx subm" role="menu" style="left:{sub.x}px;top:{sub.y}px">
      {#each items as item, i (i)}
        {#if item.separator}
          <div class="sep" role="separator"></div>
        {:else}
          <button role="menuitem" disabled={item.disabled} onclick={() => run(item)}>
            <span class="ico">{#if item.icon}<Icon name={item.icon} size={14} />{/if}</span>
            <span class="lbl">{item.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
{/if}

<style>
  .ctx {
    position: fixed;
    z-index: 20000;
    min-width: 220px;
    padding: 5px;
    background: rgba(13, 17, 24, 0.96);
    backdrop-filter: blur(18px) saturate(140%);
    border: 1px solid var(--kp-line-strong);
    border-radius: var(--kp-radius-m);
    box-shadow: var(--kp-shadow-2);
    outline: none;
    animation: pop 120ms var(--kp-ease);
    user-select: none;
  }
  .subm { min-width: 190px; }
  @keyframes pop { from { opacity: 0; transform: scale(0.97); } }
  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 28px;
    padding: 0 10px 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--kp-text-0);
    font-size: 12.5px;
    text-align: left;
  }
  button.active:not(:disabled), button:hover:not(:disabled) { background: var(--kp-cyan-dim); }
  button.danger { color: var(--kp-red); }
  button.danger.active, button.danger:hover:not(:disabled) { background: var(--kp-red-dim); }
  button:disabled { color: var(--kp-text-2); cursor: default; }
  .ico { width: 16px; display: grid; place-items: center; color: var(--kp-text-1); }
  .danger .ico { color: inherit; }
  .lbl { flex: 1; white-space: nowrap; }
  .kbd { color: var(--kp-text-2); font-size: 10.5px; }
  .more { color: var(--kp-text-2); display: grid; }
  .sep { height: 1px; margin: 5px 6px; background: var(--kp-line); }
</style>
