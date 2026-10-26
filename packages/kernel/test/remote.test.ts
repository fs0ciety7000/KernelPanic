import { describe, expect, it } from 'vitest';
import { harness, miniBundle } from './helpers';
import { Kernel } from '../src/kernel';
import { secretHash } from '../src/util/sha256';
import type { FsEntry } from '../src/vfs/vfs';
import type { HostDef } from '../src/scenario/types';

const f = (path: string, type: 'file' | 'dir', owner = 'root', mode = type === 'dir' ? 0o755 : 0o644, content?: string): FsEntry =>
  ({ path, type, owner, group: owner, mode, mtime: 0, content });

const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIbackupkey alice@box';

const backup: HostDef = {
  id: 'backup',
  machine: { hostname: 'srv-backup', domain: 'corp.local', os: 'TestOS', kernel: '6.1', ip: '10.0.0.50' },
  users: [
    { name: 'root', uid: 0, home: '/root' },
    { name: 'svc', uid: 1001, home: '/home/svc', passwordHash: secretHash('test', 'b4ckup') },
    { name: 'bob', uid: 1002, home: '/home/bob', groups: ['sudo'], passwordHash: secretHash('test', 'bobpw') },
  ],
  fs: [
    f('/root', 'dir', 'root', 0o700),
    f('/home', 'dir'),
    f('/home/svc', 'dir', 'svc', 0o750),
    f('/home/svc/.ssh', 'dir', 'svc', 0o700),
    f('/home/svc/.ssh/authorized_keys', 'file', 'svc', 0o600, PUB + '\n'),
    f('/home/svc/report.txt', 'file', 'svc', 0o644, 'nightly backup OK\n'),
    f('/home/bob', 'dir', 'bob', 0o750),
    f('/var', 'dir'),
    f('/var/log', 'dir'),
    f('/var/log/auth.log', 'file', 'root', 0o640, ''),
    f('/srv', 'dir'),
    f('/srv/dump', 'dir', 'svc'),
    f('/srv/dump/a.sql', 'file', 'svc', 0o644, 'INSERT 1;\n'),
    f('/srv/dump/b.sql', 'file', 'svc', 0o644, 'INSERT 2;\n'),
  ],
  commands: {},
  processes: [{ pid: 1, user: 'root', cmd: '/sbin/init' }],
  network: {},
  aliases: ['backup.corp.local'],
  ssh: { banner: 'Authorized access only.', motd: 'Welcome to srv-backup' },
};

const bundle = () =>
  miniBundle({ hosts: [backup] }, [
    f('/home/alice/.ssh', 'dir', 'alice', 0o700),
    f('/home/alice/.ssh/id_ed25519', 'file', 'alice', 0o600, '-----BEGIN OPENSSH PRIVATE KEY-----\n'),
    f('/home/alice/.ssh/id_ed25519.pub', 'file', 'alice', 0o644, PUB + '\n'),
  ]);

describe('remote hosts', () => {
  it('logs in with a password, runs commands remotely, and comes back on exit', async () => {
    const h = harness(bundle());
    const events: string[] = [];
    h.kernel.bus.on('auth.ssh', (e) => events.push(`${e.user}->${e.target}:${e.method}:${e.ok}`));
    h.answers.push('wrong', 'bobpw');
    const login = await h.run('ssh bob@srv-backup');
    expect(login.status).toBe(0);
    expect(login.out).toContain('Authorized access only.');
    expect(login.out).toContain('Permission denied, please try again.');
    expect(login.out).toContain('Welcome to srv-backup');
    expect(h.sh.promptString()).toContain('bob@srv-backup');
    expect((await h.run('hostname')).out).toBe('srv-backup\n');
    expect((await h.run('cat /srv/dump/a.sql')).out).toBe('INSERT 1;\n');
    expect((await h.run('cat /home/svc/report.txt')).out).toContain('Permission denied');
    expect((await h.run('ls /home/alice')).out).toContain('No such file');
    // sudo uses the remote machine's users
    h.answers.push('bobpw');
    expect((await h.run('sudo cat /var/log/auth.log')).out).toContain('Accepted password for bob from 10.0.0.2');
    const bye = await h.run('exit');
    expect(bye.out).toContain('Connection to srv-backup closed.');
    expect(h.sh.promptString()).toContain('alice@box');
    expect(h.sh.cwd).toBe('/home/alice');
    expect(events).toEqual(['alice->backup:password:true']);
  });

  it('accepts a key listed in authorized_keys, by FQDN, and runs a one-shot command', async () => {
    const h = harness(bundle());
    const r = await h.run('ssh svc@srv-backup.corp.local cat report.txt');
    expect(r.status).toBe(0);
    expect(r.out).toContain('nightly backup OK');
    expect(r.out).not.toContain('password');
    expect(h.sh.kernel.id).toBe('local');
    expect((await h.run('cat ~/.ssh/known_hosts')).out).toContain('srv-backup.corp.local,10.0.0.50');
  });

  it('refuses unknown users and unknown hosts like OpenSSH', async () => {
    const h = harness(bundle());
    h.answers.push('a', 'b', 'c');
    const r = await h.run('ssh mallory@10.0.0.50');
    expect(r.status).toBe(255);
    expect(r.out).toContain('mallory@10.0.0.50: Permission denied (publickey,password).');
    expect((await h.run('ssh nowhere.example')).out).toContain('Could not resolve hostname nowhere.example');
    expect((await h.run('ping -c 1 backup.corp.local')).out).toContain('10.0.0.50');
  });

  it('tags remote events so workstation triggers are not fooled', async () => {
    const h = harness(bundle());
    const reads: Array<string | undefined> = [];
    h.kernel.bus.on('fs.read', (e) => reads.push(e.machine));
    await h.run('ssh svc@srv-backup cat /home/svc/report.txt');
    expect(reads).toContain('backup');
  });

  it('copies files both ways with scp, recursively', async () => {
    const h = harness(bundle());
    const r = await h.run('scp -r svc@srv-backup:/srv/dump ~/');
    expect(r.status).toBe(0);
    expect(r.out).toContain('a.sql');
    expect((await h.run('cat ~/dump/b.sql')).out).toBe('INSERT 2;\n');
    expect((await h.run('scp notes.txt svc@srv-backup:')).status).toBe(0);
    expect(h.kernel.hosts.get('backup')!.vfs.readFile('/home/svc/notes.txt', { user: 'root', uid: 0, groups: ['root'] })).toContain('alpha');
  });

  it('keeps remote changes across a save/load', async () => {
    const h = harness(bundle());
    await h.run('scp notes.txt svc@srv-backup:/tmp-not-there/x');
    await h.run('scp notes.txt svc@srv-backup:copied.txt');
    const save = h.kernel.save();
    const k2 = new Kernel(bundle(), save);
    expect(k2.hosts.get('backup')!.vfs.exists('/home/svc/copied.txt', { user: 'root', uid: 0, groups: ['root'] })).toBe(true);
  });

  it('refuses to open the desktop from a remote session', async () => {
    const h = harness(bundle());
    h.answers.push('bobpw');
    await h.run('ssh bob@srv-backup');
    expect((await h.run('open /etc')).out).toContain('cannot open display');
  });
});
