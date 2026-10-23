// ANSI helpers. Colors map to the NOCTIS terminal palette defined in the game's xterm theme.

const wrap = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  italic: wrap('3'),
  underline: wrap('4'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  white: wrap('37'),
  gray: wrap('90'),
};

export const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** Pads accounting for invisible ANSI sequences. */
export function pad(s: string, width: number, right = false): string {
  const n = Math.max(0, width - stripAnsi(s).length);
  return right ? ' '.repeat(n) + s : s + ' '.repeat(n);
}
