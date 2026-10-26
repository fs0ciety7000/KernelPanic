// Minimal RFC 822 parser: enough for headers (incl. folded lines) and a plain-text body.

export interface ParsedMail {
  headers: Array<[string, string]>;
  get(name: string): string | undefined;
  getAll(name: string): string[];
  messageId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

export function parseMail(raw: string): ParsedMail {
  const text = raw.replace(/\r\n/g, '\n');
  const split = text.indexOf('\n\n');
  const head = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? '' : text.slice(split + 2);

  const headers: Array<[string, string]> = [];
  for (const line of head.split('\n')) {
    if (/^[ \t]/.test(line) && headers.length) {
      headers[headers.length - 1]![1] += ' ' + line.trim();
    } else {
      const i = line.indexOf(':');
      if (i > 0) headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  const getAll = (name: string) =>
    headers.filter(([k]) => k.toLowerCase() === name.toLowerCase()).map(([, v]) => v);
  const get = (name: string) => getAll(name)[0];

  return {
    headers,
    get,
    getAll,
    messageId: (get('Message-ID') ?? '').replace(/^<|>$/g, ''),
    subject: get('Subject') ?? '(sans objet)',
    from: get('From') ?? '',
    to: get('To') ?? '',
    date: get('Date') ?? '',
    body,
  };
}

/** "Nadia Kessler <n.kessler@x>" → { name, address } */
export function parseAddress(value: string): { name: string; address: string } {
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1]!.trim() || m[2]!, address: m[2]! };
  return { name: value.trim(), address: value.trim() };
}
