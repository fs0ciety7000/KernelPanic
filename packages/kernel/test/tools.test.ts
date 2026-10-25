import { describe, expect, it } from 'vitest';
import { harness, miniBundle } from './helpers';
import type { FsEntry } from '../src/vfs/vfs';

const file = (path: string, content: string): Partial<FsEntry> => ({ path, type: 'file', owner: 'alice', group: 'alice', mode: 0o644, mtime: 0, content });
const LOG = [
  '10.0.0.5 - GET /index.html 200 512',
  '10.0.0.7 - GET /admin 403 120',
  '10.0.0.5 - POST /login 200 87',
  '203.0.113.9 - GET /backup.zip 200 90412',
].join('\n') + '\n';

const h = () =>
  harness(
    miniBundle({}, [
      file('/home/alice/access.log', LOG),
      file('/home/alice/v1.txt', 'a\nb\nc\nd\n'),
      file('/home/alice/v2.txt', 'a\nB\nc\nd\ne\n'),
      file('/home/alice/ips.txt', '10.0.0.5\n10.0.0.7\n'),
    ]),
  );

describe('shell: substitution and loops', () => {
  it('expands $(…) and backticks, split when unquoted, whole when quoted', async () => {
    const s = h();
    expect((await s.run('echo "host: $(hostname)"')).out).toBe('host: box\n');
    expect((await s.run('echo `whoami`@$(hostname)')).out).toBe('alice@box\n');
    expect((await s.run('wc -l $(echo v1.txt v2.txt)')).out).toContain('9 total');
    expect((await s.run('echo "$(cat ips.txt)"')).out).toBe('10.0.0.5\n10.0.0.7\n');
    expect((await s.run("echo '$(not run)'")).out).toBe('$(not run)\n');
    expect((await s.run('echo $(echo $(echo deep))')).out).toBe('deep\n');
  });

  it('runs one-line for loops', async () => {
    const s = h();
    expect((await s.run('for f in v1.txt v2.txt; do wc -l $f; done')).out).toBe('4 v1.txt\n5 v2.txt\n');
    expect((await s.run('for ip in $(cat ips.txt); do grep -c $ip access.log; done')).out).toBe('2\n1\n');
    expect((await s.run('for i in $(seq 1 3); do echo n$i; done; echo end')).out).toBe('n1\nn2\nn3\nend\n');
    expect((await s.run('while true; do echo x; done')).out).toContain('only one-line loops');
  });
});

describe('tools', () => {
  it('awk: fields, patterns, sums, printf, BEGIN/END', async () => {
    const s = h();
    expect((await s.run("awk '{print $1}' access.log | sort -u")).out).toBe('10.0.0.5\n10.0.0.7\n203.0.113.9\n');
    expect((await s.run("awk '$5 >= 400 {print $1, $4}' access.log")).out).toBe('10.0.0.7 /admin\n');
    expect((await s.run("awk '{s += $NF} END {print s}' access.log")).out).toBe('91131\n');
    expect((await s.run("awk '/zip/ {printf \"%-12s %d\\n\", $1, $6}' access.log")).out).toBe('203.0.113.9  90412\n');
    expect((await s.run("awk -F. 'NR==2 {print $4}' ips.txt")).out).toBe('7\n');
    expect((await s.run("awk '$4 ~ /log/ && $5 == 200' access.log")).out).toBe('10.0.0.5 - POST /login 200 87\n');
    expect((await s.run("awk 'END {print NR}' access.log")).out).toBe('4\n');
  });

  it('sed: substitute, print ranges, delete, in place', async () => {
    const s = h();
    expect((await s.run("sed 's/10\\.0\\.0\\./X./g' ips.txt")).out).toBe('X.5\nX.7\n');
    expect((await s.run("sed -n '2,3p' access.log")).out.split('\n')).toHaveLength(3);
    expect((await s.run("sed '/admin/d' access.log | wc -l")).out.trim()).toBe('3');
    expect((await s.run("sed -E 's/([0-9]+)$/<\\1>/' v1.txt")).out).toBe('a\nb\nc\nd\n');
    await s.run("sed -i 's/b/BEE/' v1.txt");
    expect((await s.run('cat v1.txt')).out).toBe('a\nBEE\nc\nd\n');
  });

  it('diff: normal and unified, exit status', async () => {
    const s = h();
    const r = await s.run('diff v1.txt v2.txt');
    expect(r.status).toBe(1);
    expect(r.out).toBe('2c2\n< b\n---\n> B\n4a5\n> e\n');
    const u = await s.run('diff -u v1.txt v2.txt');
    expect(u.out).toContain('--- v1.txt\n+++ v2.txt\n@@ -1,4 +1,5 @@\n a\n-b\n+B\n c\n d\n+e\n');
    expect((await s.run('diff v1.txt v1.txt')).status).toBe(0);
    expect((await s.run('diff -q v1.txt v2.txt')).out).toBe('Files v1.txt and v2.txt differ\n');
  });

  it('seq, tee, xargs', async () => {
    const s = h();
    expect((await s.run('seq 3')).out).toBe('1\n2\n3\n');
    expect((await s.run('seq 10 -5 0')).out).toBe('10\n5\n0\n');
    expect((await s.run('cat ips.txt | tee copy.txt | wc -l')).out.trim()).toBe('2');
    expect((await s.run('cat copy.txt')).out).toBe('10.0.0.5\n10.0.0.7\n');
    expect((await s.run('cat ips.txt | xargs -I {} grep -c {} access.log')).out).toBe('2\n1\n');
    expect((await s.run('echo v1.txt v2.txt | xargs wc -l')).out).toContain('total');
  });
});

describe('archives', () => {
  it('tar: create, list, extract, gzip auto-detect', async () => {
    const s = h();
    await s.run('mkdir -p proj/sub && echo hi > proj/sub/a.txt && echo yo > proj/b.txt');
    expect((await s.run('tar -czf proj.tgz proj')).status).toBe(0);
    expect((await s.run('file proj.tgz')).out).toContain('gzip compressed data');
    expect((await s.run('tar tzf proj.tgz')).out).toBe('proj/\nproj/b.txt\nproj/sub/\nproj/sub/a.txt\n');
    expect((await s.run('tar -tvf proj.tgz')).out).toContain('proj/sub/a.txt');
    await s.run('mkdir out');
    expect((await s.run('tar -xf proj.tgz -C out')).status).toBe(0);
    expect((await s.run('cat out/proj/sub/a.txt')).out).toBe('hi\n');
    expect((await s.run('tar -xf v1.txt')).out).toContain('does not look like a tar archive');
  });

  it('gzip / gunzip / zcat', async () => {
    const s = h();
    await s.run('gzip v1.txt');
    expect((await s.run('ls')).out).toContain('v1.txt.gz');
    expect((await s.run('zcat v1.txt.gz')).out).toBe('a\nb\nc\nd\n');
    expect((await s.run('cat v1.txt.gz')).out).not.toContain('\nb\n');
    await s.run('gunzip v1.txt.gz');
    expect((await s.run('cat v1.txt')).out).toBe('a\nb\nc\nd\n');
    expect((await s.run('echo hello | gzip | gunzip')).out).toBe('hello\n');
  });

  it('zip with a password: content is not readable without it', async () => {
    const s = h();
    expect((await s.run('zip -r -P s3cret secret.zip ips.txt access.log')).status).toBe(0);
    expect((await s.run('file secret.zip')).out).toContain('Zip archive data, at least v2.0 to extract, encrypted');
    expect((await s.run('strings secret.zip')).out).not.toContain('10.0.0.5');
    expect((await s.run('unzip -l secret.zip')).out).toContain('access.log');
    await s.run('mkdir x');
    s.answers.push('nope');
    const bad = await s.run('unzip secret.zip -d x');
    expect(bad.status).toBe(82);
    expect(bad.out).toContain('incorrect password');
    s.answers.push('s3cret');
    expect((await s.run('unzip secret.zip -d x')).out).toContain('inflating: ips.txt');
    expect((await s.run('cat x/ips.txt')).out).toBe('10.0.0.5\n10.0.0.7\n');
    expect((await s.run('unzip -o -P s3cret secret.zip -d x')).status).toBe(0);
  });
});
