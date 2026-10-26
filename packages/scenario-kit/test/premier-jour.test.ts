// Plays the tutorial scenario 00 end to end through the real kernel, the way a new player would.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Kernel, stripAnsi, parseMail } from '@kp/kernel';
import { compileScenario } from '../src/compile';

const bundle = compileScenario(join(__dirname, '../../../scenarios/00-premier-jour'));
const WELCOME = '/home/recrue/Maildir/new/1775458200.M1P1501.training-01.eml';

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
  const newMails = () => kernel.vfs.readdir('/home/recrue/Maildir/new', kernel.users.cred('root')).length;
  const openMail = (path: string) => {
    const m = parseMail(kernel.vfs.readFile(path, kernel.users.cred('recrue')));
    kernel.bus.emit('mail.open', { path, messageId: m.messageId, subject: m.subject, from: m.from });
  };
  return { kernel, run, answers, done, newMails, openMail };
}

describe('premier-jour bundle', () => {
  it('hashes secrets: no answer or password appears in clear', () => {
    const json = JSON.stringify({ users: bundle.users, answers: bundle.objectives.map((o) => o.answer) });
    for (const secret of ['IronveilLab6', 'Printemps2026!', 'IV-2026-0006', '198.51.100.23', '2026-04-05']) {
      expect(json).not.toContain(secret);
    }
  });

  it('is a beginner tutorial of the advertised shape', () => {
    expect(bundle.difficulty).toBe('beginner');
    expect(bundle.estimatedMinutes).toBe(12);
    expect(bundle.locale).toBe('fr');
    expect(bundle.machine.hostname).toBe('training-01');
    expect(bundle.machine.clock).toContain('+02:00');
    expect(bundle.session.user).toBe('recrue');
    // Final choice + two endings, one of them unconditional.
    expect((bundle.endings ?? []).length).toBe(2);
    expect((bundle.endings ?? []).some((e) => !e.flags?.length && !e.notFlags?.length)).toBe(true);
    expect((bundle.evidence ?? []).length).toBe(4);
  });

  it('applies scenario permissions (root-only key, readable lab log)', () => {
    const k = new Kernel(structuredClone(bundle));
    expect(k.vfs.stat('/etc/ironveil/lab.key').mode).toBe(0o600);
    expect(k.vfs.stat('/var/log/lab/access.log').mode & 0o004).toBeTruthy();
    expect(k.vfs.stat('/home/recrue/.ledgerlite/settings.ini.bak').mode & 0o044).toBeTruthy();
  });

  it('keeps the onboarding gift readable: the welcome mail carries the session password and the ticket header', () => {
    const k = new Kernel(structuredClone(bundle));
    const raw = k.vfs.readFile(WELCOME, k.users.cred('recrue'));
    expect(raw).toContain('X-Ironveil-Ticket: IV-2026-0006');
    expect(raw).toContain('IronveilLab6');
  });
});

describe('premier-jour playthrough', () => {
  it('teaches every app and finishes with the full report', async () => {
    const p = play();
    const { kernel, run } = p;

    // 1. Mail — open Yasmine's welcome message.
    expect(p.newMails()).toBe(1);
    p.openMail(WELCOME);
    expect(p.done()).toContain('bienvenue');

    // 2. Mail headers — the ticket number lives in X-Ironveil-Ticket (and in the onboarding note).
    expect((await run('cat ~/Documents/onboarding.md')).out).toContain('IV-2026-0006');
    expect(kernel.runtime.submit('ticket', 'IV-2026-0006')).toBe(true);
    expect(p.newMails()).toBe(2); // delivery 02

    // 3. Files — the hidden backup the intern "lost".
    expect((await run('ls ~')).out).not.toContain('.ledgerlite');
    expect((await run('ls -a ~')).out).toContain('.ledgerlite');
    const bak = await run('cat ~/.ledgerlite/settings.ini.bak');
    expect(bak.out).toContain('Printemps2026!');
    expect(p.done()).toContain('cache');

    // 4. Terminal + grep — the plaintext password in the live config.
    const grep = await run('grep -i password /opt/ledgerlite/config/settings.ini');
    expect(grep.out).toContain('Printemps2026!');
    expect(kernel.runtime.submit('mot-de-passe', 'Wrong!')).toBe(false);
    expect(kernel.runtime.submit('mot-de-passe', 'Printemps2026!')).toBe(true);

    // 5. Logs — the odd Saturday-night login in the access log.
    const acc = await run('grep ACCEPT /var/log/lab/access.log');
    expect(acc.out).toContain('198.51.100.23');
    expect(kernel.runtime.submit('connexion', '198.51.100.23')).toBe(true);

    // 6. Images — EXIF date of the intern's screenshot.
    const exif = await run('exiftool ~/Pictures/capture-ledgerlite.svg');
    expect(exif.out).toMatch(/2026:04:05/);
    expect(kernel.runtime.submit('capture', '2026-04-05')).toBe(true);

    // 7. sudo — a root-only file becomes readable with the player's OWN password.
    expect((await run('cat /etc/ironveil/lab.key')).out).toContain('Permission denied');
    expect(p.done()).not.toContain('droits-root');
    p.answers.push('IronveilLab6');
    const sudo = await run('sudo cat /etc/ironveil/lab.key');
    expect(sudo.out).toContain('SVZMQUItN0YzQQ==');
    expect(p.done()).toContain('droits-root');
    expect(kernel.vfs.readFile('/var/log/auth.log', { user: 'root', uid: 0, groups: [] })).toMatch(
      /COMMAND=cat \/etc\/ironveil\/lab\.key\n$/,
    );

    // 8. base64 + scripted command — decode the token, then validate with the in-house tool.
    expect((await run('echo SVZMQUItN0YzQQ== | base64 -d')).out).toBe('IVLAB-7F3A');
    expect((await run('trainingctl submit NOPE')).status).toBe(1);
    expect(p.done()).not.toContain('valider');
    const submit = await run('trainingctl submit IVLAB-7F3A');
    expect(submit.out).toContain('Jeton accepté');
    expect(p.done()).toContain('valider');
    expect((await run('trainingctl status')).out).toContain('VALIDÉ');

    // Bonus — strings on the service binary reveals the codename.
    const strings = await run('strings /opt/ledgerlite/bin/ledgerlited');
    expect(strings.out).toContain('IRONLEDGER');
    expect(p.done()).toContain('bonus-codename');

    // Evidence accumulated along the way (Orwell-style case file).
    expect(kernel.runtime.state.evidence).toEqual(
      expect.arrayContaining(['ev-config', 'ev-login', 'ev-capture', 'ev-key']),
    );

    // 9. Final decision — the dramatic option needs the evidence; it ends on the "zèle" ending.
    expect(kernel.runtime.ended).toBe(false);
    expect(kernel.runtime.choose('rapport', 'reunion')).toBe(true);
    expect(kernel.runtime.ended).toBe(true);
    expect(kernel.runtime.state.ending).toBe('zele');
    expect(kernel.runtime.progress()).toEqual({ done: 9, total: 9 });
    expect(kernel.runtime.score().bonus).toBe(150);
    expect(p.newMails()).toBe(8); // welcome + 7 deliveries
  });

  it('offers the sober ending with no prerequisites', async () => {
    const p = play();
    p.openMail(WELCOME);
    // Drive straight to the choice without collecting any evidence.
    p.kernel.runtime.submit('ticket', 'IV-2026-0006');
    p.kernel.bus.emit('fs.read', { path: '/home/recrue/.ledgerlite/settings.ini.bak', user: 'recrue' });
    p.kernel.runtime.submit('mot-de-passe', 'Printemps2026!');
    p.kernel.runtime.submit('connexion', '198.51.100.23');
    p.kernel.runtime.submit('capture', '2026-04-05');
    p.answers.push('IronveilLab6');
    await p.run('sudo id');
    await p.run('trainingctl submit IVLAB-7F3A');
    // The dramatic option is locked without evidence; the sober one is always available.
    const reunion = p.kernel.bundle.objectives.find((o) => o.id === 'rapport')!.choice!.options.find((o) => o.id === 'reunion')!;
    expect(p.kernel.runtime.missingEvidence(reunion).length).toBeGreaterThan(0);
    expect(p.kernel.runtime.choose('rapport', 'reunion')).toBe(false);
    expect(p.kernel.runtime.choose('rapport', 'sobre')).toBe(true);
    expect(p.kernel.runtime.state.ending).toBe('sobre');
  });

  it('locks objectives behind their prerequisites', () => {
    const { kernel } = play();
    expect(kernel.runtime.submit('ticket', 'IV-2026-0006')).toBe(false); // welcome not read yet
    const views = kernel.runtime.objectives();
    expect(views.find((o) => o.id === 'bienvenue')!.status).toBe('available');
    expect(views.find((o) => o.id === 'valider')!.status).toBe('locked');
    expect(views.find((o) => o.id === 'rapport')!.status).toBe('locked');
  });

  it('credits discoveries made before an objective unlocks', async () => {
    const p = play();
    // Read the hidden backup before the "cache" objective is unlocked (needs ticket first).
    await p.run('cat ~/.ledgerlite/settings.ini.bak');
    expect(p.done()).not.toContain('cache');
    p.openMail(WELCOME);
    p.kernel.runtime.submit('ticket', 'IV-2026-0006');
    expect(p.done()).toContain('cache'); // early discovery counts on unlock
  });

  it('survives a save/load cycle', async () => {
    const p = play();
    p.openMail(WELCOME);
    p.kernel.runtime.submit('ticket', 'IV-2026-0006');
    await p.run('echo "mes notes de recrue" > ~/enquete.txt');
    const save = JSON.parse(JSON.stringify(p.kernel.save()));
    const k2 = new Kernel(structuredClone(bundle), save);
    expect(Object.keys(k2.runtime.state.completed)).toEqual(['bienvenue', 'ticket']);
    expect(k2.vfs.readFile('/home/recrue/enquete.txt', k2.users.cred('recrue'))).toBe('mes notes de recrue\n');
    expect(k2.vfs.readdir('/home/recrue/Maildir/new', k2.users.cred('root')).length).toBe(2);
  });
});

describe('premier-jour web and chat', () => {
  it('rewards opening the lab wiki and answering Yasmine', async () => {
    const p = play();
    const k = p.kernel;
    p.openMail(WELCOME);
    for (const b of bundle.web!.bookmarks!) expect(k.fetch(b.url).status).toBe('ok');
    expect(p.done()).toContain('bonus-navigateur');
    expect(k.runtime.submit('ticket', 'IV-2026-0006')).toBe(true);
    expect(k.runtime.state.chat.unread.yasmine).toBe(2);
    expect(k.runtime.chatReply('yasmine', 'thanks')).toBe(true);
    expect(p.done()).toContain('bonus-messagerie');
  });
});
