// Context menus for files and folders — the same on the desktop and in the Files app.

import type { Stat } from '@kp/kernel';
import { APPS } from './apps';
import { wm } from './wm.svelte';
import { os } from './os.svelte';
import { sep, type MenuItem } from './menu.svelte';
import {
  clipboard,
  emptyTrash,
  isInTrash,
  newFolder,
  newTextFile,
  openEntry,
  paste,
  properties,
  restore,
  trash,
  trashCount,
  trashFiles,
} from './fileops.svelte';

const VIEWERS = ['notes', 'images', 'logs', 'mail'];

export interface ItemMenuHooks {
  /** Start inline rename of this path (desktop icon label / Files row). */
  rename?: (path: string) => void;
}

/** Menu for one or several selected entries. */
export function itemMenu(entries: Stat[], hooks: ItemMenuHooks = {}): MenuItem[] {
  const one = entries.length === 1 ? entries[0]! : null;
  const paths = entries.map((e) => e.path);
  const inTrash = paths.every(isInTrash);

  if (inTrash) {
    return [
      { label: 'Restaurer', icon: 'refresh', run: () => restore(paths) },
      sep,
      { label: 'Propriétés', icon: 'info', disabled: !one, run: () => one && properties(one.path) },
    ];
  }

  const items: MenuItem[] = [];
  if (one) {
    items.push({ label: 'Ouvrir', icon: 'chevron-right', shortcut: 'Entrée', run: () => openEntry(one) });
    if (one.type === 'file') {
      items.push({
        label: 'Ouvrir avec',
        icon: 'maximize',
        submenu: APPS.filter((a) => VIEWERS.includes(a.id)).map((a) => ({ label: a.title, icon: a.icon, run: () => os.openPath(one.path, a.id) })),
      });
    }
    if (one.type === 'dir') {
      items.push({ label: 'Ouvrir un terminal ici', icon: 'terminal', run: () => wm.open('terminal', { cwd: one.path }) });
    }
    items.push(sep);
  }
  items.push(
    { label: 'Couper', icon: 'minus', shortcut: 'Ctrl+X', run: () => clipboard.set('cut', paths) },
    { label: 'Copier', icon: 'file', shortcut: 'Ctrl+C', run: () => clipboard.set('copy', paths) },
  );
  if (one?.type === 'dir' && clipboard.paths.length) {
    items.push({ label: 'Coller dans le dossier', icon: 'save', run: () => paste(one.path) });
  }
  items.push(
    sep,
    { label: 'Renommer', icon: 'note', shortcut: 'F2', disabled: !one || !hooks.rename, run: () => one && hooks.rename?.(one.path) },
    { label: 'Mettre à la corbeille', icon: 'x', shortcut: 'Suppr', danger: true, run: () => trash(paths) },
    sep,
    { label: 'Propriétés', icon: 'info', disabled: !one, run: () => one && properties(one.path) },
  );
  return items;
}

/** Menu for the background of a folder view (or the desktop itself). */
export function folderMenu(dir: string, extra: MenuItem[] = []): MenuItem[] {
  const isTrash = dir === trashFiles();
  if (isTrash) {
    return [{ label: 'Vider la corbeille', icon: 'x', danger: true, disabled: !trashCount(), run: () => emptyTrash() }, ...extra];
  }
  return [
    { label: 'Nouveau dossier', icon: 'folder', shortcut: 'Ctrl+Maj+N', run: () => newFolder(dir) },
    { label: 'Nouveau document texte', icon: 'note', run: () => newTextFile(dir) },
    sep,
    { label: 'Coller', icon: 'save', shortcut: 'Ctrl+V', disabled: !clipboard.paths.length, run: () => paste(dir) },
    sep,
    { label: 'Ouvrir un terminal ici', icon: 'terminal', run: () => wm.open('terminal', { cwd: dir }) },
    { label: 'Ouvrir dans Fichiers', icon: 'folder', run: () => wm.open('files', { path: dir }) },
    ...extra,
  ];
}
