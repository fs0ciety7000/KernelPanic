import { describe, expect, it } from 'vitest';
import { Vfs, FsError, ROOT, modeString } from '../src/vfs/vfs';
import { normalize, resolve } from '../src/vfs/path';

const alice = { user: 'alice', uid: 1000, groups: ['alice'] };
const bob = { user: 'bob', uid: 1001, groups: ['bob'] };

function make() {
  const vfs = new Vfs();
  vfs.mount([
    { path: '/home/alice', type: 'dir', mode: 0o750, owner: 'alice', group: 'alice', mtime: 0 },
    { path: '/home/alice/a.txt', type: 'file', mode: 0o644, owner: 'alice', group: 'alice', mtime: 0, content: 'A' },
    { path: '/etc/secret', type: 'file', mode: 0o600, owner: 'root', group: 'root', mtime: 0, content: 'S' },
    { path: '/tmp', type: 'dir', mode: 0o1777, owner: 'root', group: 'root', mtime: 0 },
  ]);
  return vfs;
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as FsError).code;
  }
  return 'OK';
};

describe('paths', () => {
  it('normalizes', () => {
    expect(normalize('/a/./b/../c//d/')).toBe('/a/c/d');
    expect(resolve('/home/x', '../y', '/home/x')).toBe('/home/y');
    expect(resolve('/', '~/z', '/home/x')).toBe('/home/x/z');
  });
});

describe('vfs permissions', () => {
  it('enforces read bits and traversal', () => {
    const vfs = make();
    expect(vfs.readFile('/home/alice/a.txt', alice)).toBe('A');
    expect(code(() => vfs.readFile('/home/alice/a.txt', bob))).toBe('EACCES'); // /home/alice is 0750
    expect(code(() => vfs.readFile('/etc/secret', alice))).toBe('EACCES');
    expect(vfs.readFile('/etc/secret', ROOT)).toBe('S');
  });
  it('requires write on parent to create, honours sticky /tmp', () => {
    const vfs = make();
    expect(code(() => vfs.writeFile('/etc/new', 'x', alice))).toBe('EACCES');
    vfs.writeFile('/tmp/mine', 'x', alice);
    expect(code(() => vfs.remove('/tmp/mine', bob))).toBe('EPERM');
    vfs.remove('/tmp/mine', alice);
    expect(vfs.exists('/tmp/mine')).toBe(false);
  });
  it('only owner or root may chmod', () => {
    const vfs = make();
    expect(code(() => vfs.chmod('/home/alice/a.txt', 0o777, bob))).toBe('EACCES');
    vfs.chmod('/home/alice/a.txt', 0o600, alice);
    expect(modeString('file', vfs.stat('/home/alice/a.txt').mode)).toBe('-rw-------');
    expect(modeString('dir', 0o1777)).toBe('drwxrwxrwt');
  });
  it('round-trips mutations through a save diff', () => {
    const vfs = make();
    vfs.writeFile('/home/alice/b.txt', 'B', alice);
    vfs.move('/home/alice/a.txt', '/tmp/a.txt', alice);
    vfs.chmod('/tmp/a.txt', 0o600, alice);
    const diff = JSON.parse(JSON.stringify(vfs.diff()));
    const fresh = make();
    fresh.applyDiff(diff);
    expect(fresh.readFile('/home/alice/b.txt', alice)).toBe('B');
    expect(fresh.exists('/home/alice/a.txt')).toBe(false);
    expect(fresh.stat('/tmp/a.txt').mode).toBe(0o600);
  });
});
