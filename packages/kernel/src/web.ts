// Simulated web: scenario pages, resolved through the scenario's own network (DNS, firewall,
// sinkholes). Nothing ever leaves the machine. Results are plain data; the browser app renders
// them in a sandboxed, script-less iframe.

import type { Kernel } from './kernel';
import type { Cred } from './vfs/vfs';
import { FsError } from './vfs/vfs';

export interface ParsedUrl {
  /** Normalized URL shown in the address bar. */
  url: string;
  scheme: 'http' | 'https' | 'file';
  host: string;
  /** Path without trailing slash ("" for the root). */
  path: string;
  query: string;
  /** "host/path" lookup key, "host/" for the root. */
  key: string;
}

export type WebResult =
  | { status: 'ok'; url: string; key: string; title: string; html: string }
  | { status: 'dns' | 'timeout' | 'blocked' | 'notfound' | 'error'; url: string; host: string; title: string; message: string };

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "intranet/wiki" → https://intranet/wiki ; "file:///x" kept ; "a b" → null (search not supported). */
export function parseUrl(input: string): ParsedUrl | null {
  let raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith('/')) raw = `file://${raw}`;
  if (!/^[a-z]+:\/\//i.test(raw)) {
    if (/\s/.test(raw) || !/[.\w-]+(\.[a-z0-9-]+|local)(:\d+)?(\/|$|\?)/i.test(raw)) return null;
    raw = `https://${raw}`;
  }
  const m = raw.match(/^(https?|file):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i);
  if (!m) return null;
  const scheme = m[1]!.toLowerCase() as ParsedUrl['scheme'];
  const host = m[2]!.toLowerCase();
  let path = decodeURIComponent(m[3] ?? '');
  if (scheme !== 'file') path = path.replace(/\/+$/, '').replace(/\/index\.html?$/, '');
  const query = m[4] ?? '';
  const url = scheme === 'file' ? `file://${path}` : `${scheme}://${host}${path || '/'}${query}`;
  return { url, scheme, host, path, query, key: `${host}${path || '/'}` };
}

function minimalPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head><body style="font-family:system-ui,sans-serif;padding:32px;color:#222">${body}</body></html>`;
}

export function fetchPage(kernel: Kernel, input: string, cred: Cred): WebResult {
  const u = parseUrl(input);
  if (!u) {
    return { status: 'dns', url: input, host: input, title: 'Adresse invalide', message: 'Saisissez une adresse comme intranet.exemple.local ou https://exemple.fr. La recherche web n’est pas disponible sur ce poste.' };
  }
  const visit = (r: WebResult) => {
    kernel.bus.emit('web.visit', { url: r.url, host: u.host, path: u.path, title: r.title, status: r.status });
    return r;
  };

  // Local files: the browser can open HTML/text from the disk, with the user's permissions.
  if (u.scheme === 'file') {
    try {
      const content = kernel.vfs.readFile(u.path, cred);
      const html = /<html|<!doctype/i.test(content) ? content : minimalPage(u.path, `<pre>${escape(content)}</pre>`);
      const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? u.path.split('/').pop()!;
      return visit({ status: 'ok', url: u.url, key: u.url, title, html });
    } catch (e) {
      const msg = e instanceof FsError ? e.message : (e as Error).message;
      return visit({ status: 'error', url: u.url, host: 'file', title: 'Fichier inaccessible', message: `${u.path} : ${msg}` });
    }
  }

  const web = kernel.bundle.web;
  const hosts = kernel.bundle.network.hosts ?? {};
  const blocked = web?.blocked?.[u.host];
  if (blocked) return visit({ status: 'blocked', url: u.url, host: u.host, title: 'Site bloqué', message: blocked });

  const pages = web?.pages ?? {};
  const knownHost = u.host in hosts || Object.keys(pages).some((k) => k.startsWith(`${u.host}/`));
  if (!knownHost) {
    return visit({ status: 'dns', url: u.url, host: u.host, title: 'Serveur introuvable', message: `Impossible de résoudre ${u.host} (DNS_PROBE_FINISHED_NXDOMAIN).` });
  }
  if (hosts[u.host]?.reachable === false) {
    return visit({ status: 'timeout', url: u.url, host: u.host, title: 'Délai dépassé', message: `${u.host} ne répond pas (ERR_CONNECTION_TIMED_OUT). Le serveur est peut-être hors ligne, ou filtré par le pare-feu.` });
  }

  const full = `${u.key}${u.query}`;
  for (const route of web?.routes ?? []) {
    if (!new RegExp(route.match).test(full)) continue;
    if (route.emit) kernel.bus.emit('scenario.flag', { id: route.emit });
    const page = route.page ? pages[route.page] : undefined;
    if (page) return visit({ status: 'ok', url: u.url, key: page.key, title: page.title, html: page.html });
    if (route.html) return visit({ status: 'ok', url: u.url, key: u.key, title: route.title ?? u.host, html: route.html });
  }

  const page = pages[u.key];
  if (page) return visit({ status: 'ok', url: u.url, key: page.key, title: page.title, html: page.html });
  if (!u.path && hosts[u.host]?.http) {
    const text = hosts[u.host]!.http!;
    const html = /<html|<!doctype/i.test(text) ? text : minimalPage(u.host, `<p>${escape(text)}</p>`);
    return visit({ status: 'ok', url: u.url, key: u.key, title: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? u.host, html });
  }
  return visit({ status: 'notfound', url: u.url, host: u.host, title: '404 — Page introuvable', message: `Le serveur ${u.host} a répondu : 404 Not Found (${u.path || '/'}).` });
}
