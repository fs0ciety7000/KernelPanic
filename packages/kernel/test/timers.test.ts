import { describe, expect, it } from 'vitest';
import { Kernel } from '../src/kernel';
import { miniBundle } from './helpers';

const bundle = () =>
  miniBundle({
    // clock 08:00 → job at 08:30
    timers: [
      {
        id: 'job',
        at: '2026-04-17T08:30:00+02:00',
        label: 'JOB-1',
        timedOnly: true,
        unlessFlags: ['aborted'],
        warnings: [
          { before: 20, effects: [{ notify: { title: 'Dans 20', body: '' } }] },
          { before: 10, effects: [{ notify: { title: 'Bientôt', body: '10 min' } }] },
        ],
        effects: [{ flag: 'boom' }, { end: true }],
      },
      { id: 'always', at: '2026-04-17T08:05:00+02:00', effects: [{ flag: 'five' }] },
    ],
    endings: [{ id: 'boom', title: 'BOOM', text: 'x', flags: ['boom'] }],
    outro: { title: 'ok', text: 'ok' },
  });

describe('timers', () => {
  it('only arms timedOnly timers in timed mode', () => {
    const k = new Kernel(bundle());
    k.runtime.advance(60 * 60_000);
    k.runtime.tick();
    expect(k.runtime.state.flags).toContain('five');
    expect(k.runtime.ended).toBe(false);
    expect(k.runtime.upcoming()).toBeNull();
  });

  it('warns, counts down, then fires and ends', () => {
    const k = new Kernel(bundle(), undefined, { timed: true });
    const notes: string[] = [];
    k.bus.on('scenario.notify', (n) => notes.push(n.title));
    expect(k.runtime.upcoming()).toMatchObject({ label: 'JOB-1' });
    k.runtime.advance(11 * 60_000); // 08:11 → the 20-minute warning
    k.runtime.tick();
    k.runtime.advance(10 * 60_000); // jump to 08:21: only the latest warning, once
    k.runtime.tick();
    k.runtime.tick();
    expect(notes).toEqual(['Dans 20', 'Bientôt']);
    k.runtime.advance(5 * 60_000);
    expect(k.runtime.ended).toBe(false);
    k.runtime.advance(5 * 60_000);
    k.runtime.tick();
    expect(k.runtime.ended).toBe(true);
    expect(k.runtime.ending()?.id).toBe('boom');
    expect(k.runtime.score().score).toBe(0); // nothing was done before the job fired
  });

  it('skips stale warnings when the game resumes late', () => {
    const k = new Kernel(bundle(), undefined, { timed: true });
    const notes: string[] = [];
    k.bus.on('scenario.notify', (n) => notes.push(n.title));
    k.runtime.advance(25 * 60_000);
    k.runtime.tick();
    expect(notes).toEqual(['Bientôt']);
  });

  it('is defused by its flag and survives a save', () => {
    const k = new Kernel(bundle(), undefined, { timed: true });
    k.bus.emit('scenario.flag', { id: 'aborted' });
    expect(k.runtime.upcoming()).toBeNull();
    const k2 = new Kernel(bundle(), k.save());
    expect(k2.runtime.state.timed).toBe(true);
    k2.runtime.advance(60 * 60_000);
    k2.runtime.tick();
    expect(k2.runtime.ended).toBe(false);
  });
});
