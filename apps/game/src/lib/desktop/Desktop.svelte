<script lang="ts">
  import { onMount } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import { help } from '$lib/os/help.svelte';
  import { settings } from '$lib/os/settings.svelte';
  import Taskbar from './Taskbar.svelte';
  import Toasts from './Toasts.svelte';
  import Window from './Window.svelte';
  import Help from './Help.svelte';
  import DesktopIcons from './DesktopIcons.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Switcher from './Switcher.svelte';

  onMount(() => help.maybeShowFirstTime());

  function onKey(e: KeyboardEvent) {
    if (os.locked) return;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const key = e.key.toLowerCase();
    if (e.ctrlKey && e.altKey && key === 't') {
      handled();
      wm.open('terminal');
    } else if ((e.ctrlKey || e.altKey) && e.key === '`') {
      handled();
      wm.switchNext(e.shiftKey);
    } else if (e.ctrlKey && e.altKey && key === 'w') {
      handled();
      const f = wm.focused;
      if (f) wm.close(f.id);
    } else if (e.ctrlKey && e.altKey && key === 'h') {
      handled();
      help.toggle();
    } else if (e.ctrlKey && e.altKey && key === 'l') {
      handled();
      os.lock();
    } else if (e.ctrlKey && e.altKey && key === 'd') {
      handled();
      wm.toggleShowDesktop();
    } else if (e.ctrlKey && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp')) {
      const f = wm.focused;
      if (!f) return;
      handled();
      if (e.key === 'ArrowUp') wm.toggleMaximize(f.id);
      else wm.setSnap(f.id, f.snap === (e.key === 'ArrowLeft' ? 'left' : 'right') ? null : e.key === 'ArrowLeft' ? 'left' : 'right');
    }
  }

  // The switcher stays open while the modifier is held, like Alt+Tab.
  function onKeyUp(e: KeyboardEvent) {
    if (wm.switcher.open && (e.key === 'Control' || e.key === 'Alt')) wm.switchCommit();
  }
</script>

<!-- Capture phase: desktop shortcuts must win over apps that swallow keys (xterm). -->
<svelte:window onkeydowncapture={onKey} onkeyupcapture={onKeyUp} />

<main class="desktop" class:readable={settings.readable}>
  <div class="wallpaper wp-{settings.wallpaper}" aria-hidden="true">
    <div class="glow g1"></div>
    <div class="glow g2"></div>
    <div class="grid"></div>
    {#if !settings.readable}<div class="grain"></div>{/if}
    <div class="mark mono">KERNEL<span>_</span>PANIC</div>
  </div>

  <DesktopIcons />

  {#each wm.windows as win (win.id)}
    <Window {win} />
  {/each}

  {#if wm.snapPreview}
    <div class="snap-preview {wm.snapPreview}" aria-hidden="true"></div>
  {/if}

  <Taskbar />
  <Toasts />
  <Help />
  <Switcher />
  <ContextMenu />
</main>

<style>
  /* clip, not hidden: a focused field must never scroll the whole desktop. */
  .desktop { position: fixed; inset: 0; overflow: clip; }
  .wallpaper { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 40%, #0d1420 0%, #080b11 55%, #05070b 100%); }
  .wp-aurora { background: linear-gradient(160deg, #0b1d2a 0%, #0a0e14 45%, #1a1030 100%); }
  .wp-circuit {
    background:
      linear-gradient(rgba(90, 242, 160, 0.05) 1px, transparent 1px) 0 0 / 24px 24px,
      linear-gradient(90deg, rgba(90, 242, 160, 0.05) 1px, transparent 1px) 0 0 / 24px 24px,
      linear-gradient(180deg, #07120f 0%, #05070b 100%);
  }
  .wp-dusk { background: linear-gradient(170deg, #1d1326 0%, #0b0d14 55%, #05070b 100%); }
  .wp-mono { background: linear-gradient(180deg, #111419 0%, #0a0c10 100%); }
  .wp-mono .glow, .wp-circuit .grid { display: none; }
  .glow { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.55; }
  .g1 { width: 640px; height: 640px; left: -160px; top: -200px; background: radial-gradient(circle, rgba(62, 230, 245, 0.22), transparent 70%); animation: drift 60s ease-in-out infinite alternate; }
  .g2 { width: 720px; height: 720px; right: -220px; bottom: -260px; background: radial-gradient(circle, rgba(157, 123, 255, 0.22), transparent 70%); animation: drift 70s ease-in-out infinite alternate-reverse; }
  .wp-aurora .g1 { background: radial-gradient(circle, rgba(90, 242, 160, 0.18), transparent 70%); }
  .wp-dusk .g2 { background: radial-gradient(circle, rgba(255, 79, 109, 0.16), transparent 70%); }
  @keyframes drift { to { transform: translate(120px, 80px); } }
  .grid {
    position: absolute; inset: 0; opacity: 0.5;
    background-image:
      linear-gradient(rgba(148, 170, 200, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 170, 200, 0.035) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  }
  .grain {
    position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .mark { position: absolute; right: 28px; bottom: 66px; font-size: 13px; letter-spacing: 0.4em; color: rgba(232, 238, 247, 0.08); font-weight: 700; }
  .mark span { color: rgba(62, 230, 245, 0.25); }
  .snap-preview {
    position: absolute;
    top: 6px;
    bottom: 54px;
    z-index: 9000;
    border: 1px solid rgba(62, 230, 245, 0.55);
    border-radius: var(--kp-radius-m);
    background: rgba(62, 230, 245, 0.08);
    box-shadow: inset 0 0 60px rgba(62, 230, 245, 0.08);
    pointer-events: none;
    animation: fade 120ms var(--kp-ease);
  }
  .snap-preview.left { left: 6px; width: calc(50% - 9px); }
  .snap-preview.right { right: 6px; width: calc(50% - 9px); }
  .snap-preview.top { left: 6px; right: 6px; }
  @keyframes fade { from { opacity: 0; } }
  .readable { font-size: 14.5px; }
  .readable :global(.glow) { display: none; }
</style>
