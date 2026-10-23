<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { modeString, path as P, type Stat } from '@kp/kernel';
  import Icon from '$lib/desktop/Icon.svelte';
  import { fileIcon } from '$lib/desktop/icons';
  import { fsErrorText, fmtSize } from '../fs-helpers';

  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;

  let cwd = $state(typeof win.args.path === 'string' ? win.args.path : home);
  let back = $state<string[]>([]);
  let showHidden = $state(false);
  let selected = $state<string | null>(null);
  let filter = $state('');

  $effect(() => {
    void win.nonce;
    if (typeof win.args.path === 'string') cwd = win.args.path;
  });

  const listing = $derived.by((): { entries: Stat[]; error: string | null } => {
    void os.version;
    try {
      const entries = k.vfs.readdir(cwd, os.cred, { silent: true });
      return { entries, error: null };
    } catch (e) {
      return { entries: [], error: fsErrorText(e, cwd) };
    }
  });

  // Listing is an observable action (scenario triggers), but only once per navigation.
  $effect(() => {
    const path = cwd;
    untrack(() => {
      if (!listing.error) k.bus.emit('fs.list', { path, user: os.cred.user });
    });
  });

  const entries = $derived(
    listing.entries
      .filter((e) => showHidden || !e.hidden)
      .filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => (a.type === 'dir') === (b.type === 'dir') ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1),
  );
  const hiddenCount = $derived(listing.entries.filter((e) => e.hidden).length);

  $effect(() => {
    win.title = `Fichiers — ${P.tildify(cwd, home)}`;
  });

  function go(path: string) {
    if (path === cwd) return;
    back = [...back, cwd];
    cwd = path;
    selected = null;
  }

  function goBack() {
    const prev = back.at(-1);
    if (prev) {
      back = back.slice(0, -1);
      cwd = prev;
    }
  }

  function openEntry(e: Stat) {
    if (e.type === 'dir') go(e.path);
    else os.openPath(e.path);
  }

  function canRead(e: Stat): boolean {
    const c = os.cred;
    if (c.uid === 0) return true;
    const bits = e.owner === c.user ? e.mode >> 6 : c.groups.includes(e.group) ? e.mode >> 3 : e.mode;
    return (bits & 4) !== 0;
  }

  const crumbs = $derived.by(() => {
    const parts = cwd.split('/').filter(Boolean);
    return [{ name: '/', path: '/' }, ...parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))];
  });

  const places = [
    { name: 'Dossier perso', path: home, icon: 'home' },
    { name: 'Documents', path: `${home}/Documents`, icon: 'folder' },
    { name: 'Images', path: `${home}/Pictures`, icon: 'image' },
    { name: 'Téléchargements', path: `${home}/Downloads`, icon: 'folder' },
  ];
  const system = [
    { name: 'Racine', path: '/', icon: 'hard-drive' },
    { name: '/etc', path: '/etc', icon: 'folder' },
    { name: '/var/log', path: '/var/log', icon: 'activity' },
    { name: '/tmp', path: '/tmp', icon: 'folder' },
  ];
</script>

<div class="files">
  <aside class="kp-sidebar">
    <div class="kp-label sec">Emplacements</div>
    {#each places as p (p.path)}
      <button class="kp-side-item" class:active={cwd === p.path} onclick={() => go(p.path)}><Icon name={p.icon} size={15} />{p.name}</button>
    {/each}
    <div class="kp-label sec">Système</div>
    {#each system as p (p.path)}
      <button class="kp-side-item" class:active={cwd === p.path} onclick={() => go(p.path)}><Icon name={p.icon} size={15} /><span class="mono">{p.name}</span></button>
    {/each}
  </aside>

  <div class="main">
    <div class="kp-toolbar">
      <button class="kp-btn ghost" aria-label="Précédent" disabled={!back.length} onclick={goBack}><Icon name="chevron-left" /></button>
      <button class="kp-btn ghost" aria-label="Dossier parent" disabled={cwd === '/'} onclick={() => go(P.dirname(cwd))}><Icon name="chevron-up" /></button>
      <nav class="crumbs mono">
        {#each crumbs as c, i (c.path)}
          {#if i > 1}<span class="slash">/</span>{/if}
          <button onclick={() => go(c.path)} class:last={i === crumbs.length - 1}>{c.name}</button>
        {/each}
      </nav>
      <input class="kp-input search" placeholder="Filtrer…" bind:value={filter} />
      <button class="kp-btn" class:active={showHidden} onclick={() => (showHidden = !showHidden)} title="Afficher les fichiers cachés (ls -a)">
        <Icon name={showHidden ? 'eye' : 'eye-off'} size={14} />
        Cachés{#if hiddenCount && !showHidden}<span class="kp-badge violet">{hiddenCount}</span>{/if}
      </button>
      <button class="kp-btn ghost" title="Ouvrir un terminal ici" aria-label="Terminal ici" onclick={() => wm.open('terminal', { cwd })}><Icon name="terminal" size={15} /></button>
    </div>

    {#if listing.error}
      <div class="kp-error"><Icon name="lock" size={13} /> {listing.error}</div>
    {:else}
      <div class="table" role="grid">
        <div class="row head kp-label" role="row">
          <span>Nom</span><span>Taille</span><span>Modifié</span><span>Droits</span><span>Propriétaire</span>
        </div>
        <div class="rows">
          {#each entries as e (e.path)}
            {@const ic = fileIcon(e.name, e.type === 'dir', !canRead(e))}
            <div
              class="row"
              class:sel={selected === e.path}
              class:hidden={e.hidden}
              role="row"
              tabindex="0"
              onclick={() => (selected = e.path)}
              ondblclick={() => openEntry(e)}
              onkeydown={(ev) => ev.key === 'Enter' && openEntry(e)}
            >
              <span class="name">
                <span class="fi {ic.tone}"><Icon name={ic.icon} size={16} /></span>
                <span class="nm">{e.name}</span>
                {#if !canRead(e)}<span class="kp-badge red">verrouillé</span>{/if}
              </span>
              <span class="mono dim num">{e.type === 'dir' ? '—' : fmtSize(e.size)}</span>
              <span class="mono dim num">{k.time.short(e.mtime)}</span>
              <span class="mono dim">{modeString(e.type, e.mode)}</span>
              <span class="mono dim">{e.owner}:{e.group}</span>
            </div>
          {:else}
            <div class="kp-empty">Dossier vide{hiddenCount && !showHidden ? ` — ${hiddenCount} élément(s) caché(s)` : ''}</div>
          {/each}
        </div>
      </div>
    {/if}
    <footer class="status mono">{entries.length} élément(s) · {cwd}</footer>
  </div>
</div>

<style>
  .files { display: flex; flex: 1; min-height: 0; }
  .sec { padding: 10px 8px 6px; }
  .sec:first-child { padding-top: 2px; }
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .crumbs { flex: 1; display: flex; align-items: center; gap: 2px; overflow: hidden; font-size: 12px; min-width: 0; }
  .crumbs button { border: 0; background: transparent; color: var(--kp-text-1); padding: 3px 5px; border-radius: 5px; white-space: nowrap; }
  .crumbs button:hover { background: var(--kp-bg-4); color: var(--kp-text-0); }
  .crumbs button.last { color: var(--kp-cyan); }
  .slash { color: var(--kp-text-2); }
  .search { width: 140px; }
  .table { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .rows { flex: 1; overflow: auto; }
  .row {
    display: grid; grid-template-columns: minmax(180px, 1fr) 80px 110px 100px 130px; align-items: center; gap: 10px;
    height: 30px; padding: 0 14px; border-bottom: 1px solid var(--kp-line); cursor: default; outline: none;
  }
  .row.head { height: 28px; background: var(--kp-bg-1); border-bottom-color: var(--kp-line-strong); }
  .row:not(.head):hover { background: rgba(255, 255, 255, 0.02); }
  .row.sel { background: var(--kp-cyan-dim); box-shadow: inset 2px 0 0 var(--kp-cyan); }
  .row.hidden .nm { opacity: 0.6; font-style: italic; }
  .name { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fi { display: grid; color: var(--kp-text-1); }
  .fi.dir { color: #8ab8ff; }
  .fi.image { color: var(--kp-violet); }
  .fi.mail { color: var(--kp-cyan); }
  .fi.log { color: var(--kp-amber); }
  .fi.script { color: var(--kp-green); }
  .fi.key { color: var(--kp-amber); }
  .fi.bin { color: var(--kp-text-2); }
  .dim { color: var(--kp-text-2); font-size: 11.5px; white-space: nowrap; overflow: hidden; }
  .status { height: 26px; display: flex; align-items: center; padding: 0 14px; border-top: 1px solid var(--kp-line); color: var(--kp-text-2); font-size: 11px; background: var(--kp-bg-2); }
  @media (max-width: 900px) { .row { grid-template-columns: minmax(160px, 1fr) 70px 100px; } .row > :nth-child(4), .row > :nth-child(5) { display: none; } }
</style>
