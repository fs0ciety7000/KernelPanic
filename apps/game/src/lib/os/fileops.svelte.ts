// File operations shared by the desktop and the Files app. Everything goes through the
// kernel with the session credentials, so the desktop obeys exactly the same permissions
// as the terminal. Trash follows the freedesktop.org spec (~/.local/share/Trash).

import { FsError, path as P, type Stat } from '@kp/kernel';
import { os } from './os.svelte';
import { notify } from './notify.svelte';
import { appById } from './apps';
import { wm } from './wm.svelte';

export interface DesktopEntry {
  name: string;
  exec: string;
  icon?: string;
  comment?: string;
}

/** Parses a freedesktop `.desktop` launcher. Exec is a Kernel_Panic app id (optionally `app path`). */
export function parseDesktopEntry(content: string): DesktopEntry | null {
  if (!/^\[Desktop Entry\]/m.test(content)) return null;
  const get = (k: string) => content.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
  const name = get('Name');
  const exec = get('Exec');
  if (!name || !exec) return null;
  return { name, exec, icon: get('Icon'), comment: get('Comment') };
}

function errorToast(title: string, e: unknown, path: string) {
  const msg = e instanceof FsError ? `${P.tildify(path, home())} : ${e.message}` : (e as Error).message;
  notify.push({ kind: 'error', title, body: msg }, 5000);
}

export const home = () => os.kernel!.users.get(os.kernel!.sessionUser)!.home;
export const desktopDir = () => `${home()}/Desktop`;
export const trashFiles = () => `${home()}/.local/share/Trash/files`;
const trashInfo = () => `${home()}/.local/share/Trash/info`;
export const isInTrash = (path: string) => path.startsWith(trashFiles() + '/');

function exists(path: string): boolean {
  return os.kernel!.vfs.exists(path, os.cred);
}

/** "Nouveau dossier", "Nouveau dossier (2)"… — like every file manager. */
export function uniqueName(dir: string, base: string, ext = ''): string {
  let name = `${base}${ext}`;
  for (let i = 2; exists(`${dir}/${name}`); i++) name = `${base} (${i})${ext}`;
  return name;
}

export function newFolder(dir: string): string | null {
  const path = `${dir}/${uniqueName(dir, 'Nouveau dossier')}`;
  try {
    os.kernel!.vfs.mkdir(path, os.cred);
    return path;
  } catch (e) {
    errorToast('Impossible de créer le dossier', e, dir);
    return null;
  }
}

export function newTextFile(dir: string): string | null {
  const path = `${dir}/${uniqueName(dir, 'Nouveau document', '.txt')}`;
  try {
    os.kernel!.vfs.writeFile(path, '', os.cred);
    return path;
  } catch (e) {
    errorToast('Impossible de créer le fichier', e, dir);
    return null;
  }
}

/** Returns the new path, or null on error / invalid name. */
export function rename(path: string, newName: string): string | null {
  const name = newName.trim();
  if (!name || name === P.basename(path)) return null;
  if (name.includes('/') || name === '.' || name === '..') {
    notify.push({ kind: 'error', title: 'Nom invalide', body: 'Un nom de fichier ne peut pas contenir « / ».' }, 4000);
    return null;
  }
  const dest = `${P.dirname(path)}/${name}`;
  if (exists(dest)) {
    notify.push({ kind: 'error', title: 'Nom déjà utilisé', body: name }, 4000);
    return null;
  }
  try {
    os.kernel!.vfs.move(path, dest, os.cred);
    return dest;
  } catch (e) {
    errorToast('Impossible de renommer', e, path);
    return null;
  }
}

export function trash(paths: string[]): number {
  const k = os.kernel!;
  let moved = 0;
  for (const path of paths) {
    if (isInTrash(path)) continue;
    try {
      k.vfs.mkdir(trashFiles(), os.cred, { parents: true });
      k.vfs.mkdir(trashInfo(), os.cred, { parents: true });
      const name = uniqueName(trashFiles(), P.basename(path));
      k.vfs.move(path, `${trashFiles()}/${name}`, os.cred);
      const date = k.time.iso(k.now()).replace(' ', 'T');
      k.vfs.writeFile(`${trashInfo()}/${name}.trashinfo`, `[Trash Info]\nPath=${path}\nDeletionDate=${date}\n`, os.cred);
      moved++;
    } catch (e) {
      errorToast('Impossible de mettre à la corbeille', e, path);
    }
  }
  if (moved) notify.push({ kind: 'system', title: 'Corbeille', body: `${moved} élément${moved > 1 ? 's' : ''} déplacé${moved > 1 ? 's' : ''} dans la corbeille.` }, 3000);
  return moved;
}

/** Original location of a trashed item (from its .trashinfo). */
export function trashOrigin(trashedPath: string): string | null {
  try {
    const info = os.kernel!.vfs.readFile(`${trashInfo()}/${P.basename(trashedPath)}.trashinfo`, os.cred, { silent: true });
    return info.match(/^Path=(.*)$/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function restore(paths: string[]): void {
  for (const p of paths) {
    const origin = trashOrigin(p);
    if (!origin) continue;
    const dest = exists(origin) ? `${P.dirname(origin)}/${uniqueName(P.dirname(origin), P.basename(origin))}` : origin;
    try {
      os.kernel!.vfs.move(p, dest, os.cred);
      os.kernel!.vfs.remove(`${trashInfo()}/${P.basename(p)}.trashinfo`, os.cred);
    } catch (e) {
      errorToast('Impossible de restaurer', e, p);
    }
  }
}

export function emptyTrash(): void {
  const k = os.kernel!;
  for (const dir of [trashFiles(), trashInfo()]) {
    try {
      for (const e of k.vfs.readdir(dir, os.cred, { silent: true })) k.vfs.remove(e.path, os.cred, { recursive: true });
    } catch {
      /* empty or missing */
    }
  }
}

export function trashCount(): number {
  try {
    return os.kernel!.vfs.readdir(trashFiles(), os.cred, { silent: true }).length;
  } catch {
    return 0;
  }
}

// ── Clipboard ────────────────────────────────────────────────────────────

class Clipboard {
  mode = $state<'copy' | 'cut'>('copy');
  paths = $state<string[]>([]);

  set(mode: 'copy' | 'cut', paths: string[]) {
    this.mode = mode;
    this.paths = [...paths];
  }
}
export const clipboard = new Clipboard();

/** Moves or copies `paths` into `dir`. Used by paste and drag & drop. */
export function transfer(paths: string[], dir: string, mode: 'copy' | 'move'): void {
  const vfs = os.kernel!.vfs;
  for (const src of paths) {
    if (P.dirname(src) === dir && mode === 'move') continue;
    if (dir === src || dir.startsWith(src + '/')) {
      notify.push({ kind: 'error', title: 'Opération impossible', body: 'Un dossier ne peut pas être placé dans lui-même.' }, 4000);
      continue;
    }
    const name = exists(`${dir}/${P.basename(src)}`) ? uniqueName(dir, P.basename(src)) : P.basename(src);
    try {
      if (mode === 'move') vfs.move(src, `${dir}/${name}`, os.cred);
      else vfs.copy(src, `${dir}/${name}`, os.cred, { recursive: true });
    } catch (e) {
      errorToast(mode === 'move' ? 'Impossible de déplacer' : 'Impossible de copier', e, src);
    }
  }
}

export function paste(dir: string): void {
  if (!clipboard.paths.length) return;
  transfer(clipboard.paths, dir, clipboard.mode === 'cut' ? 'move' : 'copy');
  if (clipboard.mode === 'cut') clipboard.paths = [];
}

// ── Opening ──────────────────────────────────────────────────────────────

/** Double-click behaviour: folders browse, launchers launch, files open with their app. */
export function openEntry(st: Pick<Stat, 'path' | 'type'>): void {
  if (st.type === 'dir') {
    wm.open('files', { path: st.path });
    return;
  }
  if (st.path.endsWith('.desktop')) {
    try {
      const entry = parseDesktopEntry(os.kernel!.vfs.readFile(st.path, os.cred, { silent: true }));
      if (entry) {
        // "app" or "app <path>" — the path may itself contain spaces.
        const exec = entry.exec.trim();
        const space = exec.indexOf(' ');
        const app = space < 0 ? exec : exec.slice(0, space);
        const arg = space < 0 ? '' : exec.slice(space + 1).trim();
        if (app && appById(app)) {
          wm.open(app, arg ? { path: arg.replace(/^~/, home()) } : {});
          return;
        }
      }
    } catch (e) {
      errorToast('Impossible de lancer', e, st.path);
      return;
    }
  }
  os.openPath(st.path);
}

export function properties(path: string): void {
  wm.open('properties', { path });
}
