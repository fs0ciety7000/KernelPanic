<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { wm, TOPBAR_H, TASKBAR_H, type WindowState } from '$lib/os/wm.svelte';
  import { appById, type AppProps } from '$lib/os/apps';
  import Icon from './Icon.svelte';

  let { win }: { win: WindowState } = $props();

  const app = appById(win.appId)!;
  let Comp = $state<Component<AppProps> | null>(null);
  let loadError = $state<string | null>(null);

  onMount(() => {
    app.load().then(
      (m) => (Comp = m.default),
      (e) => (loadError = String(e)),
    );
  });

  const focused = $derived(wm.focused?.id === win.id);
  let el: HTMLElement;

  // Keyboard users (dock, shortcuts) land inside the window that just came to the front.
  $effect(() => {
    if (focused && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  });
  const MIN_W = 320;
  const MIN_H = 200;

  // Drag & resize via pointer capture: no global listeners left behind.
  function startDrag(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    wm.focus(win.id);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let ox = e.clientX - win.x;
    let oy = e.clientY - win.y;
    let detached = !(win.maximized || win.snap);
    let zone: 'left' | 'right' | 'top' | null = null;
    const move = (ev: PointerEvent) => {
      // Dragging a maximized/tiled window detaches it under the cursor, like a real desktop.
      if (!detached) {
        if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 6) return;
        // Keep the grab point at the same relative position in the restored window.
        const tiledW = win.snap ? window.innerWidth / 2 : window.innerWidth;
        const tiledLeft = win.snap === 'right' ? window.innerWidth / 2 : 0;
        const ratio = (e.clientX - tiledLeft) / tiledW;
        win.maximized = false;
        win.snap = null;
        ox = Math.round(win.w * Math.min(Math.max(ratio, 0.1), 0.9));
        oy = 18;
        detached = true;
      }
      win.x = Math.min(Math.max(ev.clientX - ox, -win.w + 120), window.innerWidth - 120);
      win.y = Math.min(Math.max(ev.clientY - oy, TOPBAR_H), window.innerHeight - TASKBAR_H - 36);
      zone = ev.clientY <= 2 ? 'top' : ev.clientX <= 3 ? 'left' : ev.clientX >= window.innerWidth - 4 ? 'right' : null;
      wm.snapPreview = zone;
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      wm.snapPreview = null;
      if (zone === 'top') wm.toggleMaximize(win.id);
      else if (zone) wm.setSnap(win.id, zone);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function startResize(e: PointerEvent, dir: string) {
    if (e.button !== 0 || win.maximized) return;
    e.stopPropagation();
    wm.focus(win.id);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y, w: win.w, h: win.h };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (dir.includes('e')) win.w = Math.max(MIN_W, start.w + dx);
      if (dir.includes('s')) win.h = Math.max(MIN_H, start.h + dy);
      if (dir.includes('w')) {
        const w = Math.max(MIN_W, start.w - dx);
        win.x = start.wx + (start.w - w);
        win.w = w;
      }
      if (dir.includes('n')) {
        const h = Math.max(MIN_H, start.h - dy);
        const y = Math.max(TOPBAR_H, start.wy + (start.h - h));
        win.h = start.h + (start.wy - y);
        win.y = y;
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  const style = $derived(
    win.maximized || win.snap
      ? `z-index:${win.z}`
      : `left:${win.x}px;top:${win.y}px;width:${win.w}px;height:${win.h}px;z-index:${win.z}`,
  );
</script>

<section
  bind:this={el}
  tabindex="-1"
  class="window"
  class:focused
  class:maximized={win.maximized}
  class:snap-left={win.snap === 'left'}
  class:snap-right={win.snap === 'right'}
  class:minimized={win.minimized}
  {style}
  aria-label={win.title}
  onpointerdown={() => wm.focus(win.id)}
  onfocusin={() => wm.focus(win.id)}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="titlebar" onpointerdown={startDrag} ondblclick={() => wm.toggleMaximize(win.id)}>
    <div class="controls">
      <button class="ctl close" aria-label="Fermer" onclick={() => wm.close(win.id)}><Icon name="x" size={8} stroke={2.6} /></button>
      <button class="ctl min" aria-label="Réduire" onclick={() => wm.minimize(win.id)}><Icon name="minus" size={8} stroke={2.6} /></button>
      <button class="ctl max" aria-label="Agrandir" onclick={() => wm.toggleMaximize(win.id)}><Icon name="plus" size={8} stroke={2.6} /></button>
    </div>
    <div class="title">
      <Icon name={app.icon} size={13} />
      <span>{win.title}</span>
    </div>
    <div class="spacer"></div>
  </header>
  <div class="content">
    {#if Comp}
      <Comp {win} />
    {:else if loadError}
      <div class="kp-error">{loadError}</div>
    {/if}
  </div>
  {#if !win.maximized && !win.snap}
    {#each ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as dir (dir)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="rz rz-{dir}" onpointerdown={(e) => startResize(e, dir)}></div>
    {/each}
  {/if}
</section>

<style>
  .window {
    position: absolute;
    display: flex;
    flex-direction: column;
    background: var(--kp-bg-1);
    border: 1px solid var(--kp-line);
    border-radius: var(--kp-radius-m);
    box-shadow: var(--kp-shadow-2);
    overflow: hidden;
    animation: open var(--kp-dur) var(--kp-ease);
  }
  .window:focus { outline: none; }
  .window.focused {
    border-color: var(--kp-line-strong);
    box-shadow: var(--kp-shadow-2), 0 0 0 1px rgba(62, 230, 245, 0.06), 0 30px 80px -30px rgba(62, 230, 245, 0.18);
  }
  .window.focused::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(62, 230, 245, 0.45), transparent);
    z-index: 2;
    pointer-events: none;
  }
  .window.maximized,
  .window.snap-left,
  .window.snap-right {
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: calc(100% - 48px) !important;
    border-radius: 0;
  }
  .window.snap-left { width: 50% !important; border-right-color: var(--kp-line-strong); }
  .window.snap-right { left: 50% !important; width: 50% !important; }
  .window.minimized {
    display: none;
  }
  @keyframes open {
    from { opacity: 0; transform: scale(0.965) translateY(6px); }
  }

  .titlebar {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 12px;
    background: var(--kp-bg-2);
    border-bottom: 1px solid var(--kp-line);
    flex-shrink: 0;
    cursor: default;
  }
  .focused .titlebar {
    background: var(--kp-bg-3);
  }
  .controls,
  .spacer {
    display: flex;
    gap: 8px;
    width: 64px;
  }
  .ctl {
    display: grid;
    place-items: center;
    width: 12px;
    height: 12px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--kp-bg-4);
    color: transparent;
    transition: background var(--kp-dur-fast) var(--kp-ease);
  }
  .controls:hover .ctl { color: rgba(5, 7, 11, 0.75); }
  .controls:hover .close { background: var(--kp-red); }
  .controls:hover .min { background: var(--kp-amber); }
  .controls:hover .max { background: var(--kp-green); }
  .title {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: var(--kp-text-2);
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    white-space: nowrap;
  }
  .focused .title {
    color: var(--kp-text-0);
  }
  .title span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .content {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .rz { position: absolute; z-index: 3; }
  .rz-n, .rz-s { left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
  .rz-n { top: -3px; }
  .rz-s { bottom: -3px; }
  .rz-e, .rz-w { top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
  .rz-e { right: -3px; }
  .rz-w { left: -3px; }
  .rz-ne, .rz-nw, .rz-se, .rz-sw { width: 12px; height: 12px; }
  .rz-ne { top: -3px; right: -3px; cursor: nesw-resize; }
  .rz-sw { bottom: -3px; left: -3px; cursor: nesw-resize; }
  .rz-nw { top: -3px; left: -3px; cursor: nwse-resize; }
  .rz-se { bottom: -3px; right: -3px; cursor: nwse-resize; }
</style>
