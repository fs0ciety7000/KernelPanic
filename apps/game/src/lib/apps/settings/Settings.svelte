<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { settings, WALLPAPERS } from '$lib/os/settings.svelte';
  import { sound } from '$lib/os/sound.svelte';
  import { notify } from '$lib/os/notify.svelte';
  import { help } from '$lib/os/help.svelte';
  import Icon from '$lib/desktop/Icon.svelte';

  let { win }: AppProps = $props();
  const k = os.kernel!;

  type Section = 'appearance' | 'sound' | 'accessibility' | 'about';
  let section = $state<Section>('appearance');
  $effect(() => {
    void win.nonce;
    const s = win.args.section;
    untrack(() => {
      if (s === 'appearance' || s === 'sound' || s === 'accessibility' || s === 'about') section = s;
    });
  });

  const SECTIONS: Array<{ id: Section; label: string; icon: string }> = [
    { id: 'appearance', label: 'Apparence', icon: 'image' },
    { id: 'sound', label: 'Son et notifications', icon: 'volume' },
    { id: 'accessibility', label: 'Accessibilité', icon: 'eye' },
    { id: 'about', label: 'À propos', icon: 'monitor' },
  ];

  const uptime = $derived.by(() => {
    void os.tick;
    const mins = 3 * 24 * 60 + 14 * 60 + 7 + Math.floor(k.runtime.playtime() / 60000);
    return `${Math.floor(mins / 1440)} j ${Math.floor((mins % 1440) / 60)} h ${mins % 60} min`;
  });
  const user = k.users.get(k.sessionUser)!;

  function set<K extends 'wallpaper' | 'readable' | 'desktopHidden'>(key: K, value: (typeof settings)[K]) {
    settings[key] = value;
    settings.persist();
  }
</script>

<div class="settings">
  <nav class="kp-sidebar">
    {#each SECTIONS as s (s.id)}
      <button class="kp-side-item" class:active={section === s.id} onclick={() => (section = s.id)}><Icon name={s.icon} size={15} />{s.label}</button>
    {/each}
  </nav>
  <div class="pane">
    {#if section === 'appearance'}
      <h2>Fond d'écran</h2>
      <div class="wps">
        {#each WALLPAPERS as w (w.id)}
          <button class="wp" class:on={settings.wallpaper === w.id} onclick={() => set('wallpaper', w.id)} aria-pressed={settings.wallpaper === w.id}>
            <span class="swatch" style="background:{w.preview}"></span>
            <span>{w.name}</span>
          </button>
        {/each}
      </div>
      <h2>Bureau</h2>
      <label class="row">
        <span><b>Afficher les fichiers cachés sur le bureau</b><small>Les noms commençant par un point (comme <span class="mono">ls -a</span>).</small></span>
        <input type="checkbox" class="sw" checked={settings.desktopHidden} onchange={(e) => set('desktopHidden', e.currentTarget.checked)} />
      </label>
    {:else if section === 'sound'}
      <h2>Son</h2>
      <label class="row">
        <span><b>Sons d'interface</b><small>Notifications, objectifs, erreurs. Synthétisés, très discrets.</small></span>
        <input type="checkbox" class="sw" checked={!sound.muted} onchange={() => sound.toggle()} />
      </label>
      <h2>Notifications</h2>
      <label class="row">
        <span><b>Ne pas déranger</b><small>Les notifications vont directement dans le centre de notifications, sans son ni bulle.</small></span>
        <input type="checkbox" class="sw" checked={notify.quiet} onchange={(e) => (notify.quiet = e.currentTarget.checked)} />
      </label>
    {:else if section === 'accessibility'}
      <h2>Lisibilité</h2>
      <label class="row">
        <span><b>Mode lisibilité</b><small>Texte plus grand, sans grain ni halos lumineux.</small></span>
        <input type="checkbox" class="sw" checked={settings.readable} onchange={(e) => set('readable', e.currentTarget.checked)} />
      </label>
      <h2>Aide</h2>
      <div class="row">
        <span><b>Premiers pas</b><small>Rôle de chaque application et raccourcis clavier.</small></span>
        <button class="kp-btn" onclick={() => help.toggle()}>Afficher</button>
      </div>
    {:else}
      <div class="about">
        <div class="logo mono">KERNEL<span>_</span>PANIC</div>
        <dl class="mono">
          <dt>Machine</dt><dd>{k.machine.hostname}{k.machine.domain ? `.${k.machine.domain}` : ''}</dd>
          <dt>Système</dt><dd>{k.machine.os}</dd>
          <dt>Noyau</dt><dd>Linux {k.machine.kernel}</dd>
          <dt>Adresse IP</dt><dd>{k.machine.ip}</dd>
          <dt>Utilisateur</dt><dd>{user.fullName ? `${user.fullName} (${user.name})` : user.name}</dd>
          <dt>En service depuis</dt><dd>{uptime}</dd>
          <dt>Environnement</dt><dd>Kernel_Panic desktop 0.2 · session forensique</dd>
        </dl>
        <p class="dim">Tout est simulé : aucune commande réelle n'est exécutée, aucune vraie machine n'est touchée.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .settings { display: flex; flex: 1; min-height: 0; }
  .kp-sidebar { width: 210px; }
  .pane { flex: 1; overflow: auto; padding: 20px 26px; background: var(--kp-bg-1); }
  h2 { font-size: 13px; font-weight: 600; margin: 18px 0 10px; color: var(--kp-text-0); }
  h2:first-child { margin-top: 0; }
  .wps { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .wp { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 1px solid var(--kp-line); border-radius: var(--kp-radius-m); background: var(--kp-bg-2); color: var(--kp-text-1); font-size: 12px; }
  .wp:hover { border-color: var(--kp-line-strong); }
  .wp.on { border-color: var(--kp-cyan); color: var(--kp-text-0); box-shadow: var(--kp-shadow-focus); }
  .swatch { height: 64px; border-radius: 6px; border: 1px solid var(--kp-line); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 14px; border-radius: var(--kp-radius-m); background: var(--kp-bg-2); border: 1px solid var(--kp-line); margin-bottom: 8px; }
  .row span { display: flex; flex-direction: column; gap: 3px; }
  .row small { color: var(--kp-text-2); font-size: 11.5px; }
  .sw { appearance: none; width: 36px; height: 20px; border-radius: 10px; background: var(--kp-bg-4); border: 1px solid var(--kp-line-strong); position: relative; flex-shrink: 0; cursor: pointer; transition: background var(--kp-dur-fast); }
  .sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--kp-text-1); transition: transform var(--kp-dur-fast) var(--kp-ease); }
  .sw:checked { background: var(--kp-cyan); border-color: transparent; }
  .sw:checked::after { transform: translateX(16px); background: var(--kp-bg-0); }
  .about { display: flex; flex-direction: column; gap: 18px; }
  .logo { font-size: 22px; letter-spacing: 0.3em; font-weight: 700; }
  .logo span { color: var(--kp-cyan); }
  .about dl { display: grid; grid-template-columns: 150px 1fr; gap: 8px 14px; margin: 0; font-size: 12px; }
  .about dt { color: var(--kp-text-2); }
  .about dd { margin: 0; color: var(--kp-text-0); }
  .dim { color: var(--kp-text-2); font-size: 12px; }
</style>
