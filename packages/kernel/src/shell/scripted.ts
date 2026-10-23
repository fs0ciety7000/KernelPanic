// Declarative, scenario-defined commands (see SCENARIO_ENGINE.md §4). No code in content.

import type { ScriptedCommand } from '../scenario/types';
import type { CommandDef } from './shell';

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\\e\[/g, '\x1b[')
    .replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

export function makeScripted(name: string, def: ScriptedCommand): CommandDef {
  return {
    name,
    summary: def.summary ?? '',
    run(ctx) {
      const { kernel, cred } = ctx;
      if (def.group && cred.uid !== 0 && !cred.groups.includes(def.group)) {
        ctx.err(`${name}: permission denied (requires group '${def.group}')\n`);
        return 126;
      }
      const vars = {
        user: cred.user,
        hostname: kernel.machine.hostname,
        date: kernel.time.dateCmd(kernel.now()),
        cwd: ctx.sh.cwd,
      };
      const line = ctx.argv.join(' ');
      const flags = kernel.runtime?.state.flags ?? [];
      for (const rule of def.rules) {
        if (rule.ifFlag && !flags.includes(rule.ifFlag)) continue;
        if (rule.unlessFlag && flags.includes(rule.unlessFlag)) continue;
        if (!new RegExp(rule.match).test(line)) continue;
        if (rule.requireRoot && cred.uid !== 0) {
          ctx.err(`${name}: this operation requires root privileges\n`);
          return 1;
        }
        if (rule.output) {
          const text = renderTemplate(rule.output, vars);
          (rule.exit ? ctx.err : ctx.out)(text.endsWith('\n') ? text : text + '\n');
        }
        for (const w of rule.write ? [rule.write].flat() : []) {
          // Paths may use {{cwd}}/{{user}} so tools can extract next to the player.
          kernel.systemWrite(ctx.resolve(renderTemplate(w.path, vars)), w.content, w.mode, w.owner ? renderTemplate(w.owner, vars) : undefined);
        }
        if (rule.emit) {
          const already = flags.includes(rule.emit);
          if (!rule.once || !already) kernel.bus.emit('scenario.flag', { id: rule.emit });
        }
        return rule.exit ?? 0;
      }
      if (def.fallback) ctx.err(renderTemplate(def.fallback, vars).replace(/\n?$/, '\n'));
      return 2;
    },
  };
}
