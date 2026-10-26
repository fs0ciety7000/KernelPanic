import { Kernel } from '../src/kernel';
import { BUNDLE_FORMAT, type ScenarioBundle } from '../src/scenario/types';
import { secretHash } from '../src/util/sha256';
import { stripAnsi } from '../src/shell/ansi';
import type { FsEntry } from '../src/vfs/vfs';

export function miniBundle(extra: Partial<ScenarioBundle> = {}, files: Partial<FsEntry>[] = []): ScenarioBundle {
  const f = (path: string, type: 'file' | 'dir', owner = 'root', mode = type === 'dir' ? 0o755 : 0o644, content?: string): FsEntry =>
    ({ path, type, owner, group: owner, mode, mtime: 0, content });
  return {
    format: BUNDLE_FORMAT,
    id: 'test',
    version: 1,
    title: 'Test',
    difficulty: 'beginner',
    locale: 'fr',
    machine: { hostname: 'box', os: 'TestOS', kernel: '6.0', ip: '10.0.0.2', clock: '2026-04-17T08:00:00+02:00' },
    session: { user: 'alice', cwd: '/home/alice' },
    users: [
      { name: 'root', uid: 0, home: '/root' },
      { name: 'alice', uid: 1000, home: '/home/alice', groups: ['sudo'], passwordHash: secretHash('test', 'hunter2') },
    ],
    fs: [
      f('/root', 'dir', 'root', 0o700),
      f('/root/secret', 'file', 'root', 0o600, 'top secret\n'),
      f('/home', 'dir'),
      f('/home/alice', 'dir', 'alice', 0o750),
      f('/home/alice/notes.txt', 'file', 'alice', 0o644, 'alpha\nbeta\ngamma\nAlpha\n'),
      f('/home/alice/.hidden', 'file', 'alice', 0o644, 'boo\n'),
      f('/tmp', 'dir', 'root', 0o1777),
      ...(files as FsEntry[]),
    ],
    deliveries: {},
    commands: {},
    processes: [],
    network: {},
    objectives: [{ id: 'end', title: 'end', trigger: { event: 'scenario.flag', where: { id: 'never' } }, onComplete: [{ end: true }] }],
    ...extra,
  };
}

/** A kernel + shell whose terminal output is captured; prompts are answered from a queue. */
export function harness(bundle: ScenarioBundle) {
  const kernel = new Kernel(bundle);
  let output = '';
  const answers: string[] = [];
  const sh = kernel.createShell({
    write: (t) => (output += t),
    prompt: async (q) => {
      output += q;
      return answers.shift() ?? null;
    },
  });
  return {
    kernel,
    sh,
    answers,
    async run(line: string) {
      output = '';
      const status = await sh.run(line);
      return { status, out: stripAnsi(output) };
    },
  };
}
