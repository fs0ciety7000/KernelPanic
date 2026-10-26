import type { EventBus } from '../events';
import { basename, dirname, normalize } from './path';

export type NodeType = 'file' | 'dir' | 'symlink';

export interface Inode {
  type: NodeType;
  mode: number;
  owner: string;
  group: string;
  mtime: number;
  content?: string;
  children?: Map<string, Inode>;
  target?: string;
}

/** Credentials a VFS call is made with. root (uid 0) bypasses permission bits. */
export interface Cred {
  user: string;
  uid: number;
  groups: string[];
}

export const ROOT: Cred = { user: 'root', uid: 0, groups: ['root'] };

export interface Stat {
  path: string;
  name: string;
  type: NodeType;
  mode: number;
  owner: string;
  group: string;
  size: number;
  mtime: number;
  hidden: boolean;
  target?: string;
}

export type FsErrorCode =
  | 'ENOENT' | 'EACCES' | 'ENOTDIR' | 'EISDIR' | 'EEXIST' | 'ENOTEMPTY' | 'EPERM' | 'EINVAL' | 'ELOOP';

const MESSAGES: Record<FsErrorCode, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted',
  EINVAL: 'Invalid argument',
  ELOOP: 'Too many levels of symbolic links',
};

export class FsError extends Error {
  constructor(public code: FsErrorCode, public path: string) {
    super(MESSAGES[code]);
  }
}

/** A flat, serializable entry used both by scenario bundles and save diffs. */
export interface FsEntry {
  path: string;
  type: NodeType;
  mode: number;
  owner: string;
  group: string;
  mtime: number;
  content?: string;
  target?: string;
}

export interface VfsDiff {
  upserts: FsEntry[];
  deletes: string[];
}

type Perm = 'r' | 'w' | 'x';
const BITS: Record<Perm, number> = { r: 4, w: 2, x: 1 };

export function modeString(type: NodeType, mode: number): string {
  const t = type === 'dir' ? 'd' : type === 'symlink' ? 'l' : '-';
  let s = '';
  for (const shift of [6, 3, 0]) {
    const v = (mode >> shift) & 7;
    s += (v & 4 ? 'r' : '-') + (v & 2 ? 'w' : '-') + (v & 1 ? 'x' : '-');
  }
  if (mode & 0o1000) s = s.slice(0, 8) + (s[8] === 'x' ? 't' : 'T');
  return t + s;
}

export class Vfs {
  root: Inode;
  /** Paths mutated since mount; used to build save diffs. */
  private dirty = new Set<string>();

  constructor(
    private bus?: EventBus,
    private clock: () => number = () => Date.now(),
  ) {
    this.root = { type: 'dir', mode: 0o755, owner: 'root', group: 'root', mtime: clock(), children: new Map() };
  }

  // ── Mounting ────────────────────────────────────────────────────────────

  /** Load entries without permission checks or events (scenario image). */
  mount(entries: FsEntry[]): void {
    const sorted = [...entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length);
    for (const e of sorted) this.put(e);
    this.dirty.clear();
  }

  private put(e: FsEntry): void {
    const path = normalize(e.path);
    if (path === '/') {
      Object.assign(this.root, { mode: e.mode, owner: e.owner, group: e.group, mtime: e.mtime });
      return;
    }
    const parent = this.ensureDir(dirname(path));
    const existing = parent.children!.get(basename(path));
    const node: Inode = {
      type: e.type,
      mode: e.mode,
      owner: e.owner,
      group: e.group,
      mtime: e.mtime,
      content: e.type === 'file' ? (e.content ?? '') : undefined,
      target: e.target,
      children: e.type === 'dir' ? (existing?.children ?? new Map()) : undefined,
    };
    parent.children!.set(basename(path), node);
  }

  private ensureDir(path: string): Inode {
    let node = this.root;
    for (const part of path.split('/').filter(Boolean)) {
      let next = node.children!.get(part);
      if (!next) {
        next = { type: 'dir', mode: 0o755, owner: 'root', group: 'root', mtime: this.clock(), children: new Map() };
        node.children!.set(part, next);
      }
      node = next;
    }
    return node;
  }

  // ── Resolution & permissions ────────────────────────────────────────────

  can(node: Inode, cred: Cred, perm: Perm): boolean {
    if (cred.uid === 0) return perm !== 'x' || node.type === 'dir' || (node.mode & 0o111) !== 0;
    const bit = BITS[perm];
    if (node.owner === cred.user) return ((node.mode >> 6) & bit) !== 0;
    if (cred.groups.includes(node.group)) return ((node.mode >> 3) & bit) !== 0;
    return (node.mode & bit) !== 0;
  }

  /** Walks the path, checking +x on every traversed directory. */
  private lookup(path: string, cred: Cred, follow = true, depth = 0): { node: Inode; path: string } {
    if (depth > 8) throw new FsError('ELOOP', path);
    const abs = normalize(path);
    let node = this.root;
    let cur = '';
    const parts = abs.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'dir') throw new FsError('ENOTDIR', abs);
      if (!this.can(node, cred, 'x')) throw new FsError('EACCES', abs);
      const child = node.children!.get(parts[i]!);
      if (!child) throw new FsError('ENOENT', abs);
      cur += '/' + parts[i];
      const last = i === parts.length - 1;
      if (child.type === 'symlink' && (!last || follow)) {
        const target = child.target!.startsWith('/') ? child.target! : `${dirname(cur)}/${child.target}`;
        const rest = parts.slice(i + 1).join('/');
        return this.lookup(rest ? `${target}/${rest}` : target, cred, follow, depth + 1);
      }
      node = child;
    }
    return { node, path: cur || '/' };
  }

  exists(path: string, cred: Cred = ROOT): boolean {
    try {
      this.lookup(path, cred);
      return true;
    } catch {
      return false;
    }
  }

  stat(path: string, cred: Cred = ROOT, follow = true): Stat {
    const { node, path: real } = this.lookup(path, cred, follow);
    return this.toStat(normalize(path) === real ? real : normalize(path), node);
  }

  private toStat(path: string, node: Inode): Stat {
    const name = basename(path);
    return {
      path,
      name,
      type: node.type,
      mode: node.mode,
      owner: node.owner,
      group: node.group,
      size: node.type === 'file' ? new TextEncoder().encode(node.content ?? '').length : node.type === 'dir' ? 4096 : (node.target ?? '').length,
      mtime: node.mtime,
      hidden: name.startsWith('.'),
      target: node.target,
    };
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  readFile(path: string, cred: Cred, opts: { silent?: boolean } = {}): string {
    const { node, path: real } = this.lookup(path, cred);
    if (node.type === 'dir') throw new FsError('EISDIR', real);
    if (!this.can(node, cred, 'r')) throw new FsError('EACCES', real);
    if (!opts.silent) this.bus?.emit('fs.read', { path: real, user: cred.user });
    return node.content ?? '';
  }

  readdir(path: string, cred: Cred, opts: { silent?: boolean } = {}): Stat[] {
    const { node, path: real } = this.lookup(path, cred);
    if (node.type !== 'dir') throw new FsError('ENOTDIR', real);
    if (!this.can(node, cred, 'r')) throw new FsError('EACCES', real);
    if (!opts.silent) this.bus?.emit('fs.list', { path: real, user: cred.user });
    const base = real === '/' ? '' : real;
    return [...node.children!.entries()]
      .map(([name, child]) => this.toStat(`${base}/${name}`, child))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Writing ─────────────────────────────────────────────────────────────

  private parentFor(path: string, cred: Cred): Inode {
    const { node } = this.lookup(dirname(path), cred);
    if (node.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!this.can(node, cred, 'w')) throw new FsError('EACCES', path);
    return node;
  }

  writeFile(path: string, content: string, cred: Cred, opts: { append?: boolean; mode?: number } = {}): void {
    const abs = normalize(path);
    let existing: Inode | undefined;
    try {
      existing = this.lookup(abs, cred).node;
    } catch (e) {
      if (!(e instanceof FsError) || e.code !== 'ENOENT') throw e;
    }
    if (existing) {
      if (existing.type === 'dir') throw new FsError('EISDIR', abs);
      if (!this.can(existing, cred, 'w')) throw new FsError('EACCES', abs);
      existing.content = opts.append ? (existing.content ?? '') + content : content;
      existing.mtime = this.clock();
    } else {
      const parent = this.parentFor(abs, cred);
      parent.children!.set(basename(abs), {
        type: 'file',
        mode: opts.mode ?? 0o644,
        owner: cred.user,
        group: cred.groups[0] ?? cred.user,
        mtime: this.clock(),
        content,
      });
      parent.mtime = this.clock();
    }
    this.touchDirty(abs);
    this.bus?.emit('fs.write', { path: abs, user: cred.user });
    this.bus?.emit('fs.change', { path: abs });
  }

  mkdir(path: string, cred: Cred, opts: { parents?: boolean } = {}): void {
    const abs = normalize(path);
    if (this.exists(abs, cred)) {
      if (opts.parents && this.stat(abs, cred).type === 'dir') return;
      throw new FsError('EEXIST', abs);
    }
    if (opts.parents && !this.exists(dirname(abs), cred)) this.mkdir(dirname(abs), cred, opts);
    const parent = this.parentFor(abs, cred);
    parent.children!.set(basename(abs), {
      type: 'dir',
      mode: 0o755,
      owner: cred.user,
      group: cred.groups[0] ?? cred.user,
      mtime: this.clock(),
      children: new Map(),
    });
    this.touchDirty(abs);
    this.bus?.emit('fs.change', { path: abs });
  }

  /** Delete permission: +w on parent; sticky dirs also require ownership. */
  private checkUnlink(abs: string, parent: Inode, node: Inode, cred: Cred): void {
    if (!this.can(parent, cred, 'w')) throw new FsError('EACCES', abs);
    if (parent.mode & 0o1000 && cred.uid !== 0 && node.owner !== cred.user && parent.owner !== cred.user) {
      throw new FsError('EPERM', abs);
    }
  }

  remove(path: string, cred: Cred, opts: { recursive?: boolean; dirOnly?: boolean } = {}): void {
    const abs = normalize(path);
    if (abs === '/') throw new FsError('EPERM', abs);
    const node = this.lookup(abs, cred, false).node;
    const parent = this.lookup(dirname(abs), cred).node;
    this.checkUnlink(abs, parent, node, cred);
    if (node.type === 'dir') {
      if (!opts.recursive && !opts.dirOnly) throw new FsError('EISDIR', abs);
      if (!opts.recursive && node.children!.size) throw new FsError('ENOTEMPTY', abs);
    } else if (opts.dirOnly) {
      throw new FsError('ENOTDIR', abs);
    }
    parent.children!.delete(basename(abs));
    parent.mtime = this.clock();
    this.touchDirty(abs);
    this.bus?.emit('fs.change', { path: abs });
  }

  move(src: string, dst: string, cred: Cred): void {
    const from = normalize(src);
    let to = normalize(dst);
    const node = this.lookup(from, cred, false).node;
    const srcParent = this.lookup(dirname(from), cred).node;
    this.checkUnlink(from, srcParent, node, cred);
    if (this.exists(to, cred) && this.stat(to, cred).type === 'dir') to = normalize(`${to}/${basename(from)}`);
    if (to === from || to.startsWith(from + '/')) throw new FsError('EINVAL', to);
    const dstParent = this.parentFor(to, cred);
    const existing = dstParent.children!.get(basename(to));
    if (existing?.type === 'dir') throw new FsError('EISDIR', to);
    srcParent.children!.delete(basename(from));
    dstParent.children!.set(basename(to), node);
    node.mtime = this.clock();
    this.touchDirty(from);
    this.touchDirty(to, node);
    this.bus?.emit('fs.change', { path: from });
    this.bus?.emit('fs.change', { path: to });
  }

  copy(src: string, dst: string, cred: Cred, opts: { recursive?: boolean } = {}): void {
    const from = normalize(src);
    let to = normalize(dst);
    const st = this.stat(from, cred);
    if (this.exists(to, cred) && this.stat(to, cred).type === 'dir') to = normalize(`${to}/${basename(from)}`);
    if (st.type === 'dir') {
      if (!opts.recursive) throw new FsError('EISDIR', from);
      if (to.startsWith(from + '/')) throw new FsError('EINVAL', to);
      this.mkdir(to, cred, { parents: true });
      for (const child of this.readdir(from, cred, { silent: true })) {
        this.copy(child.path, `${to}/${child.name}`, cred, opts);
      }
      return;
    }
    this.writeFile(to, this.readFile(from, cred), cred, { mode: st.mode });
  }

  chmod(path: string, mode: number, cred: Cred): void {
    const { node, path: real } = this.lookup(path, cred);
    if (cred.uid !== 0 && node.owner !== cred.user) throw new FsError('EPERM', real);
    node.mode = mode & 0o7777;
    this.touchDirty(real);
    this.bus?.emit('fs.change', { path: real });
  }

  chown(path: string, owner: string, group: string, cred: Cred): void {
    const { node, path: real } = this.lookup(path, cred);
    if (cred.uid !== 0) throw new FsError('EPERM', real);
    node.owner = owner;
    node.group = group;
    this.touchDirty(real);
    this.bus?.emit('fs.change', { path: real });
  }

  // ── Save diffs ──────────────────────────────────────────────────────────

  private touchDirty(path: string, node?: Inode): void {
    this.dirty.add(path);
    if (node?.type === 'dir') {
      for (const [name, child] of node.children!) this.touchDirty(`${path}/${name}`, child);
    }
  }

  diff(): VfsDiff {
    const upserts: FsEntry[] = [];
    const deletes: string[] = [];
    for (const path of this.dirty) {
      let node: Inode | undefined;
      try {
        node = this.lookup(path, ROOT, false).node;
      } catch {
        deletes.push(path);
        continue;
      }
      upserts.push({
        path,
        type: node.type,
        mode: node.mode,
        owner: node.owner,
        group: node.group,
        mtime: node.mtime,
        content: node.content,
        target: node.target,
      });
    }
    return { upserts, deletes };
  }

  applyDiff(diff: VfsDiff): void {
    for (const path of [...diff.deletes].sort((a, b) => b.length - a.length)) {
      const parent = this.exists(dirname(path)) ? this.lookup(dirname(path), ROOT).node : undefined;
      parent?.children?.delete(basename(path));
      this.dirty.add(path);
    }
    for (const e of [...diff.upserts].sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
      this.put(e);
      this.dirty.add(e.path);
    }
  }
}
