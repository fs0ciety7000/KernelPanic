import { describe, expect, it } from 'vitest';
import { Kernel } from '../src/kernel';
import { harness, miniBundle } from './helpers';
import type { HostDef } from '../src/scenario/types';

const srv: HostDef = {
  id: 'srv',
  machine: { hostname: 'srv-a', os: 'TestOS', kernel: '6', ip: '10.0.0.9' },
  users: [{ name: 'root', uid: 0, home: '/root' }],
  fs: [{ path: '/root', type: 'dir', owner: 'root', group: 'root', mode: 0o700, mtime: 0 }],
  commands: {},
  processes: [],
  network: {},
};

const bundle = () =>
  miniBundle({
    hosts: [srv],
    soc: {
      assets: [
        { id: 'pc1', name: 'PC-1', ip: '10.0.0.11', role: 'poste' },
        { id: 'pc2', name: 'PC-2', ip: '10.0.0.12', role: 'poste' },
        { id: 'srv', name: 'SRV-A', ip: '10.0.0.9', role: 'serveur', host: 'srv' },
      ],
      alerts: [
        { id: 'a1', severity: 'high', title: 'Activité suspecte sur PC-1', asset: 'pc1', detail: 'x', trigger: { event: 'scenario.flag', where: { id: 'go' } } },
        { id: 'a2', severity: 'critical', title: 'PC-2 compromis', asset: 'pc2', detail: 'y' },
      ],
    },
    timers: [
      // pc1 → pc2 at 08:10 unless pc1 or pc2 was isolated, or the control address blocked
      {
        id: 'spread',
        at: '2026-04-17T08:10:00+02:00',
        ifFlags: ['infected:pc1'],
        unlessFlags: ['isolated:pc1', 'isolated:pc2', 'blocked:203.0.113.66'],
        effects: [{ flag: 'infected:pc2' }, { alert: 'a2' }],
      },
      { id: 'seed', at: '2026-04-17T08:01:00+02:00', effects: [{ flag: 'infected:pc1' }] },
    ],
  });

describe('SOC console', () => {
  it('raises alerts from triggers and effects, newest first, with unseen count', () => {
    const k = new Kernel(bundle());
    const rt = k.runtime;
    k.bus.emit('scenario.flag', { id: 'go' });
    expect(rt.socAlerts().map((a) => a.id)).toEqual(['a1']);
    expect(rt.socUnseen()).toBe(1);
    rt.markAlertsSeen();
    expect(rt.socUnseen()).toBe(0);
    rt.advance(10 * 60_000);
    rt.tick();
    expect(rt.assetState('pc2')).toBe('infected');
    expect(rt.socAlerts()[0]!.id).toBe('a2');
  });

  it('isolation stops a chained propagation, and is final', () => {
    const rt = new Kernel(bundle()).runtime;
    rt.advance(2 * 60_000);
    rt.tick();
    expect(rt.assetState('pc1')).toBe('infected');
    expect(rt.isolate('pc1')).toBe(true);
    expect(rt.isolate('pc1')).toBe(false);
    expect(rt.assetState('pc1')).toBe('isolated');
    rt.advance(10 * 60_000);
    rt.tick();
    expect(rt.assetState('pc2')).toBe('ok');
    expect(rt.journal().some((j) => j.kind === 'action' && j.text.includes('PC-1'))).toBe(true);
  });

  it('blocking an address defuses timers that depend on it; bad input is refused', () => {
    const rt = new Kernel(bundle()).runtime;
    expect(rt.block('999.1.1.1')).toBe(false);
    expect(rt.block('not an ip')).toBe(false);
    expect(rt.block(' 203.0.113.66 ')).toBe(true);
    expect(rt.blocked()).toEqual(['203.0.113.66']);
    rt.advance(12 * 60_000);
    rt.tick();
    expect(rt.assetState('pc2')).toBe('ok');
  });

  it('triage is final and raises a flag', () => {
    const k = new Kernel(bundle());
    k.bus.emit('scenario.flag', { id: 'go' });
    expect(k.runtime.triage('a1', 'false')).toBe(true);
    expect(k.runtime.triage('a1', 'real')).toBe(false);
    expect(k.runtime.state.flags).toContain('triage:a1:false');
    expect(k.runtime.triage('a2', 'real')).toBe(false); // not raised yet
  });

  it('an isolated machine no longer answers ssh', async () => {
    const h = harness(bundle());
    h.kernel.runtime.isolate('srv');
    expect((await h.run('ssh root@srv-a')).out).toContain('No route to host');
  });

  it('SOC state survives a save', () => {
    const k = new Kernel(bundle());
    k.bus.emit('scenario.flag', { id: 'go' });
    k.runtime.triage('a1', 'real');
    k.runtime.isolate('pc2');
    const k2 = new Kernel(bundle(), k.save());
    expect(k2.runtime.socAlerts()[0]!.verdict).toBe('real');
    expect(k2.runtime.assetState('pc2')).toBe('isolated');
  });
});
