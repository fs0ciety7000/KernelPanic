<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { modeString, path as P, type Stat } from '@kp/kernel';
  import { contextMenu, sep } from '$lib/os/menu.svelte';
  import { folderMenu, itemMenu } from '$lib/os/filemenu';
  import {
    clipboard,
    desktopDir,
    emptyTrash,
    isInTrash,
    openEntry,
    paste,
    rename,
    restore,
    transfer,
    trash,
    trashCount,
    trashFiles,
    trashOrigin,
  } from '$lib/os/fileops.svelte';
  import Icon from '$lib/desktop/Icon.svelte';
  import { fileIcon } from '$lib/desktop/icons';
  import { fsErrorText, fmtSize } from '../fs-helpers';

  const DND = 'application/x-kp-paths';
  let { win }: AppProps = $props();
  const k = os.kernel!;
  const home = k.users.get(k.sessionUser)!.home;

  let cwd = $state(typeof win.args.path === 'string' ? win.args.path : home);
  let back = $state<string[]>([]);
  let forward = $state<string[]>([]);
  let showHidden = $state(false);
  let view = $state<'list' | 'grid'>('list');
  let selection = $state<string[]>([]);
  let anchor = $state<string | null>(null);
  let filter = $state('');
  let renaming = $state<string | null>(null);
  let renameValue = $state('');
  let dropOn = $state<string | null>(null);
  let body = $state<HTMLDivElement>();

  $effect(() => {
    void win.nonce;
    const target = win.args.path;
    untrack(() => {
      if (typeof target === 'string' && target !== cwd) go(target);
    });
  });

  const listing = $derived.by((): { entries: Stat[]; error: string | null } => {
    void os.version;
    try {
      return { entries: k.vfs.readdir(cwd, os.cred, { silent: true }), error: null };
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

  const inTrash = $derived(cwd === trashFiles());
  const entries = $derived(
    listing.entries
      .filter((e) => showHidden || inTrash || !e.hidden)
      .filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => ((a.type === 'dir') === (b.type === 'dir') ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)),
  );
  const hiddenCount = $derived(listing.entries.filter((e) => e.hidden).length);
  const selectedEntries = $derived(entries.filter((e) => selection.includes(e.path)));
  const selectedSize = $derived(selectedEntries.reduce((a, e) => a + (e.type === 'file' ? e.size : 0), 0));

  $effect(() => {
    win.title = inTrash ? 'Corbeille' : `Fichiers — ${P.tildify(cwd, home)}`;
  });

  function go(path: string) {
    if (path === cwd) return;
    back = [...back, cwd];
    forward = [];
    cwd = path;
    selection = [];
    renaming = null;
  }
  function goBack() {
    const prev = back.at(-1);
    if (!prev) return;
    back = back.slice(0, -1);
    forward = [cwd, ...forward];
    cwd = prev;
    selection = [];
  }
  function goForward() {
    const next = forward[0];
    if (!next) return;
    forward = forward.slice(1);
    back = [...back, cwd];
    cwd = next;
    selection = [];
  }

  function open(e: Stat) {
    if (e.type === 'dir') go(e.path);
    else openEntry(e);
  }

  function canRead(e: Stat): boolean {
    const c = os.cred;
    if (c.uid === 0) return true;
    const bits = e.owner === c.user ? e.mode >> 6 : c.groups.includes(e.group) ? e.mode >> 3 : e.mode;
    return (bits & 4) !== 0;
  }

  // ── Selection (click, Ctrl+click, Shift+click) ──────────────────────────
  function clickItem(ev: MouseEvent, e: Stat) {
    if (ev.shiftKey && anchor) {
      const a = entries.findIndex((x) => x.path === anchor);
      const b = entries.findIndex((x) => x.path === e.path);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      selection = entries.slice(lo, hi + 1).map((x) => x.path);
    } else if (ev.ctrlKey || ev.metaKey) {
      selection = selection.includes(e.path) ? selection.filter((p) => p !== e.path) : [...selection, e.path];
      anchor = e.path;
    } else {
      selection = [e.path];
      anchor = e.path;
    }
  }

  // ── Rename ──────────────────────────────────────────────────────────────
  async function startRename(path: string) {
    selection = [path];
    renameValue = P.basename(path);
    renaming = path;
    await tick();
    const input = body?.querySelector<HTMLInputElement>('.rename');
    input?.focus();
    const dot = renameValue.lastIndexOf('.');
    input?.setSelectionRange(0, dot > 0 ? dot : renameValue.length);
  }
  function commitRename() {
    const from = renaming;
    renaming = null;
    if (!from) return;
    const dest = rename(from, renameValue);
    if (dest) selection = [dest];
  }

  // ── Menus ──────────────────────────────────────────────────────────────
  function itemContext(ev: MouseEvent, e: Stat) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!selection.includes(e.path)) selection = [e.path];
    contextMenu.show(ev, itemMenu(selectedEntries.length ? selectedEntries : [e], { rename: startRename }));
  }
  function backgroundContext(ev: MouseEvent) {
    ev.preventDefault();
    selection = [];
    contextMenu.show(
      ev,
      folderMenu(cwd, [
        sep,
        { label: 'Afficher les fichiers cachés', icon: 'eye', checked: showHidden, run: () => (showHidden = !showHidden) },
        { label: view === 'list' ? 'Affichage en icônes' : 'Affichage en liste', icon: view === 'list' ? 'grid' : 'list', run: () => (view = view === 'list' ? 'grid' : 'list') },
      ]),
    );
  }

  // ── Keyboard ───────────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent) {
    if (renaming || (e.target as HTMLElement).tagName === 'INPUT') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && selectedEntries.length === 1) open(selectedEntries[0]!);
    else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      if (cwd !== '/') go(P.dirname(cwd));
    } else if (e.altKey && e.key === 'ArrowLeft') goBack();
    else if (e.altKey && e.key === 'ArrowRight') goForward();
    else if (e.key === 'Delete' && selection.length) inTrash ? null : trash(selection);
    else if (e.key === 'F2' && selection.length === 1) {
      e.preventDefault();
      startRename(selection[0]!);
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selection = entries.map((x) => x.path);
    } else if (ctrl && e.key.toLowerCase() === 'c' && selection.length) clipboard.set('copy', selection);
    else if (ctrl && e.key.toLowerCase() === 'x' && selection.length) clipboard.set('cut', selection);
    else if (ctrl && e.key.toLowerCase() === 'v') paste(cwd);
    else if (ctrl && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      showHidden = !showHidden;
    } else if (ctrl && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      editPath();
    } else if (e.key === 'Escape') selection = [];
  }

  // ── Drag & drop ────────────────────────────────────────────────────────
  function dragStart(ev: DragEvent, e: Stat) {
    if (!selection.includes(e.path)) selection = [e.path];
    ev.dataTransfer!.setData(DND, JSON.stringify(selection));
    ev.dataTransfer!.effectAllowed = 'copyMove';
  }
  function accepts(ev: DragEvent) {
    return !!ev.dataTransfer?.types.includes(DND);
  }
  function dropInto(ev: DragEvent, dir: string) {
    const raw = ev.dataTransfer?.getData(DND);
    dropOn = null;
    if (!raw) return;
    ev.preventDefault();
    ev.stopPropagation();
    const paths = (JSON.parse(raw) as string[]).filter((p) => !p.startsWith('sys:') && p !== dir);
    if (!paths.length) return;
    if (dir === trashFiles()) trash(paths);
    else transfer(paths, dir, ev.ctrlKey ? 'copy' : 'move');
  }

  // ── Path bar ───────────────────────────────────────────────────────────
  let editingPath = $state(false);
  let pathValue = $state('');
  async function editPath() {
    pathValue = cwd;
    editingPath = true;
    await tick();
    (document.activeElement as HTMLElement)?.blur();
    body?.parentElement?.querySelector<HTMLInputElement>('.pathinput')?.select();
  }
  function commitPath() {
    editingPath = false;
    const target = P.resolve(cwd, pathValue.trim() || cwd, home);
    try {
      if (k.vfs.stat(target, os.cred).type === 'dir') go(target);
      else openEntry({ path: target, type: 'file' });
    } catch (e) {
      go(target); // shows the real error (No such file / Permission denied)
      void e;
    }
  }

  const crumbs = $derived.by(() => {
    const parts = cwd.split('/').filter(Boolean);
    return [{ name: '/', path: '/' }, ...parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))];
  });

  const places = $derived([
    { name: 'Dossier perso', path: home, icon: 'home' },
    { name: 'Bureau', path: desktopDir(), icon: 'square' },
    { name: 'Documents', path: `${home}/Documents`, icon: 'folder' },
    { name: 'Images', path: `${home}/Pictures`, icon: 'image' },
    { name: 'Téléchargements', path: `${home}/Downloads`, icon: 'folder' },
  ]);
  const system = [
    { name: 'Racine', path: '/', icon: 'hard-drive' },
    { name: '/etc', path: '/etc', icon: 'folder' },
    { name: '/var/log', path: '/var/log', icon: 'activity' },
    { name: '/tmp', path: '/tmp', icon: 'folder' },
  ];
  const trashFull = $derived.by(() => {
    void os.version;
    return trashCount() > 0;
  });
</script>

{#snippet place(p: { name: string; path: string; icon: string }, mono = false)}
  <button
    class="kp-side-item"
    class:active={cwd === p.path}
    class:dropping={dropOn === `side:${p.path}`}
    onclick={() => go(p.path)}
    ondragover={(ev) => { if (accepts(ev)) { ev.preventDefault(); dropOn = `side:${p.path}`; } }}
    ondragleave={() => (dropOn = null)}
    ondrop={(ev) => dropInto(ev, p.path)}
  >
    <Icon name={p.icon} size={15} />{#if mono}<span class="mono">{p.name}</span>{:else}{p.name}{/if}
  </button>
{/snippet}

<div class="files">
  <aside class="kp-sidebar">
    <div class="kp-label sec">Emplacements</div>
    {#each places as p (p.path)}{@render place(p)}{/each}
    {@render place({ name: 'Corbeille', path: trashFiles(), icon: trashFull ? 'trash-full' : 'trash' })}
    <div class="kp-label sec">Système</div>
    {#each system as p (p.path)}{@render place(p, true)}{/each}
  </aside>

  <div class="main">
    <div class="kp-toolbar">
      <button class="kp-btn ghost" aria-label="Précédent" title="Précédent (Alt+←)" disabled={!back.length} onclick={goBack}><Icon name="chevron-left" /></button>
      <button class="kp-btn ghost" aria-label="Suivant" title="Suivant (Alt+→)" disabled={!forward.length} onclick={goForward}><Icon name="chevron-right" /></button>
      <button class="kp-btn ghost" aria-label="Dossier parent" title="Dossier parent (Retour arrière)" disabled={cwd === '/'} onclick={() => go(P.dirname(cwd))}><Icon name="chevron-up" /></button>
      {#if editingPath}
        <input
          class="kp-input mono pathinput"
          bind:value={pathValue}
          onkeydown={(e) => { if (e.key === 'Enter') commitPath(); if (e.key === 'Escape') editingPath = false; }}
          onblur={() => (editingPath = false)}
          spellcheck="false"
        />
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <nav class="crumbs mono" ondblclick={editPath} title="Double-clic ou Ctrl+L pour saisir un chemin">
          {#each crumbs as c, i (c.path)}
            {#if i > 1}<span class="slash">/</span>{/if}
            <button onclick={() => go(c.path)} class:last={i === crumbs.length - 1}>{c.name}</button>
          {/each}
        </nav>
      {/if}
      <input class="kp-input search" placeholder="Filtrer…" bind:value={filter} />
      <button class="kp-btn" class:active={showHidden} onclick={() => (showHidden = !showHidden)} title="Fichiers cachés (Ctrl+H)">
        <Icon name={showHidden ? 'eye' : 'eye-off'} size={14} />
        {#if hiddenCount && !showHidden}<span class="kp-badge violet">{hiddenCount}</span>{/if}
      </button>
      <button class="kp-btn ghost" title={view === 'list' ? 'Affichage en icônes' : 'Affichage en liste'} aria-label="Changer d'affichage" onclick={() => (view = view === 'list' ? 'grid' : 'list')}>
        <Icon name={view === 'list' ? 'grid' : 'list'} size={15} />
      </button>
      <button class="kp-btn ghost" title="Ouvrir un terminal ici" aria-label="Terminal ici" onclick={() => wm.open('terminal', { cwd })}><Icon name="terminal" size={15} /></button>
    </div>

    {#if inTrash}
      <div class="trashbar">
        <Icon name="trash" size={14} /> Corbeille
        <span class="grow"></span>
        <button class="kp-btn" disabled={!selection.length} onclick={() => restore(selection)}>Restaurer</button>
        <button class="kp-btn danger" disabled={!entries.length} onclick={() => confirm('Supprimer définitivement le contenu de la corbeille ?') && emptyTrash()}>Vider</button>
      </div>
    {/if}

    {#if listing.error}
      <div class="kp-error"><Icon name="lock" size={13} /> {listing.error}</div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="body {view}"
        bind:this={body}
        tabindex="0"
        role="listbox"
        aria-multiselectable="true"
        onkeydown={onKey}
        oncontextmenu={backgroundContext}
        onpointerdown={(ev) => { if (ev.target === ev.currentTarget) { selection = []; renaming = null; } }}
        ondragover={(ev) => { if (accepts(ev)) ev.preventDefault(); }}
        ondrop={(ev) => dropInto(ev, cwd)}
      >
        {#if view === 'list'}
          <div class="row head kp-label">
            <span>Nom</span><span>Taille</span><span>Modifié</span><span>Droits</span><span>{inTrash ? 'Origine' : 'Propriétaire'}</span>
          </div>
        {/if}
        {#each entries as e (e.path)}
          {@const ic = fileIcon(e.name, e.type === 'dir', !canRead(e))}
          <div
            class={view === 'list' ? 'row' : 'tile'}
            class:sel={selection.includes(e.path)}
            class:hidden={e.hidden}
            class:cut={clipboard.mode === 'cut' && clipboard.paths.includes(e.path)}
            class:dropping={dropOn === e.path}
            role="option"
            tabindex="-1"
            aria-selected={selection.includes(e.path)}
            draggable={renaming !== e.path}
            onclick={(ev) => clickItem(ev, e)}
            onkeydown={(ev) => { if (ev.key === ' ') { ev.preventDefault(); clickItem(ev as unknown as MouseEvent, e); } }}
            ondblclick={() => open(e)}
            oncontextmenu={(ev) => itemContext(ev, e)}
            ondragstart={(ev) => dragStart(ev, e)}
            ondragover={(ev) => { if (e.type === 'dir' && accepts(ev)) { ev.preventDefault(); ev.stopPropagation(); dropOn = e.path; } }}
            ondragleave={() => { if (dropOn === e.path) dropOn = null; }}
            ondrop={(ev) => { if (e.type === 'dir') dropInto(ev, e.path); }}
          >
            <span class="name">
              <span class="fi {ic.tone}"><Icon name={ic.icon} size={view === 'list' ? 16 : 34} stroke={view === 'list' ? 1.5 : 1.2} /></span>
              {#if renaming === e.path}
                <input
                  class="rename"
                  bind:value={renameValue}
                  onkeydown={(ev) => { ev.stopPropagation(); if (ev.key === 'Enter') commitRename(); if (ev.key === 'Escape') renaming = null; }}
                  onblur={commitRename}
                  onclick={(ev) => ev.stopPropagation()}
                  spellcheck="false"
                />
              {:else}
                <span class="nm">{e.name}</span>
              {/if}
              {#if view === 'list' && !canRead(e)}<span class="kp-badge red">verrouillé</span>{/if}
            </span>
            {#if view === 'list'}
              <span class="mono dim num">{e.type === 'dir' ? '—' : fmtSize(e.size)}</span>
              <span class="mono dim num">{k.time.short(e.mtime)}</span>
              <span class="mono dim">{modeString(e.type, e.mode)}</span>
              <span class="mono dim">{inTrash ? (trashOrigin(e.path) ?? '?') : `${e.owner}:${e.group}`}</span>
            {/if}
          </div>
        {:else}
          <div class="kp-empty">{inTrash ? 'La corbeille est vide.' : `Dossier vide${hiddenCount && !showHidden ? ` — ${hiddenCount} élément(s) caché(s)` : ''}`}</div>
        {/each}
      </div>
    {/if}
    <footer class="status mono">
      {#if selection.length}
        {selection.length} sélectionné{selection.length > 1 ? 's' : ''}{selectedSize ? ` · ${fmtSize(selectedSize)}` : ''}
      {:else}
        {entries.length} élément(s)
      {/if}
      <span class="grow"></span>
      {#if clipboard.paths.length}<span class="clip">{clipboard.mode === 'cut' ? 'Couper' : 'Copier'} : {clipboard.paths.length} — Ctrl+V pour coller</span>{/if}
    </footer>
  </div>
</div>

<style>
  .files { display: flex; flex: 1; min-height: 0; }
  .sec { padding: 10px 8px 6px; }
  .sec:first-child { padding-top: 2px; }
  :global(.kp-side-item.dropping) { background: var(--kp-violet-dim) !important; color: var(--kp-violet) !important; }
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .crumbs { flex: 1; display: flex; align-items: center; gap: 2px; overflow: hidden; font-size: 12px; min-width: 0; height: 28px; padding: 0 4px; border-radius: var(--kp-radius-s); }
  .crumbs:hover { background: rgba(255, 255, 255, 0.02); }
  .crumbs button { border: 0; background: transparent; color: var(--kp-text-1); padding: 3px 5px; border-radius: 5px; white-space: nowrap; }
  .crumbs button:hover { background: var(--kp-bg-4); color: var(--kp-text-0); }
  .crumbs button.last { color: var(--kp-cyan); }
  .pathinput { flex: 1; font-size: 12px; }
  .slash { color: var(--kp-text-2); }
  .search { width: 130px; }
  .trashbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--kp-amber-dim); color: var(--kp-amber); font-size: 12px; border-bottom: 1px solid var(--kp-line); }
  .kp-btn.danger { color: var(--kp-red); }
  .grow { flex: 1; }
  .body { flex: 1; overflow: auto; outline: none; }
  .body.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); align-content: start; gap: 4px; padding: 10px; }
  .row {
    display: grid; grid-template-columns: minmax(180px, 1fr) 80px 110px 100px 140px; align-items: center; gap: 10px;
    height: 30px; padding: 0 14px; border-bottom: 1px solid var(--kp-line); cursor: default; outline: none;
  }
  .row.head { position: sticky; top: 0; z-index: 1; height: 28px; background: var(--kp-bg-1); border-bottom-color: var(--kp-line-strong); }
  .row:not(.head):hover { background: rgba(255, 255, 255, 0.02); }
  .row.sel { background: var(--kp-cyan-dim); box-shadow: inset 2px 0 0 var(--kp-cyan); }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px 8px; border-radius: var(--kp-radius-m); border: 1px solid transparent; outline: none; text-align: center; }
  .tile:hover { background: rgba(255, 255, 255, 0.03); }
  .tile.sel { background: var(--kp-cyan-dim); border-color: rgba(62, 230, 245, 0.28); }
  .tile .name { flex-direction: column; gap: 6px; }
  .tile .nm { font-size: 11.5px; white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .dropping { background: var(--kp-violet-dim) !important; box-shadow: inset 0 0 0 1px rgba(157, 123, 255, 0.6) !important; }
  .hidden .nm { opacity: 0.6; font-style: italic; }
  .cut { opacity: 0.5; }
  .name { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rename { width: 100%; min-width: 80px; padding: 1px 4px; font-size: 12px; border: 1px solid var(--kp-cyan); border-radius: 4px; background: var(--kp-bg-1); outline: none; user-select: text; }
  .fi { display: grid; color: var(--kp-text-1); }
  .fi.dir { color: #8ab8ff; }
  .fi.image { color: var(--kp-violet); }
  .fi.mail { color: var(--kp-cyan); }
  .fi.log, .fi.key { color: var(--kp-amber); }
  .fi.script { color: var(--kp-green); }
  .fi.bin { color: var(--kp-text-2); }
  .dim { color: var(--kp-text-2); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { display: flex; align-items: center; height: 26px; padding: 0 14px; border-top: 1px solid var(--kp-line); color: var(--kp-text-2); font-size: 11px; background: var(--kp-bg-2); }
  .clip { color: var(--kp-cyan); }
  @media (max-width: 900px) { .row { grid-template-columns: minmax(160px, 1fr) 70px 100px; } .row > :nth-child(4), .row > :nth-child(5) { display: none; } }
</style>
