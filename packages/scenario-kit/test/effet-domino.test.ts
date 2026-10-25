// Plays scenario 04 live: the SOC console, the rollout tool, the clock.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Kernel, stripAnsi, parseMail } from '@kp/kernel';
import { compileScenario } from '../src/compile';

const bundle = compileScenario(join(__dirname, '../../../scenarios/04-effet-domino'));
const MAIL = '/home/astreinte/Maildir/new/1789351980.M410P2310.ws-astreinte.eml';
const SUDO = 'Astr31nte-0914';

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
    await sh.run(line);
    return stripAnsi(out);
  };
  const rt = kernel.runtime;
  /** Moves the game clock to HH:MM and lets the desktop tick. */
  const at = (hhmm: string) => {
    rt.advance(Date.parse(`2026-09-14T${hhmm}:00+02:00`) - kernel.now());
    rt.tick();
  };
  const brief = () => {
    const m = parseMail(kernel.vfs.readFile(MAIL, kernel.users.cred('astreinte')));
    kernel.bus.emit('mail.open', { path: MAIL, messageId: m.messageId, subject: m.subject, from: m.from });
  };
  return { kernel, rt, run, answers, at, brief };
}

describe('effet-domino bundle', () => {
  it('declares a SOC map and keeps secrets hashed', () => {
    expect(bundle.soc?.assets).toHaveLength(6);
    const json = JSON.stringify({ users: bundle.users, hosts: bundle.hosts!.map((h) => h.users), a: bundle.objectives.map((o) => o.answer) });
    for (const s of ['Astr31nte-0914', 'Iv-Nuit-0914', 'refresh_interval']) expect(json).not.toContain(s);
  });
});

describe('effet-domino playthrough', () => {
  it('pause, rollback, the cause, the order: first tram on time', async () => {
    const { rt, run, answers, at, brief } = play();
    brief();
    at('04:16');
    expect(rt.assetState('info')).toBe('infected');
    expect(rt.triage('a-info', 'real')).toBe(true);
    expect(rt.isDone('qualify')).toBe(true);
    at('04:21');
    expect(rt.assetState('billet')).toBe('infected');

    expect(await run('ssh astreinte@srv-deploy')).toContain('rollout 2.1');
    expect(await run('rollout log JOB-0914')).toContain('tdumas');
    expect(await run('rollout diff JOB-0914')).toContain('+refresh_interval_ms: 0');
    answers.push(SUDO);
    expect(await run('sudo rollout pause JOB-0914')).toContain('mis en pause');
    expect(rt.isDone('stop') && rt.isDone('careful')).toBe(true);
    at('04:41');
    expect(rt.assetState('sae')).toBe('ok'); // never reached
    answers.push(SUDO); // the sudo ticket expired while the clock ran
    expect(await run('sudo rollout rollback JOB-0914')).toContain('terminé');
    expect(rt.assetState('info')).toBe('ok');
    expect(rt.assetState('billet')).toBe('ok');
    expect(rt.submit('cause', 'refresh_interval_ms')).toBe(true);
    expect(rt.submit('who', 'tdumas')).toBe(true);
    await run('cat /var/log/rollout/approvals.log');
    answers.push(SUDO);
    expect(await run('sudo cat /var/mail/tdumas')).toContain('sans canary');
    at('05:01');
    expect(rt.state.flags).not.toContain('first-tram-late');
    expect(rt.choose('verdict', 'manager')).toBe(true);
    expect(rt.ending()?.id).toBe('premier-tram');
  });

  it('isolating srv-deploy stops the fall but leaves the network broken at 05:00', async () => {
    const { rt, run, at, brief } = play();
    brief();
    at('04:22');
    expect(rt.isolate('deploy')).toBe(true);
    expect(rt.isDone('stop')).toBe(true);
    expect(await run('ssh astreinte@srv-deploy')).toContain('No route to host');
    at('04:45');
    expect(rt.assetState('nord')).toBe('ok');
    at('05:00');
    expect(rt.state.flags).toContain('first-tram-late');
    expect(rt.socAlerts()[0]!.id).toBe('a-late');
    rt.submit('who', 'tdumas');
    expect(rt.choose('verdict', 'none')).toBe(true);
    expect(rt.ending()?.id).toBe('retard');
  });

  it('doing nothing lets the job reach the SAE; isolating it stops the trams', () => {
    const { rt, at, brief } = play();
    brief();
    at('04:41');
    expect(['info', 'billet', 'nord', 'sud', 'sae'].map((a) => rt.assetState(a))).toEqual(Array(5).fill('infected'));
    expect(rt.state.chat.log.karim!.at(-1)!.text).toContain('SAE');
    rt.isolate('sae');
    rt.submit('who', 'tdumas');
    rt.choose('verdict', 'none');
    expect(rt.ending()?.id).toBe('trams-arret');
  });

  it('blocking the vendor mirror also stops the propagation', () => {
    const { rt, at, brief } = play();
    brief();
    at('04:16');
    expect(rt.socAlerts().some((a) => a.id === 'a-backup')).toBe(true);
    expect(rt.block('198.51.100.40')).toBe(true);
    expect(rt.isDone('stop')).toBe(true);
    at('04:50');
    expect(rt.assetState('billet')).toBe('ok');
  });

  it('blaming the junior is possible with the job log alone', async () => {
    const { rt, run, brief } = play();
    brief();
    await run('ssh astreinte@srv-deploy');
    await run('cat /var/log/rollout/jobs.log');
    rt.submit('who', 'tdumas');
    expect(rt.choose('verdict', 'junior')).toBe(true);
    expect(rt.ending()?.id).toBe('fusible');
  });
});
