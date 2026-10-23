// Plays scenario 02 through the real kernel and checks that each decision leads to its ending.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Kernel, stripAnsi, parseMail } from '@kp/kernel';
import { compileScenario } from '../src/compile';

const bundle = compileScenario(join(__dirname, '../../../scenarios/02-canary'));
const MISSION = '/home/audit/Maildir/new/1778657520.M100P2210.lab-qa-03.eml';
const PASSWORD = 'Aud1t-QA-0513';

function play() {
  const kernel = new Kernel(structuredClone(bundle));
  let out = '';
  const answers: string[] = [];
  const sh = kernel.createShell({ write: (t) => (out += t), prompt: async () => answers.shift() ?? null });
  const run = async (line: string) => {
    out = '';
    const status = await sh.run(line);
    return { status, out: stripAnsi(out) };
  };
  const openMail = (path: string) => {
    const m = parseMail(kernel.vfs.readFile(path, kernel.users.cred('audit')));
    kernel.bus.emit('mail.open', { path, messageId: m.messageId, subject: m.subject, from: m.from });
  };
  const rt = kernel.runtime;
  /** Common path up to the decision. */
  const investigate = async () => {
    openMail(MISSION);
    expect((await run('ls /home/mlefort')).out).toContain('Permission denied');
    answers.push(PASSWORD);
    const cups = await run('sudo cat /var/log/cups/page_log');
    expect(cups.out).toContain('mlefort 412');
    expect(rt.submit('document', 'STA_PFAS_T1_ORIGINAL.pdf')).toBe(true);
    const max = await run('sudo sort -t, -k4 -n /srv/lims/exports/STA_PFAS_T1_ORIGINAL.csv | tail -1');
    expect(max.out).toContain('0.31');
    expect(rt.submit('max-value', '0,31')).toBe(true);
    expect((await run('accesslog --date 2026-05-06')).out).toContain('LEFORT Margaux');
    await run('sudo cat /var/log/auth.log');
  };
  return { kernel, rt, run, answers, openMail, investigate };
}

describe('canary bundle', () => {
  it('keeps answers and passwords hashed', () => {
    const json = JSON.stringify({ users: bundle.users, answers: bundle.objectives.map((o) => o.answer) });
    for (const secret of [PASSWORD, 'STA_PFAS_T1_ORIGINAL', '0.31']) expect(json).not.toContain(secret);
  });
  it('declares 4 endings and 8 pieces of evidence', () => {
    expect(bundle.endings).toHaveLength(4);
    expect(bundle.evidence).toHaveLength(8);
  });
});

describe('canary playthrough', () => {
  it('reaches the decision with evidence collected along the way', async () => {
    const p = play();
    await p.investigate();
    expect(Object.keys(p.rt.state.completed)).toEqual(expect.arrayContaining(['briefing', 'root', 'document', 'max-value', 'night']));
    expect(p.rt.state.evidence).toEqual(expect.arrayContaining(['print-log', 'original-results', 'sessions']));
    expect(p.kernel.vfs.readdir('/home/audit/Maildir/new', p.kernel.users.cred('audit')).length).toBe(3); // mission + relance + canary
    const verdict = p.rt.objectives().find((o) => o.id === 'verdict')!;
    expect(verdict.status).toBe('available');
    const regulator = verdict.choice!.options.find((o) => o.id === 'regulator')!;
    expect(p.rt.missingEvidence(regulator)).toEqual(['order-mail']);
    expect(p.rt.choose('verdict', 'regulator')).toBe(false);
  });

  it('naming the source leads to "le prix du silence"', async () => {
    const p = play();
    await p.investigate();
    expect(p.rt.choose('verdict', 'name-margaux')).toBe(true);
    expect(p.rt.state.ending).toBe('price-of-silence');
  });

  it('blowing the whistle needs the order mail, then leads to "en pleine lumière"', async () => {
    const p = play();
    await p.investigate();
    const found = await p.run('sudo grep -rl Ferrand /home/srahmani/Maildir');
    expect(found.out).toContain('1775115600.M201P1300');
    await p.run('sudo cat /home/srahmani/Maildir/cur/1775115600.M201P1300.lab-qa-03.eml');
    await p.run('sudo ls -la /home/mlefort');
    await p.run('sudo cat /home/mlefort/.notes/.journal.md');
    expect(p.rt.isDone('motive') && p.rt.isDone('why')).toBe(true);
    expect(p.rt.choose('verdict', 'regulator')).toBe(true);
    expect(p.rt.state.ending).toBe('sunlight');
    expect(p.rt.score().bonus).toBe(300);
    const mails = p.kernel.vfs.readdir('/home/audit/Maildir/new', p.kernel.users.cred('audit')).map((e) => e.name);
    expect(mails.some((n) => n.includes('04-fin-ars'))).toBe(true);
  });

  it('accusing Samir requires the USB evidence and leads to the wrong-person ending', async () => {
    const p = play();
    await p.investigate();
    expect(p.rt.choose('verdict', 'accuse-samir')).toBe(false);
    await p.run('sudo cat /home/srahmani/.bash_history');
    expect(p.rt.choose('verdict', 'accuse-samir')).toBe(true);
    expect(p.rt.state.ending).toBe('scapegoat');
  });

  it('an inconclusive report is always possible', async () => {
    const p = play();
    await p.investigate();
    expect(p.rt.choose('verdict', 'inconclusive')).toBe(true);
    expect(p.rt.state.ending).toBe('fog');
  });
});
