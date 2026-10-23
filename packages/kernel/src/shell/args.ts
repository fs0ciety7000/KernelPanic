// Tiny getopt: combined short flags (-la), short values (-n 5 / -n5), long flags (--all, --name=x).

export interface ParsedArgs {
  flags: Set<string>;
  values: Record<string, string>;
  rest: string[];
}

export class ArgError extends Error {}

/**
 * @param bools  short flag letters that take no value, e.g. 'alh'
 * @param withValue short flag letters that take a value, e.g. 'n'
 * @param longs  map of long names → short letter (or same name)
 */
export function getopt(argv: string[], bools: string, withValue = '', longs: Record<string, string> = {}): ParsedArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--') && a.length > 2) {
      const [name, val] = a.slice(2).split(/=(.*)/s) as [string, string | undefined];
      const key = longs[name];
      if (!key) throw new ArgError(`unrecognized option '--${name}'`);
      if (withValue.includes(key) && key.length === 1) {
        values[key] = val ?? argv[++i] ?? '';
      } else flags.add(key);
      continue;
    }
    if (a.startsWith('-') && a.length > 1 && !(/^-\d+$/.test(a) && !bools.includes(a[1]!))) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j]!;
        if (withValue.includes(ch)) {
          values[ch] = a.slice(j + 1) || argv[++i] || '';
          break;
        }
        if (!bools.includes(ch)) throw new ArgError(`invalid option -- '${ch}'`);
        flags.add(ch);
      }
      continue;
    }
    rest.push(a);
  }
  return { flags, values, rest };
}
