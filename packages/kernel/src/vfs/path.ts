// POSIX path helpers (always '/' separated, no platform dependency).

export function normalize(path: string): string {
  const abs = path.startsWith('/');
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
}

export function resolve(cwd: string, path: string, home?: string): string {
  if (home && (path === '~' || path.startsWith('~/'))) path = home + path.slice(1);
  return normalize(path.startsWith('/') ? path : `${cwd}/${path}`);
}

export function dirname(path: string): string {
  const p = normalize(path);
  if (p === '/') return '/';
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

export function basename(path: string): string {
  const p = normalize(path);
  return p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1);
}

export function extname(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}

/** Display path with $HOME collapsed to ~ */
export function tildify(path: string, home: string): string {
  if (path === home) return '~';
  return path.startsWith(home + '/') ? '~' + path.slice(home.length) : path;
}
