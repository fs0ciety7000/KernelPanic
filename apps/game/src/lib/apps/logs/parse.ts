// Splits classic log formats into columns for the Logs app.

export interface LogLine {
  n: number;
  time: string;
  source: string;
  message: string;
  level: 'error' | 'warn' | 'ok' | 'info';
  raw: string;
}

const SYSLOG = /^([A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2}) (\S+) ([^:]+?):\s?(.*)$/;
const ISO = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*)\s+(\w+)?\s+(.*)$/;

export function classify(text: string): LogLine['level'] {
  if (/\b(fail(ed|ure)?|invalid|error|denied|refused|unsigned|aborted)\b/i.test(text)) return 'error';
  if (/\b(warn(ing)?|sudo|REPLACE|override|bypass)\b/i.test(text)) return 'warn';
  if (/\b(accepted|session opened|ok|done|started)\b/i.test(text)) return 'ok';
  return 'info';
}

export function parseLog(content: string): LogLine[] {
  return content
    .replace(/\n$/, '')
    .split('\n')
    .map((raw, i) => {
      const s = raw.match(SYSLOG);
      if (s) return { n: i + 1, time: s[1]!, source: s[3]!, message: s[4]!, level: classify(`${s[3]} ${s[4]}`), raw };
      const iso = raw.match(ISO);
      if (iso) {
        const t = iso[1]!.replace('T', ' ').replace(/\+\d{2}:\d{2}$/, '');
        return { n: i + 1, time: t, source: iso[2] ?? '', message: iso[3]!, level: classify(raw), raw };
      }
      return { n: i + 1, time: '', source: '', message: raw, level: classify(raw), raw };
    });
}
