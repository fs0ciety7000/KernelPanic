<script lang="ts">
  import { os } from '$lib/os/os.svelte';
  import { wm, type WindowState } from '$lib/os/wm.svelte';
  import { APPS, appById } from '$lib/os/apps';
  import { contextMenu, sep } from '$lib/os/menu.svelte';
  import { notify } from '$lib/os/notify.svelte';
  import { sound } from '$lib/os/sound.svelte';
  import Icon from './Icon.svelte';
  import Launcher from './Launcher.svelte';
  import TrayPanels from './TrayPanels.svelte';

  type Panel = 'launcher' | 'calendar' | 'notifications' | 'network' | null;
  let panel = $state<Panel>(null);

  const k = $derived(os.kernel!);
  const clock = $derived.by(() => {
    void os.tick;
    return k.time.hm(k.now());
  });
  const date = $derived.by(() => {
    void os.tick;
    return k.time.iso(k.now()).slice(0, 10).split('-').reverse().join('/');
  });
  const progress = $derived.by(() => {
    void os.version;
    return k.runtime.progress();
  });
  const focusedId = $derived(wm.focused?.id);
  const pinned = APPS.filter((a) => a.dock);
  const running = $derived(new Set(wm.windows.map((w) => w.appId)));
  const chatUnread = $derived.by(() => {
    void os.version;
    return Object.values(k.runtime.state.chat?.unread ?? {}).reduce((a, b) => a + b, 0);
  });

  function toggle(p: Panel) {
    panel = panel === p ? null : p;
    if (panel === 'notifications') notify.markRead();
  }

  function clickWindow(w: WindowState) {
    if (focusedId === w.id && !w.minimized) wm.minimize(w.id);
    else wm.focus(w.id);
  }

  function windowMenu(e: MouseEvent, w: WindowState) {
    e.preventDefault();
    contextMenu.show(e, [
      { label: w.minimized ? 'Restaurer' : 'Réduire', icon: 'minus', run: () => (w.minimized ? wm.focus(w.id) : wm.minimize(w.id)) },
      { label: w.maximized ? 'Restaurer la taille' : 'Agrandir', icon: 'maximize', run: () => wm.toggleMaximize(w.id) },
      { label: 'Ancrer à gauche', icon: 'chevron-left', run: () => wm.setSnap(w.id, 'left') },
      { label: 'Ancrer à droite', icon: 'chevron-right', run: () => wm.setSnap(w.id, 'right') },
      sep,
      { label: 'Fermer', icon: 'x', shortcut: 'Ctrl+Alt+W', danger: true, run: () => wm.close(w.id) },
    ]);
  }

  function pinnedMenu(e: MouseEvent, appId: string) {
    e.preventDefault();
    const app = appById(appId)!;
    const mine = wm.windows.filter((w) => w.appId === appId);
    contextMenu.show(e, [
      { label: `Nouvelle fenêtre — ${app.title}`, icon: app.icon, disabled: !!app.singleton && mine.length > 0, run: () => wm.open(appId) },
      { label: 'Fermer toutes les fenêtres', icon: 'x', disabled: !mine.length, run: () => mine.forEach((w) => wm.close(w.id)) },
    ]);
  }
</script>

<svelte:window
  onpointerdown={(e) => { if (panel && !(e.target as HTMLElement).closest('.tb-panel, .taskbar')) panel = null; }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && panel) panel = null;
    if (e.key === 'Meta' || (e.altKey && e.key === 'F1')) { e.preventDefault(); toggle('launcher'); }
  }}
/>

{#if panel === 'launcher'}
  <Launcher close={() => (panel = null)} />
{:else if panel}
  <TrayPanels {panel} close={() => (panel = null)} />
{/if}

<footer class="taskbar" aria-label="Barre des tâches">
  <button class="start" class:on={panel === 'launcher'} onclick={() => toggle('launcher')} aria-label="Menu des applications" title="Applications (touche Windows / Alt+F1)">
    <span class="logo">KP<span class="u">_</span></span>
  </button>

  <div class="pinned">
    {#each pinned as app (app.id)}
      <button
        class="pin"
        class:running={running.has(app.id)}
        class:focused={wm.focused?.appId === app.id}
        onclick={() => wm.activateApp(app.id)}
        oncontextmenu={(e) => pinnedMenu(e, app.id)}
        aria-label={app.title}
        title={app.title}
      >
        <Icon name={app.icon} size={19} />
        {#if app.id === 'chat' && chatUnread}<span class="pbadge mono">{chatUnread}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="sepv"></div>

  <div class="windows" role="toolbar" aria-label="Fenêtres ouvertes">
    {#each wm.windows as w (w.id)}
      <button
        class="win"
        class:active={focusedId === w.id && !w.minimized}
        class:min={w.minimized}
        onclick={() => clickWindow(w)}
        oncontextmenu={(e) => windowMenu(e, w)}
        title={w.title}
      >
        <Icon name={appById(w.appId)?.icon ?? 'file'} size={14} />
        <span>{w.title}</span>
      </button>
    {/each}
  </div>

  <div class="tray">
    <button class="chip" onclick={() => wm.open('case')} title="Objectifs — Dossier d'enquête">
      <Icon name="diamond" size={11} stroke={2} /><span class="mono">{progress.done}/{progress.total}</span>
    </button>
    <button class="ti" class:on={panel === 'notifications'} onclick={() => toggle('notifications')} aria-label="Notifications" title="Notifications">
      <Icon name="inbox" size={16} />
      {#if notify.unread}<span class="badge mono">{notify.unread > 9 ? '9+' : notify.unread}</span>{/if}
    </button>
    <button class="ti" onclick={() => sound.toggle()} aria-label={sound.muted ? 'Activer les sons' : 'Couper les sons'} title={sound.muted ? 'Sons coupés' : 'Sons activés'}>
      <Icon name={sound.muted ? 'volume-off' : 'volume'} size={16} />
    </button>
    <button class="ti" class:on={panel === 'network'} onclick={() => toggle('network')} aria-label="Réseau" title="Réseau — {k.machine.ip}">
      <Icon name="wifi" size={16} />
    </button>
    <button class="clock" class:on={panel === 'calendar'} onclick={() => toggle('calendar')} title="Date et heure (heure de la machine)">
      <span class="t num">{clock}</span>
      <span class="d num">{date}</span>
    </button>
    <button class="peek" onclick={() => wm.toggleShowDesktop()} aria-label="Afficher le bureau" title="Afficher le bureau"></button>
  </div>
</footer>

<style>
  .taskbar {
    position: absolute;
    inset: auto 0 0 0;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 0 0 6px;
    background: rgba(8, 11, 16, 0.82);
    backdrop-filter: blur(20px) saturate(150%);
    border-top: 1px solid var(--kp-line-strong);
    z-index: 10000;
    user-select: none;
  }
  button { border: 0; background: transparent; color: var(--kp-text-1); }
  .start {
    height: 38px;
    padding: 0 12px;
    border-radius: 8px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--kp-text-0);
  }
  .start:hover, .start.on { background: var(--kp-cyan-dim); }
  .u { color: var(--kp-cyan); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .pinned { display: flex; gap: 2px; }
  .pin {
    position: relative;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    transition: background var(--kp-dur-fast);
  }
  .pin:hover { background: rgba(255, 255, 255, 0.06); color: var(--kp-text-0); }
  .pin.focused { color: var(--kp-cyan); background: var(--kp-cyan-dim); }
  .pin.running::after {
    content: '';
    position: absolute;
    bottom: 3px;
    width: 14px;
    height: 3px;
    border-radius: 2px;
    background: var(--kp-text-2);
  }
  .pin.focused::after { background: var(--kp-cyan); box-shadow: 0 0 8px var(--kp-cyan); width: 18px; }
  .pbadge { position: absolute; top: 3px; right: 3px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 8px; background: var(--kp-cyan); color: var(--kp-bg-0); font-size: 9.5px; font-weight: 700; line-height: 15px; }
  .sepv { width: 1px; height: 24px; margin: 0 6px; background: var(--kp-line-strong); }
  .windows { flex: 1; display: flex; gap: 3px; min-width: 0; overflow: hidden; }
  .win {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 190px;
    min-width: 44px;
    height: 36px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 2px solid transparent;
  }
  .win span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .win:hover { background: rgba(255, 255, 255, 0.07); color: var(--kp-text-0); }
  .win.active { background: rgba(62, 230, 245, 0.1); color: var(--kp-text-0); border-bottom-color: var(--kp-cyan); }
  .win.min { opacity: 0.65; }
  .tray { display: flex; align-items: center; gap: 2px; height: 100%; }
  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    margin-right: 6px;
    padding: 0 9px;
    border: 1px solid rgba(157, 123, 255, 0.3);
    border-radius: 999px;
    background: var(--kp-violet-dim);
    color: var(--kp-violet);
    font-size: 11.5px;
  }
  .chip:hover { border-color: var(--kp-violet); }
  .ti {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 36px;
    border-radius: 7px;
  }
  .ti:hover, .ti.on { background: rgba(255, 255, 255, 0.07); color: var(--kp-text-0); }
  .badge {
    position: absolute;
    top: 4px;
    right: 3px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: 8px;
    background: var(--kp-cyan);
    color: var(--kp-bg-0);
    font-size: 9.5px;
    font-weight: 700;
    line-height: 15px;
  }
  .clock {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    height: 40px;
    padding: 0 10px;
    border-radius: 7px;
    line-height: 1.15;
  }
  .clock:hover, .clock.on { background: rgba(255, 255, 255, 0.07); }
  .t { color: var(--kp-text-0); font-size: 12.5px; font-weight: 500; }
  .d { color: var(--kp-text-2); font-size: 10.5px; }
  .peek { width: 8px; height: 100%; margin-left: 4px; border-left: 1px solid var(--kp-line-strong); border-radius: 0; }
  .peek:hover { background: rgba(62, 230, 245, 0.15); }
  @media (max-width: 760px) { .win span { display: none; } .win { flex: 0 0 44px; justify-content: center; } }
</style>
