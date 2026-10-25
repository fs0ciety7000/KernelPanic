// Plays scenario 03 end to end across the three machines, the way a player would.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Kernel, stripAnsi, parseMail } from '@kp/kernel';
import { compileScenario } from '../src/compile';

const bundle = compileScenario(join(__dirname, '../../../scenarios/03-double-fond'));
const MISSION = '/home/audit/Maildir/new/1780900860.M310P2240.ws-audit-02.eml';
const SUDO_PW = 'Orb1s-Audit-0608';
const KEY = '/opt/claims/keys/backup_ed25519';

function play() {
  const kernel = new Kernel(structuredClone(bundle));
  let out = '';
  const answers: string[] = [];
  const sh = kernel.createShell({
    write: (t) => (out += t),
    prompt: async (q) => {
      out += q;
      return answers.shift() ?? null;
    },
  });
  const run = async (line: string) => {
    out = '';
    const status = await sh.run(line);
    return { status, out: stripAnsi(out) };
  };
  const rt = kernel.runtime;
  const openMail = (path: string) => {
    const m = parseMail(kernel.vfs.readFile(path, kernel.users.cred('audit')));
    kernel.bus.emit('mail.open', { path, messageId: m.messageId, subject: m.subject, from: m.from });
  };
  const done = () => Object.keys(rt.state.completed);
  /** Briefing → srv-claims → srv-backup, collecting the core evidence. */
  const investigate = async () => {
    openMail(MISSION);
    expect((await run('ssh srv-backup')).out).toContain('Connection timed out'); // not from the workstation
    const claims = await run('ssh audit@srv-claims');
    expect(claims.status).toBe(0);
    expect(claims.out).toContain('LECTURE SEULE');
    expect(rt.submit('official', 'jruiz')).toBe(true);
    await run('cat /var/log/claims/app.log');
    await run('cat /var/log/auth.log');
    // No account on srv-backup… until the service key is used.
    answers.push('x', 'y', 'z');
    expect((await run('ssh srv-backup')).status).toBe(255);
    expect(rt.state.chat.log.yasmine!.at(-1)!.text).toContain('Demande-toi comment');
    expect((await run('cat /etc/cron.d/claims-backup')).out).toContain('nightly-backup.sh');
    expect((await run('cat /opt/claims/scripts/nightly-backup.sh')).out).toContain(KEY);
    const backup = await run(`ssh -i ${KEY} svc-backup@srv-backup`);
    expect(backup.status).toBe(0);
    expect(sh.promptString()).toContain('svc-backup@srv-backup');
    expect(done()).toContain('backup-in');
    return { kernel, rt, run, answers, sh, done, openMail };
  };
  return { kernel, rt, run, answers, sh, done, openMail, investigate };
}

describe('double-fond bundle', () => {
  it('declares two remote hosts and keeps secrets hashed', () => {
    expect(bundle.hosts?.map((h) => h.id)).toEqual(['claims', 'backup']);
    const accounts = JSON.stringify({ users: bundle.users, hosts: bundle.hosts!.map((h) => h.users), answers: bundle.objectives.map((o) => o.answer) });
    for (const secret of ['Orb1s-Audit-0608', 'Iv-Audit-26', 'fmarchal', 'refus', 'volontaire']) expect(accounts).not.toContain(secret === 'fmarchal' ? 'fmarchal"]' : secret);
    // The expert report only exists encrypted.
    expect(JSON.stringify(bundle.hosts)).not.toContain('hydrocarbures');
    expect(bundle.difficulty).toBe('advanced');
    expect(bundle.endings).toHaveLength(4);
  });
});

describe('double-fond playthrough', () => {
  it('uncovers the forgery, the forger and the motive', async () => {
    const p = play();
    const { run, rt, answers } = await p.investigate();

    // Expert report: encrypted zip, password from Julie's convention.
    expect((await run('unzip -l /srv/backups/documents/rapport-expertise-SIN-2026-0412.zip')).out).toContain('rapport-expertise-SIN-2026-0412.txt');
    answers.push('sin20260412');
    expect((await run('cd /tmp && unzip /srv/backups/documents/rapport-expertise-SIN-2026-0412.zip')).out).toContain('inflating');
    expect((await run('cat /tmp/rapport-expertise-SIN-2026-0412.txt')).out).toContain("L'origine volontaire");
    expect(rt.submit('report', 'Volontaire')).toBe(true);

    // The two log backups, compared.
    await run('mkdir /tmp/j3 /tmp/j4');
    await run('tar -xzf /srv/backups/claims/logs-2026-06-03_2000.tgz -C /tmp/j3');
    await run('tar -xzf /srv/backups/claims/logs-2026-06-04_2000.tgz -C /tmp/j4');
    const d = await run('diff /tmp/j3/claims/app.log /tmp/j4/claims/app.log');
    expect(d.out).toContain('< 2026-06-03 14:02:11 INFO  SIN-2026-0412 statut EXPERTISE -> REFUSE par=jruiz');
    expect(d.out).toContain('> 2026-06-03 14:02:11 INFO  SIN-2026-0412 statut EXPERTISE -> APPROUVE par=jruiz');
    expect(rt.submit('original', 'refusé')).toBe(true);
    expect((await run('tar -xzf /srv/backups/claims/claims-db-2026-06-03_0200.tgz -C /tmp/j3 && grep 0412 /tmp/j3/db/claims.csv')).out).toContain('EXPERTISE');
    expect(rt.evidence().map((e) => e.id)).toEqual(expect.arrayContaining(['expert-report', 'original-log', 'db-snapshots']));

    // Back on srv-claims: who did it, when, and why.
    expect((await run('exit')).out).toContain('Connection to srv-backup closed.');
    expect((await run("grep sudo /var/log/auth.log | grep app.log | awk '{print $3, $6}'")).out).toBe('23:44:37 fmarchal\n');
    expect(rt.submit('forger', 'FMarchal')).toBe(true);
    expect(rt.submit('when', '23h44')).toBe(true);
    expect((await run('cat /var/mail/fmarchal')).out).toContain('Permission denied');
    answers.push(SUDO_PW);
    expect((await run('sudo cat /var/mail/fmarchal')).out).toContain('Merci, cousin.');
    expect(p.done()).toContain('motive');
    expect((await run('claimsctl history SIN-2026-0412')).out).toContain('purgée');

    // The player's own sudo is now in srv-claims' auth.log, like any admin's.
    expect((await run('tail -1 /var/log/auth.log')).out).toContain('audit : TTY=pts/0');
    // Nothing on the workstation was touched by remote work.
    expect((await run('exit')).out).toContain('Connection to srv-claims closed.');
    expect(p.kernel.vfs.exists('/tmp/j3')).toBe(false);

    expect(rt.choose('verdict', 'collusion')).toBe(true);
    expect(rt.ending()?.id).toBe('double-fond');
  });

  it('a hasty report blames Julie Ruiz', async () => {
    const p = play();
    const { rt, run, answers } = await p.investigate();
    answers.push('sin20260412');
    await run('cd /tmp && unzip /srv/backups/documents/rapport-expertise-SIN-2026-0412.zip');
    rt.submit('report', 'volontaire');
    const opt = bundle.objectives.find((o) => o.id === 'verdict')!.choice!.options.find((o) => o.id === 'name-marchal')!;
    expect(rt.missingEvidence(opt)).toEqual(['original-log']);
    expect(rt.choose('verdict', 'blame-ruiz')).toBe(true);
    expect(rt.ending()?.id).toBe('mauvaise-signature');
  });

  it('the report can be extracted on the workstation after scp', async () => {
    const p = play();
    const { run, answers } = await p.investigate();
    await run('exit');
    // From srv-claims, pull the archive with the service key, then bring it home.
    expect((await run(`scp -i ${KEY} svc-backup@srv-backup:/srv/backups/documents/rapport-expertise-SIN-2026-0412.zip /tmp/`)).status).toBe(0);
    await run('exit');
    expect((await run('scp audit@srv-claims:/tmp/rapport-expertise-SIN-2026-0412.zip ~/')).status).toBe(0);
    answers.push('sin20260412');
    expect((await run('unzip rapport-expertise-SIN-2026-0412.zip')).status).toBe(0);
    expect(p.rt.evidence().map((e) => e.id)).toContain('expert-report');
  });

  it('remote progress survives a save/load', async () => {
    const p = play();
    const { run, kernel } = await p.investigate();
    await run('mkdir /tmp/keep');
    const k2 = new Kernel(structuredClone(bundle), kernel.save());
    expect(k2.hosts.get('backup')!.vfs.exists('/tmp/keep')).toBe(true);
    expect(k2.runtime.state.completed['backup-in']).toBeDefined();
  });
});

describe('double-fond timed mode', () => {
  const timedPlay = () => {
    const kernel = new Kernel(structuredClone(bundle), undefined, { timed: true });
    let out = '';
    const sh = kernel.createShell({ write: (t) => (out += t), prompt: async () => null });
    const run = async (line: string) => {
      out = '';
      await sh.run(line);
      return stripAnsi(out);
    };
    return { kernel, rt: kernel.runtime, run };
  };
  const at = (rt: Kernel['runtime'], hhmm: string) => {
    const target = Date.parse(`2026-06-08T${hhmm}:00+02:00`);
    rt.advance(target - (Date.parse(bundle.machine.clock) + rt.playtime()));
    rt.tick();
  };

  it('Julie and Yasmine warn, then the log backup disappears and leaves traces', async () => {
    const { rt, kernel } = timedPlay();
    at(rt, '09:31');
    expect(rt.state.chat.log.julie!.at(-1)!.text).toContain('Il avait l');
    at(rt, '09:46');
    expect(rt.state.chat.log.yasmine!.at(-1)!.text).toContain('Mets tes preuves à l');
    at(rt, '09:51');
    const backup = kernel.hosts.get('backup')!;
    expect(backup.vfs.exists('/srv/backups/claims/logs-2026-06-03_2000.tgz')).toBe(false);
    expect(backup.vfs.exists('/srv/backups/claims/logs-2026-06-04_2000.tgz')).toBe(true);
    expect(backup.vfs.readFile('/var/log/backup.log', { user: 'root', uid: 0, groups: [] })).toContain('SUPPRESSION manuelle');
    expect(rt.state.flags).toContain('backup-wiped');
    expect(rt.ended).toBe(false);
    expect(rt.journal().find((j) => j.kind === 'timer')?.text).toContain('effacée');
  });

  it('evidence secured before 09:50 stays usable', async () => {
    const { rt, run, kernel } = timedPlay();
    await run('ssh audit@srv-claims');
    await run('scp -i /opt/claims/keys/backup_ed25519 svc-backup@srv-backup:/srv/backups/claims/logs-2026-06-03_2000.tgz /tmp/');
    at(rt, '09:55');
    expect(kernel.hosts.get('claims')!.vfs.exists('/tmp/logs-2026-06-03_2000.tgz')).toBe(true);
    await run('mkdir /tmp/j && tar -xzf /tmp/logs-2026-06-03_2000.tgz -C /tmp/j');
    expect(await run('grep 14:02 /tmp/j/claims/app.log')).toContain('REFUSE');
    expect(rt.hasEvidence('original-log')).toBe(true);
  });
});

describe('replay journal', () => {
  it('records how each piece was found, the hops, hints and wrong answers', async () => {
    const p = play();
    const { rt } = await p.investigate();
    rt.submit('report', 'accident');
    rt.revealHint('report');
    const j = rt.journal();
    const kinds = j.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['objective', 'evidence', 'ssh', 'wrong', 'hint']));
    expect(j.find((e) => e.kind === 'ssh' && e.text === 'svc-backup@srv-backup')?.detail).toBe('clé SSH');
    expect(j.find((e) => e.text === 'La nuit du 3 juin')?.detail).toBe('srv-claims /var/log/auth.log');
    expect(j.find((e) => e.kind === 'wrong')?.detail).toBe('accident');
    expect(j.every((e, i) => i === 0 || e.at >= j[i - 1]!.at)).toBe(true);
  });
});
