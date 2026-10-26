<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import { wm } from '$lib/os/wm.svelte';
  import { settings } from '$lib/os/settings.svelte';
  import { contextMenu, sep, type MenuItem } from '$lib/os/menu.svelte';
  import { desktop, layout, CELL_W, CELL_H, MARGIN, type Cell } from '$lib/os/desktop.svelte';
  import { folderMenu, itemMenu } from '$lib/os/filemenu';
  import {
    clipboard,
    desktopDir,
    emptyTrash,
    home,
    openEntry,
    parseDesktopEntry,
    paste,
    properties,
    rename,
    transfer,
    trash,
    trashCount,
    trashFiles,
  } from '$lib/os/fileops.svelte';
  import { fileIcon } from './icons';
  import type { Stat } from '@kp/kernel';
  import Icon from './Icon.svelte';

  const DND = 'application/x-kp-paths';
  const k = os.kernel!;

  interface Item {
    key: string;
    label: string;
    icon: string;
    tone: string;
    stat?: Stat;
    system?: 'home' | 'trash' | 'case';
    dropTarget: boolean;
  }

  let root: HTMLDivElement;
  let height = $state(800);

  onMount(() => {
    // Every real desktop has a ~/Desktop folder; create it if a scenario didn't ship one.
    try {
      if (!k.vfs.exists(desktopDir(), os.cred)) k.vfs.mkdir(desktopDir(), os.cred);
    } catch {
      /* read-only home: icons from the system only */
    }
    const ro = new ResizeObserver(() => (height = root.clientHeight));
    ro.observe(root);
    return () => ro.disconnect();
  });

  const rows = $derived(Math.max(1, Math.floor((height - MARGIN * 2) / CELL_H)));

  const items = $derived.by((): Item[] => {
    void os.version;
    const full = trashCount() > 0;
    const sys: Item[] = [
      { key: 'sys:home', label: 'Dossier personnel', icon: 'home', tone: 'dir', system: 'home', dropTarget: true },
      { key: 'sys:trash', label: 'Corbeille', icon: full ? 'trash-full' : 'trash', tone: 'trash', system: 'trash', dropTarget: true },
      { key: 'sys:case', label: 'Dossier d’enquête', icon: 'case', tone: 'case', system: 'case', dropTarget: false },
    ];
    let entries: Stat[] = [];
    try {
      entries = k.vfs.readdir(desktopDir(), os.cred, { silent: true }).filter((e) => settings.desktopHidden || !e.hidden);
    } catch {
      /* no desktop folder */
    }
    const files = entries.map((e): Item => {
      if (e.name.endsWith('.desktop')) {
        try {
          const entry = parseDesktopEntry(k.vfs.readFile(e.path, os.cred, { silent: true }));
          if (entry) return { key: e.path, label: entry.name, icon: entry.icon ?? 'file', tone: 'launcher', stat: e, dropTarget: false };
        } catch {
          /* unreadable launcher: show as a file */
        }
      }
      const ic = fileIcon(e.name, e.type === 'dir');
      return { key: e.path, label: e.name, icon: ic.icon, tone: ic.tone, stat: e, dropTarget: e.type === 'dir' };
    });
    return [...sys, ...files];
  });

  const cells = $derived(layout(items.map((i) => i.key), rows, desktop.positions));
  const pos = (c: Cell) => `left:${MARGIN + c.c * CELL_W}px;top:${MARGIN + c.r * CELL_H}px`;

  // Forget positions of icons that no longer exist (deleted, moved away).
  $effect(() => {
    const keys = new Set(items.map((i) => i.key));
    const stale = Object.keys(desktop.positions).filter((key) => !keys.has(key));
    if (stale.length) {
      const next = { ...desktop.positions };
      for (const key of stale) delete next[key];
      desktop.positions = next;
    }
  });

  function open(it: Item) {
    if (it.system === 'home') wm.open('files', { path: home() });
    else if (it.system === 'trash') wm.open('files', { path: trashFiles() });
    else if (it.system === 'case') wm.open('case');
    else if (it.stat) openEntry(it.stat);
  }

  // ── Selection & rubber band ────────────────────────────────────────────
  let band = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  function onIconDown(e: PointerEvent, it: Item) {
    if (e.button !== 0) return;
    root.focus();
    if (e.ctrlKey || e.metaKey) {
      desktop.select(desktop.isSelected(it.key) ? desktop.selection.filter((k) => k !== it.key) : [...desktop.selection, it.key]);
    } else if (!desktop.isSelected(it.key)) {
      desktop.select([it.key]);
    }
  }

  function onBackgroundDown(e: PointerEvent) {
    if (e.target !== root || e.button !== 0) return;
    root.focus();
    desktop.renaming = null;
    const r = root.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    band = { x0: x, y0: y, x1: x, y1: y };
    const base = e.ctrlKey ? [...desktop.selection] : [];
    if (!e.ctrlKey) desktop.select([]);
    root.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      band = { ...band!, x1: ev.clientX - r.left, y1: ev.clientY - r.top };
      const [lx, hx] = [Math.min(band.x0, band.x1), Math.max(band.x0, band.x1)];
      const [ly, hy] = [Math.min(band.y0, band.y1), Math.max(band.y0, band.y1)];
      const hit = items.filter((it) => {
        const c = cells[it.key]!;
        const ix = MARGIN + c.c * CELL_W + 8;
        const iy = MARGIN + c.r * CELL_H + 4;
        return ix < hx && ix + CELL_W - 16 > lx && iy < hy && iy + CELL_H - 12 > ly;
      });
      desktop.select([...new Set([...base, ...hit.map((h) => h.key)])]);
    };
    const up = () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      band = null;
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
  }

  // ── Drag & drop (HTML5, so files can also come from / go to the Files app) ──
  let dropOn = $state<string | null>(null);

  function onDragStart(e: DragEvent, it: Item) {
    if (!desktop.isSelected(it.key)) desktop.select([it.key]);
    e.dataTransfer!.setData(DND, JSON.stringify(desktop.selection));
    e.dataTransfer!.effectAllowed = 'move';
  }

  function cellAt(e: DragEvent): Cell {
    const r = root.getBoundingClientRect();
    return {
      c: Math.max(0, Math.floor((e.clientX - r.left - MARGIN) / CELL_W)),
      r: Math.min(rows - 1, Math.max(0, Math.floor((e.clientY - r.top - MARGIN) / CELL_H))),
    };
  }

  function onDropBackground(e: DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer?.getData(DND);
    if (!raw) return;
    const keys: string[] = JSON.parse(raw);
    const target = cellAt(e);
    const dir = desktopDir();
    // Files dragged in from elsewhere are moved into ~/Desktop.
    const outside = keys.filter((key) => !key.startsWith('sys:') && !key.startsWith(dir + '/'));
    if (outside.length) transfer(outside, dir, 'move');
    // Place the dragged icons from the drop cell downwards, keeping their order.
    const next = { ...desktop.positions };
    const occupied = new Set(Object.entries(cells).filter(([key]) => !keys.includes(key)).map(([, c]) => `${c.c},${c.r}`));
    let c = target.c;
    let r = target.r;
    for (const key of keys) {
      const finalKey = key.startsWith('sys:') || key.startsWith(dir + '/') ? key : `${dir}/${key.split('/').pop()}`;
      while (occupied.has(`${c},${r}`)) {
        r++;
        if (r >= rows) (r = 0), c++;
      }
      next[finalKey] = { c, r };
      occupied.add(`${c},${r}`);
    }
    desktop.positions = next;
  }

  function onDropItem(e: DragEvent, it: Item) {
    const raw = e.dataTransfer?.getData(DND);
    if (!raw || !it.dropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    dropOn = null;
    const keys = (JSON.parse(raw) as string[]).filter((key) => !key.startsWith('sys:') && key !== it.key);
    if (!keys.length) return;
    if (it.system === 'trash') trash(keys);
    else if (it.system === 'home') transfer(keys, home(), 'move');
    else if (it.stat) transfer(keys, it.stat.path, 'move');
  }

  // ── Rename ─────────────────────────────────────────────────────────────
  let renameValue = $state('');

  async function startRename(key: string) {
    const it = items.find((i) => i.key === key);
    if (!it?.stat) return;
    desktop.select([key]);
    renameValue = it.stat.name;
    desktop.renaming = key;
    await tick();
    const input = root.querySelector<HTMLInputElement>('.rename');
    input?.focus();
    // Select the name without its extension, like every file manager.
    const dot = renameValue.lastIndexOf('.');
    input?.setSelectionRange(0, dot > 0 ? dot : renameValue.length);
  }

  function commitRename() {
    const key = desktop.renaming;
    desktop.renaming = null;
    if (!key) return;
    const dest = rename(key, renameValue);
    if (dest) {
      desktop.rekey(key, dest);
      desktop.select([dest]);
    }
  }

  // ── Menus & keyboard ───────────────────────────────────────────────────
  const selectedStats = () => items.filter((i) => desktop.isSelected(i.key) && i.stat).map((i) => i.stat!);

  function onItemMenu(e: MouseEvent, it: Item) {
    e.preventDefault();
    e.stopPropagation();
    if (!desktop.isSelected(it.key)) desktop.select([it.key]);
    if (it.system === 'trash') {
      contextMenu.show(e, [
        { label: 'Ouvrir', icon: 'chevron-right', run: () => open(it) },
        sep,
        { label: 'Vider la corbeille', icon: 'x', danger: true, disabled: !trashCount(), run: () => emptyTrash() },
      ]);
    } else if (it.system) {
      contextMenu.show(e, [
        { label: 'Ouvrir', icon: 'chevron-right', run: () => open(it) },
        ...(it.system === 'home'
          ? ([sep, { label: 'Propriétés', icon: 'info', run: () => properties(home()) }] as MenuItem[])
          : []),
      ]);
    } else {
      contextMenu.show(e, itemMenu(selectedStats(), { rename: startRename }));
    }
  }

  function onBackgroundMenu(e: MouseEvent) {
    if (e.target !== root) return;
    e.preventDefault();
    desktop.select([]);
    contextMenu.show(
      e,
      folderMenu(desktopDir(), [
        sep,
        { label: 'Réorganiser les icônes', icon: 'menu', run: () => (desktop.positions = {}) },
        {
          label: 'Afficher les fichiers cachés',
          icon: 'eye',
          checked: settings.desktopHidden,
          run: () => {
            settings.desktopHidden = !settings.desktopHidden;
            settings.persist();
          },
        },
        sep,
        { label: 'Changer le fond d’écran…', icon: 'image', run: () => wm.open('settings', { section: 'appearance' }) },
        { label: 'Paramètres', icon: 'settings', run: () => wm.open('settings') },
      ]),
    );
  }

  function onKey(e: KeyboardEvent) {
    if (desktop.renaming) return;
    const sel = selectedStats();
    if (e.key === 'Enter') {
      for (const it of items.filter((i) => desktop.isSelected(i.key))) open(it);
    } else if (e.key === 'Delete') {
      if (sel.length) trash(sel.map((s) => s.path));
    } else if (e.key === 'F2' && sel.length === 1) {
      e.preventDefault();
      startRename(sel[0]!.path);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      desktop.select(items.map((i) => i.key));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel.length) {
      clipboard.set('copy', sel.map((s) => s.path));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && sel.length) {
      clipboard.set('cut', sel.map((s) => s.path));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      paste(desktopDir());
    } else if (e.key === 'Escape') {
      desktop.select([]);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="icons"
  bind:this={root}
  tabindex="0"
  role="listbox"
  aria-label="Bureau"
  aria-multiselectable="true"
  onpointerdown={onBackgroundDown}
  oncontextmenu={onBackgroundMenu}
  onkeydown={onKey}
  ondragover={(e) => { if (e.dataTransfer?.types.includes(DND)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
  ondrop={onDropBackground}
>
  {#each items as it (it.key)}
    {@const c = cells[it.key]}
    {#if c}
      <div
        class="icon {it.tone}"
        class:selected={desktop.isSelected(it.key)}
        class:cut={clipboard.mode === 'cut' && clipboard.paths.includes(it.key)}
        class:drop={dropOn === it.key}
        class:hidden-file={it.stat?.hidden}
        style={pos(c)}
        role="option"
        tabindex="-1"
        aria-selected={desktop.isSelected(it.key)}
        draggable={desktop.renaming !== it.key}
        onpointerdown={(e) => onIconDown(e, it)}
        ondblclick={() => open(it)}
        oncontextmenu={(e) => onItemMenu(e, it)}
        ondragstart={(e) => onDragStart(e, it)}
        ondragover={(e) => { if (it.dropTarget && e.dataTransfer?.types.includes(DND)) { e.preventDefault(); e.stopPropagation(); dropOn = it.key; } }}
        ondragleave={() => { if (dropOn === it.key) dropOn = null; }}
        ondrop={(e) => onDropItem(e, it)}
      >
        <span class="tile"><Icon name={it.icon} size={30} stroke={1.3} /></span>
        {#if desktop.renaming === it.key}
          <input
            class="rename"
            bind:value={renameValue}
            onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') desktop.renaming = null; }}
            onblur={commitRename}
            onpointerdown={(e) => e.stopPropagation()}
            spellcheck="false"
          />
        {:else}
          <span class="lbl">{it.label}</span>
        {/if}
      </div>
    {/if}
  {/each}
  {#if band}
    <div
      class="band"
      style="left:{Math.min(band.x0, band.x1)}px;top:{Math.min(band.y0, band.y1)}px;width:{Math.abs(band.x1 - band.x0)}px;height:{Math.abs(band.y1 - band.y0)}px"
    ></div>
  {/if}
</div>

<style>
  .icons { position: absolute; inset: 0 0 48px 0; outline: none; z-index: 1; }
  .icon {
    position: absolute;
    width: 88px;
    min-height: 92px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 6px 2px 4px;
    border: 1px solid transparent;
    border-radius: var(--kp-radius-m);
    color: var(--kp-text-0);
    transition: background var(--kp-dur-fast);
  }
  .icon:hover { background: rgba(255, 255, 255, 0.04); }
  .icon.selected { background: rgba(62, 230, 245, 0.12); border-color: rgba(62, 230, 245, 0.28); }
  .icon.drop { background: rgba(157, 123, 255, 0.18); border-color: rgba(157, 123, 255, 0.6); }
  .icon.cut, .icon.hidden-file { opacity: 0.55; }
  .tile {
    display: grid;
    place-items: center;
    width: 50px;
    height: 50px;
    border-radius: 13px;
    background: linear-gradient(160deg, rgba(28, 36, 48, 0.92), rgba(15, 20, 28, 0.92));
    border: 1px solid var(--kp-line-strong);
    box-shadow: var(--kp-shadow-1);
    color: var(--kp-text-1);
    pointer-events: none;
  }
  .dir .tile { color: #8ab8ff; }
  .trash .tile { color: var(--kp-text-1); }
  .case .tile, .launcher .tile { color: var(--kp-cyan); }
  .image .tile { color: var(--kp-violet); }
  .mail .tile { color: var(--kp-cyan); }
  .log .tile, .key .tile { color: var(--kp-amber); }
  .script .tile { color: var(--kp-green); }
  .lbl {
    max-width: 86px;
    font-size: 11.5px;
    line-height: 1.25;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    pointer-events: none;
  }
  .selected .lbl { -webkit-line-clamp: 4; line-clamp: 4; }
  .rename {
    width: 92px;
    padding: 2px 4px;
    font-size: 11.5px;
    text-align: center;
    border: 1px solid var(--kp-cyan);
    border-radius: 4px;
    background: var(--kp-bg-1);
    outline: none;
    user-select: text;
  }
  .band { position: absolute; border: 1px solid rgba(62, 230, 245, 0.7); background: rgba(62, 230, 245, 0.1); pointer-events: none; }
</style>
