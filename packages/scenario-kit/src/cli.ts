#!/usr/bin/env -S npx tsx
// kp-scenario validate <scenariosDir>
// kp-scenario build <scenariosDir> <outDir>

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileScenario, findScenarios, indexEntry, ScenarioError } from './compile';

const [cmd, src, out] = process.argv.slice(2);

if (!cmd || !src || (cmd === 'build' && !out) || !['build', 'validate'].includes(cmd)) {
  console.error('usage: kp-scenario validate <scenariosDir>\n       kp-scenario build <scenariosDir> <outDir>');
  process.exit(2);
}

const dirs = findScenarios(resolve(src));
if (!dirs.length) {
  console.error(`no scenarios found in ${src}`);
  process.exit(1);
}

let failed = false;
const index = [];
for (const dir of dirs) {
  try {
    const bundle = compileScenario(dir);
    index.push(indexEntry(bundle));
    const size = JSON.stringify(bundle).length;
    console.log(`✓ ${bundle.id}  (${bundle.fs.length} fs entries, ${bundle.objectives.length} objectives, ${(size / 1024).toFixed(1)} KiB)`);
    if (cmd === 'build') {
      mkdirSync(resolve(out!), { recursive: true });
      writeFileSync(join(resolve(out!), `${bundle.id}.json`), JSON.stringify(bundle));
    }
  } catch (e) {
    failed = true;
    if (e instanceof ScenarioError) for (const p of e.problems) console.error(`✗ ${p}`);
    else console.error(`✗ ${dir}: ${(e as Error).message}`);
  }
}
if (cmd === 'build' && !failed) writeFileSync(join(resolve(out!), 'index.json'), JSON.stringify(index, null, 2));
process.exit(failed ? 1 : 0);
