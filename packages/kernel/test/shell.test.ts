import { describe, expect, it } from 'vitest';
import { harness, miniBundle } from './helpers';

describe('shell', () => {
  it('runs basic commands with real error messages', async () => {
    const h = harness(miniBundle());
    expect((await h.run('pwd')).out).toBe('/home/alice\n');
    expect((await h.run('cat /root/secret')).out).toBe('cat: /root/secret: Permission denied\n');
    expect((await h.run('nope')).status).toBe(127);
    expect((await h.run('ls')).out).toBe('notes.txt\n');
    expect((await h.run('ls -a')).out).toContain('.hidden');
  });

  it('pipes, redirects and chains', async () => {
    const h = harness(miniBundle());
    expect((await h.run('cat notes.txt | grep -i alpha | wc -l')).out.trim()).toBe('2');
    await h.run('echo hi > out.txt && echo again >> out.txt');
    expect((await h.run('cat out.txt')).out).toBe('hi\nagain\n');
    expect((await h.run('false_cmd 2>/dev/null || echo fallback')).out).toBe('fallback\n');
    expect((await h.run('echo $?')).out).toBe('0\n');
  });

  it('globs against the VFS', async () => {
    const h = harness(miniBundle());
    await h.run('touch a.log b.log');
    expect((await h.run('echo *.log')).out).toBe('a.log b.log\n');
    expect((await h.run('echo "*.log"')).out).toBe('*.log\n');
  });

  it('sudo asks for the password, caches it, and logs events', async () => {
    const h = harness(miniBundle());
    const events: boolean[] = [];
    h.kernel.bus.on('auth.sudo', (e) => events.push(e.ok));
    h.answers.push('wrong', 'hunter2');
    const r = await h.run('sudo cat /root/secret');
    expect(r.out).toContain('Sorry, try again.');
    expect(r.out).toContain('top secret');
    expect((await h.run('sudo whoami')).out).toBe('root\n'); // ticket cached, no prompt
    expect(events).toEqual([true, true]);
    await h.run('sudo -i');
    expect(h.sh.user).toBe('root');
    expect(h.sh.promptString()).toContain('#');
    await h.run('exit');
    expect(h.sh.user).toBe('alice');
  });

  it('decodes base64 and completes paths', async () => {
    const h = harness(miniBundle());
    expect((await h.run("echo 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==' | base64 -d")).out).toBe('https://example.com');
    expect(h.sh.complete('cat no').matches).toEqual(['notes.txt']);
    expect(h.sh.complete('wh').matches).toContain('whoami');
  });

  it('blocks execution of untrusted files', async () => {
    const h = harness(miniBundle());
    await h.run('echo "#!/bin/sh" > run.sh && chmod +x run.sh');
    const r = await h.run('./run.sh');
    expect(r.status).toBe(126);
    expect(r.out).toContain('execution blocked');
  });
});
