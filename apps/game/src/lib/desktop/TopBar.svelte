<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import Icon from './Icon.svelte';
  import { help } from '$lib/os/help.svelte';
  import { sound } from '$lib/os/sound.svelte';

  let menuOpen = $state(false);

  const k = $derived(os.kernel!);
  const clock = $derived.by(() => {
    void os.tick;
    return k.time.hm(k.now());
  });
  const progress = $derived.by(() => {
    void os.version;
    return k.runtime.progress();
  });
  const focusedTitle = $derived(wm.focused?.title ?? 'Bureau');
</script>

<svelte:window
  onclick={(e) => { if (!(e.target as HTMLElement).closest('.sysmenu')) menuOpen = false; }}
  onkeydown={(e) => { if (e.key === 'Escape' && menuOpen) menuOpen = false; }}
/>

<header class="topbar">
  <div class="left">
    <div class="sysmenu">
      <button class="logo" onclick={() => (menuOpen = !menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen}>
        KP<span class="caret">_</span>
      </button>
      {#if menuOpen}
        <div class="menu" role="menu">
          <div class="menu-head">
            <div class="mono">{k.sessionUser}@{k.machine.hostname}</div>
            <div class="sub">{k.machine.os}</div>
          </div>
          <button role="menuitem" onclick={() => { wm.open('case'); menuOpen = false; }}><Icon name="case" size={14} /> Dossier d'enquête</button>
          <button role="menuitem" onclick={() => { help.toggle(); menuOpen = false; }}><Icon name="info" size={14} /> Aide — premiers pas</button>
          <button role="menuitem" onclick={() => { os.save(); menuOpen = false; }}><Icon name="save" size={14} /> Sauvegarder</button>
          <div class="sep"></div>
          <button role="menuitem" onclick={() => { menuOpen = false; os.quitToMenu(); }}><Icon name="power" size={14} /> Quitter vers le menu</button>
          <button role="menuitem" class="danger" onclick={() => { if (confirm('Recommencer le scénario depuis le début ? La progression sera perdue.')) { menuOpen = false; os.restart(); } }}><Icon name="refresh" size={14} /> Recommencer</button>
        </div>
      {/if}
    </div>
    <span class="app-title">{focusedTitle}</span>
  </div>
  <div class="center mono">{k.machine.hostname}.{k.machine.domain}</div>
  <div class="right">
    <button class="objectives" onclick={() => wm.open('case')} title="Objectifs">
      <Icon name="diamond" size={11} stroke={2} />
      <span class="num">{progress.done}/{progress.total}</span>
    </button>
    <button class="status btn" onclick={() => sound.toggle()} aria-pressed={!sound.muted} aria-label={sound.muted ? 'Activer les sons' : 'Couper les sons'} title={sound.muted ? 'Sons coupés' : 'Sons activés'}>
      <Icon name={sound.muted ? 'volume-off' : 'volume'} size={14} />
    </button>
    <span class="status" title="Session forensique — réseau filtré"><Icon name="shield" size={14} /></span>
    <span class="status" title="eth0 · {k.machine.ip}"><Icon name="wifi" size={14} /></span>
    <span class="clock num">{clock}</span>
  </div>
</header>

<style>
  .topbar {
    position: absolute;
    inset: 0 0 auto 0;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    background: rgba(8, 11, 16, 0.72);
    backdrop-filter: blur(18px) saturate(140%);
    border-bottom: 1px solid var(--kp-line);
    z-index: 10000;
    font-size: 12.5px;
  }
  .left, .right { display: flex; align-items: center; gap: 12px; flex: 1; }
  .right { justify-content: flex-end; }
  .center { color: var(--kp-text-2); font-size: 11.5px; }
  .logo {
    border: 0; background: transparent; padding: 2px 6px; border-radius: 6px;
    font-weight: 700; letter-spacing: 0.02em; color: var(--kp-text-0);
  }
  .logo:hover { background: var(--kp-bg-4); }
  .caret { color: var(--kp-cyan); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .app-title { font-weight: 600; color: var(--kp-text-0); }
  .sysmenu { position: relative; }
  .menu {
    position: absolute; top: 28px; left: 0; width: 240px; padding: 6px;
    background: rgba(12, 16, 22, 0.94); backdrop-filter: blur(18px);
    border: 1px solid var(--kp-line-strong); border-radius: var(--kp-radius-m);
    box-shadow: var(--kp-shadow-2);
    animation: pop var(--kp-dur) var(--kp-ease);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
  .menu-head { padding: 8px 10px 10px; border-bottom: 1px solid var(--kp-line); margin-bottom: 6px; }
  .menu-head .mono { color: var(--kp-green); font-size: 12px; }
  .menu-head .sub { color: var(--kp-text-2); font-size: 11.5px; }
  .menu button {
    display: flex; align-items: center; gap: 10px; width: 100%; height: 30px; padding: 0 10px;
    border: 0; border-radius: var(--kp-radius-s); background: transparent; color: var(--kp-text-1); text-align: left;
  }
  .menu button:hover { background: var(--kp-cyan-dim); color: var(--kp-text-0); }
  .menu button.danger:hover { background: var(--kp-red-dim); color: var(--kp-red); }
  .sep { height: 1px; background: var(--kp-line); margin: 6px 0; }
  .objectives {
    display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px;
    border: 1px solid rgba(157, 123, 255, 0.3); border-radius: 999px;
    background: var(--kp-violet-dim); color: var(--kp-violet); font-family: var(--kp-font-mono); font-size: 11.5px;
  }
  .objectives:hover { border-color: var(--kp-violet); }
  .status { color: var(--kp-text-2); display: grid; }
  .status.btn { border: 0; background: transparent; padding: 3px; border-radius: 5px; }
  .status.btn:hover { color: var(--kp-text-0); background: var(--kp-bg-4); }
  .clock { color: var(--kp-text-0); font-weight: 500; min-width: 38px; text-align: right; }
  @media (max-width: 720px) { .center { display: none; } }
</style>
