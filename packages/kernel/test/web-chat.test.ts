import { describe, expect, it } from 'vitest';
import { harness, miniBundle } from './helpers';
import { parseUrl } from '../src/web';

const page = (key: string, title: string) => ({ key, title, html: `<html><title>${title}</title><a href="/x">x</a></html>` });

const bundle = () =>
  miniBundle({
    network: {
      hosts: {
        'intra.local': { ip: '10.0.0.5' },
        'down.example': { ip: '203.0.113.9', reachable: false },
        'legacy.local': { ip: '10.0.0.6', http: 'Legacy server — use the intranet' },
      },
    },
    web: {
      home: 'intra.local',
      pages: { 'intra.local/': page('intra.local/', 'Accueil'), 'intra.local/wiki/vpn': page('intra.local/wiki/vpn', 'VPN') },
      routes: [{ match: '^intra\\.local/search\\?q=.*vpn', page: 'intra.local/wiki/vpn', emit: 'searched-vpn' }],
      blocked: { 'phish.example': 'Hameçonnage — bloqué par le SOC' },
    },
    chat: {
      contacts: [{ id: 'bob', name: 'Bob' }],
      history: { bob: [{ from: 'bob', text: 'salut', at: '2026-04-16T10:00:00+02:00' }] },
      nodes: [
        {
          id: 'hello',
          contact: 'bob',
          trigger: { event: 'web.visit', where: { host: 'intra.local' } },
          messages: ['Tu as vu le wiki ?'],
          replies: [
            { id: 'yes', text: 'Oui', next: 'more', flags: ['talked'] },
            { id: 'proof', text: 'Regarde ça', requiresEvidence: ['nope'] },
          ],
        },
        { id: 'more', contact: 'bob', messages: ['Parfait.'] },
      ],
    },
  });

describe('web', () => {
  it('parses addresses like a browser bar', () => {
    expect(parseUrl('intra.local/wiki/vpn/')?.key).toBe('intra.local/wiki/vpn');
    expect(parseUrl('https://intra.local/')?.key).toBe('intra.local/');
    expect(parseUrl('/home/alice/notes.txt')?.scheme).toBe('file');
    expect(parseUrl('how to hack')).toBeNull();
  });

  it('serves pages, routes, errors and local files', async () => {
    const h = harness(bundle());
    const k = h.kernel;
    const visits: string[] = [];
    k.bus.on('web.visit', (v) => visits.push(v.status));
    expect(k.fetch('intra.local')).toMatchObject({ status: 'ok', title: 'Accueil' });
    expect(k.fetch('intra.local/search?q=vpn+config')).toMatchObject({ status: 'ok', title: 'VPN' });
    expect(k.runtime.state.flags).toContain('searched-vpn');
    expect(k.fetch('intra.local/nope').status).toBe('notfound');
    expect(k.fetch('unknown.example').status).toBe('dns');
    expect(k.fetch('down.example').status).toBe('timeout');
    expect(k.fetch('phish.example')).toMatchObject({ status: 'blocked', message: expect.stringContaining('SOC') });
    expect(k.fetch('legacy.local')).toMatchObject({ status: 'ok' });
    expect(k.fetch('file:///home/alice/notes.txt').status).toBe('ok');
    expect(k.fetch('/root/secret')).toMatchObject({ status: 'error', message: expect.stringContaining('Permission denied') });
    expect(visits).toHaveLength(9);
  });
});

describe('chat', () => {
  it('seeds history, fires nodes on triggers, gates replies and chains', () => {
    const h = harness(bundle());
    const rt = h.kernel.runtime;
    expect(rt.state.chat.log.bob).toHaveLength(1);
    h.kernel.fetch('intra.local');
    expect(rt.state.chat.log.bob!.at(-1)!.text).toBe('Tu as vu le wiki ?');
    expect(rt.state.chat.unread.bob).toBe(1);
    const replies = rt.chatReplies('bob');
    expect(replies.find((r) => r.id === 'proof')!.missing).toEqual(['nope']);
    expect(rt.chatReply('bob', 'proof')).toBe(false);
    expect(rt.chatReply('bob', 'yes')).toBe(true);
    expect(rt.state.chat.log.bob!.map((l) => l.from)).toEqual(['bob', 'bob', 'me', 'bob']);
    expect(rt.state.flags).toContain('talked');
    expect(rt.chatReplies('bob')).toEqual([]);
    h.kernel.fetch('intra.local'); // nodes fire once
    expect(rt.state.chat.log.bob).toHaveLength(4);
  });
});
