// Plays scenario 01 end to end through the real kernel, the way a player would.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Kernel, stripAnsi, parseMail } from '@kp/kernel';
import { compileScenario } from '../src/compile';

const bundle = compileScenario(join(__dirname, '../../../scenarios/01-ghost-shift'));

function play() {
  const kernel = new Kernel(structuredClone(bundle));
  let out = '';
  const answers: string[] = [];
  const sh = kernel.createShell({
    write: (t) => (out += t),
    prompt: async () => answers.shift() ?? null,
  });
  const run = async (line: string) => {
    out = '';
    const status = await sh.run(line);
    return { status, out: stripAnsi(out) };
  };
  const done = () => Object.keys(kernel.runtime.state.completed);
  const openMail = (path: string) => {
    const m = parseMail(kernel.vfs.readFile(path, kernel.users.cred('elias')));
    kernel.bus.emit('mail.open', { path, messageId: m.messageId, subject: m.subject, from: m.from });
  };
  return { kernel, run, answers, done, openMail };
}

describe('ghost-shift bundle', () => {
  it('hashes secrets: no answer or password appears in clear', () => {
    const json = JSON.stringify({ users: bundle.users, answers: bundle.objectives.map((o) => o.answer) });
    for (const secret of ['185.220.101.47', 'drop.k4de.net', 'Pixel2019', 'lumengr1d.com']) {
      expect(json).not.toContain(secret);
    }
  });

  it('applies scenario permissions', () => {
    const k = new Kernel(structuredClone(bundle));
    expect(k.vfs.stat('/etc/lumen/override.key').mode).toBe(0o600);
    expect(k.vfs.stat('/home/elias/.cache/.sync/sync.sh').mode & 0o111).toBeTruthy();
    expect(k.vfs.stat('/tmp').mode).toBe(0o1777);
  });
});

describe('ghost-shift playthrough', () => {
  it('can be completed with the intended path', async () => {
    const p = play();
    const { kernel, run } = p;
    const inbox = '/home/elias/Maildir/new/1776406020.M412P2210.ws-varga.eml';

    // 1. Briefing
    p.openMail(inbox);
    expect(p.done()).toContain('briefing');

    // 2. Phishing domain (mail headers) + 3. attacker IP (auth.log)
    expect((await run('grep -l lumengr1d ~/Maildir/cur/*')).out).toContain('1776357720');
    expect(kernel.runtime.submit('phish', 'lumengrid.fr')).toBe(false);
    expect(kernel.runtime.submit('phish', '  LumenGr1d.com ')).toBe(true);
    const auth = await run('grep Accepted /var/log/auth.log');
    expect(auth.out).toContain('185.220.101.47');
    expect(kernel.runtime.submit('intrusion-ip', '185.220.101.47')).toBe(true);
    expect((await run('ls -1 ~/Maildir/new')).out.split('\n').filter(Boolean)).toHaveLength(2); // delivery 02

    // 4. Persistence
    expect((await run('crontab -l')).out).toContain('.cache/.sync/sync.sh');
    expect((await run('ls ~/.cache')).out).not.toContain('.sync');
    const script = await run('cat ~/.cache/.sync/sync.sh');
    expect(p.done()).toContain('persistence');

    // 5. C2
    const b64 = script.out.match(/E="([^"]+)"/)![1];
    expect((await run(`echo ${b64} | base64 -d`)).out).toBe('https://drop.k4de.net/ingest');
    expect(kernel.runtime.submit('c2', 'drop.k4de.net')).toBe(true);

    // 6. Root — password found in .bash_history / photos
    expect((await run('cat /etc/lumen/override.key')).out).toContain('Permission denied');
    expect((await run('grep -n Pixel ~/.bash_history')).out).toContain('Pixel2019');
    expect((await run('exiftool ~/Pictures/pixel.svg')).out).toContain('2019:03:09');
    p.answers.push('pixel2019', 'Pixel2019');
    const sudo = await run('sudo cat /etc/lumen/override.key');
    expect(sudo.out).toContain('OVERRIDE_TOKEN=OVR-7Q2K-VX91');
    expect(p.done()).toContain('root');
    expect(kernel.vfs.readFile('/var/log/auth.log', { user: 'root', uid: 0, groups: [] })).toMatch(/COMMAND=cat \/etc\/lumen\/override.key\n$/);

    // 7. Abort the job
    expect((await run('lumenctl status')).out).toContain('QUEUED');
    expect((await run('lumenctl abort JOB-0417 --token OVR-7Q2K-VX91')).out).toContain('requires root');
    expect(p.done()).not.toContain('abort');
    expect((await run('sudo lumenctl abort JOB-0417 --token WRONG')).status).toBe(1);
    const abort = await run('sudo lumenctl abort JOB-0417 --token OVR-7Q2K-VX91');
    expect(abort.out).toContain('JOB-0417 aborted');
    expect(p.done()).toContain('abort');
    expect((await run('lumenctl status')).out).toContain('ABORTED');
    expect((await run('grep ABORTED /var/log/lumen/lumenctl.log')).status).toBe(0);

    // Bonus objectives
    await run('cat ~/.ssh/authorized_keys');
    expect((await run('strings /tmp/.fw/lumen-fw-4.2.1-hotfix.img')).out).toContain('kade@ghostshift');
    expect(p.done()).toEqual(expect.arrayContaining(['backdoor-key', 'firmware']));

    // 8. Attribution ends the scenario
    expect(kernel.runtime.ended).toBe(false);
    expect(kernel.runtime.submit('attribution', 'Kade')).toBe(true);
    expect(kernel.runtime.ended).toBe(true);
    expect(kernel.runtime.progress()).toEqual({ done: 8, total: 8 });
    expect(kernel.runtime.score().bonus).toBe(300);
    expect((await run('ls -1 ~/Maildir/new')).out.split('\n').filter(Boolean)).toHaveLength(5);
  });

  it('credits discoveries made before an objective unlocks', async () => {
    const p = play();
    p.openMail('/home/elias/Maildir/new/1776406020.M412P2210.ws-varga.eml');
    await p.run('cat ~/.cache/.sync/sync.sh'); // persistence still locked (needs intrusion-ip)
    expect(p.done()).not.toContain('persistence');
    p.kernel.runtime.submit('intrusion-ip', '185.220.101.47');
    expect(p.done()).toContain('persistence');
  });

  it('locks objectives behind their prerequisites', () => {
    const { kernel } = play();
    expect(kernel.runtime.submit('intrusion-ip', '185.220.101.47')).toBe(false); // briefing not read
    const views = kernel.runtime.objectives();
    expect(views.find((o) => o.id === 'briefing')!.status).toBe('available');
    expect(views.find((o) => o.id === 'abort')!.status).toBe('locked');
  });

  it('survives a save/load cycle', async () => {
    const p = play();
    p.openMail('/home/elias/Maildir/new/1776406020.M412P2210.ws-varga.eml');
    p.kernel.runtime.submit('intrusion-ip', '185.220.101.47');
    await p.run('echo "mes notes" > ~/enquete.txt');
    const save = JSON.parse(JSON.stringify(p.kernel.save()));
    const k2 = new Kernel(structuredClone(bundle), save);
    expect(Object.keys(k2.runtime.state.completed)).toEqual(['briefing', 'intrusion-ip']);
    expect(k2.vfs.readFile('/home/elias/enquete.txt', k2.users.cred('elias'))).toBe('mes notes\n');
    expect(k2.history).toContain('echo "mes notes" > ~/enquete.txt');
    expect(k2.vfs.readdir('/home/elias/Maildir/new', k2.users.cred('root')).length).toBe(2);
  });
});
