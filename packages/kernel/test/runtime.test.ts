import { describe, expect, it } from 'vitest';
import { harness, miniBundle } from './helpers';

const bundle = () =>
  miniBundle({
    evidence: [
      { id: 'notes', title: 'Notes', summary: 'alpha beta', source: '/home/alice/notes.txt', trigger: { event: 'fs.read', where: { path: '/home/alice/notes.txt' } } },
      { id: 'secret', title: 'Secret', summary: 'root only', trigger: { event: 'fs.read', where: { path: '/root/secret' } } },
    ],
    objectives: [
      {
        id: 'verdict',
        title: 'Verdict',
        choice: {
          prompt: 'Que faire ?',
          options: [
            { id: 'quiet', label: 'Se taire' },
            { id: 'expose', label: 'Révéler', requiresEvidence: ['notes', 'secret'], flags: ['exposed'] },
          ],
        },
        onComplete: [{ end: true }],
      },
    ],
    endings: [
      { id: 'hero', title: 'Lanceur d’alerte', text: '…', flags: ['exposed'] },
      { id: 'silence', title: 'Silence', text: '…' },
    ],
  });

describe('evidence, choices and endings', () => {
  it('collects evidence from observed actions, once', async () => {
    const h = harness(bundle());
    const found: string[] = [];
    h.kernel.bus.on('evidence.found', (e) => found.push(e.id));
    await h.run('cat notes.txt');
    await h.run('cat notes.txt');
    expect(found).toEqual(['notes']);
    expect(h.kernel.runtime.evidence().map((e) => e.id)).toEqual(['notes']);
  });

  it('locks options until their evidence is found, then selects the matching ending', async () => {
    const h = harness(bundle());
    const rt = h.kernel.runtime;
    await h.run('cat notes.txt');
    expect(rt.choose('verdict', 'expose')).toBe(false);
    h.answers.push('hunter2');
    await h.run('sudo cat /root/secret');
    expect(rt.missingEvidence(bundle().objectives[0]!.choice!.options[1]!)).toEqual([]);
    expect(rt.choose('verdict', 'expose')).toBe(true);
    expect(rt.ended).toBe(true);
    expect(rt.state.ending).toBe('hero');
    expect(rt.state.flags).toContain('choice:verdict:expose');
    expect(rt.choose('verdict', 'quiet')).toBe(false); // decisions are final
  });

  it('falls back to the unconditional ending', () => {
    const h = harness(bundle());
    expect(h.kernel.runtime.choose('verdict', 'quiet')).toBe(true);
    expect(h.kernel.runtime.ending()?.id).toBe('silence');
  });
});
