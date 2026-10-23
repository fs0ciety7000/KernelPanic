<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import TopBar from './TopBar.svelte';
  import Dock from './Dock.svelte';
  import Toasts from './Toasts.svelte';
  import Window from './Window.svelte';
  import Icon from './Icon.svelte';

  const home = $derived(os.kernel!.users.get(os.kernel!.sessionUser)!.home);
  const shortcuts = $derived([
    { label: 'Dossier personnel', icon: 'home', run: () => wm.open('files', { path: home }) },
    { label: 'Journaux', icon: 'activity', run: () => wm.open('logs', { path: '/var/log/auth.log' }) },
    { label: 'Dossier d’enquête', icon: 'case', run: () => wm.open('case') },
  ]);

  let selected = $state<number | null>(null);

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      wm.open('terminal');
    } else if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      wm.cycle();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<main class="desktop">
  <div class="wallpaper" aria-hidden="true">
    <div class="glow g1"></div>
    <div class="glow g2"></div>
    <div class="grid"></div>
    <div class="grain"></div>
    <div class="mark mono">KERNEL<span>_</span>PANIC</div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <nav class="icons" aria-label="Raccourcis" onpointerdown={(e) => { if (e.target === e.currentTarget) selected = null; }}>
    {#each shortcuts as s, i (s.label)}
      <button
        class="icon"
        class:selected={selected === i}
        onclick={() => (selected = i)}
        ondblclick={s.run}
        onkeydown={(e) => e.key === 'Enter' && s.run()}
      >
        <span class="tile"><Icon name={s.icon} size={26} stroke={1.4} /></span>
        <span class="lbl">{s.label}</span>
      </button>
    {/each}
  </nav>

  {#each wm.windows as win (win.id)}
    <Window {win} />
  {/each}

  <TopBar />
  <Dock />
  <Toasts />
</main>

<style>
  .desktop { position: fixed; inset: 0; overflow: hidden; }
  .wallpaper {
    position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 50% 40%, #0d1420 0%, #080b11 55%, #05070b 100%);
  }
  .glow { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.55; }
  .g1 { width: 640px; height: 640px; left: -160px; top: -200px; background: radial-gradient(circle, rgba(62, 230, 245, 0.22), transparent 70%); animation: drift 60s ease-in-out infinite alternate; }
  .g2 { width: 720px; height: 720px; right: -220px; bottom: -260px; background: radial-gradient(circle, rgba(157, 123, 255, 0.22), transparent 70%); animation: drift 70s ease-in-out infinite alternate-reverse; }
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
  .mark {
    position: absolute; right: 28px; bottom: 96px;
    font-size: 13px; letter-spacing: 0.4em; color: rgba(232, 238, 247, 0.08); font-weight: 700;
  }
  .mark span { color: rgba(62, 230, 245, 0.25); }

  .icons { position: absolute; top: 48px; left: 16px; display: flex; flex-direction: column; gap: 6px; z-index: 1; }
  .icon {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    width: 92px; padding: 8px 4px; border: 1px solid transparent; border-radius: var(--kp-radius-m);
    background: transparent; color: var(--kp-text-0);
  }
  .icon:hover { background: rgba(255, 255, 255, 0.03); }
  .icon.selected { background: var(--kp-cyan-dim); border-color: rgba(62, 230, 245, 0.2); }
  .tile {
    display: grid; place-items: center; width: 50px; height: 50px; border-radius: 14px;
    background: linear-gradient(160deg, rgba(28, 36, 48, 0.9), rgba(15, 20, 28, 0.9));
    border: 1px solid var(--kp-line-strong); color: var(--kp-cyan);
    box-shadow: var(--kp-shadow-1);
  }
  .lbl { font-size: 11.5px; text-align: center; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); line-height: 1.25; }
</style>
