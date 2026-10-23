// House icon set: 24px grid, 1.5 stroke, round caps — drawn in the spirit of Lucide.
// Each entry is the inner SVG markup (paths only), rendered by Icon.svelte with currentColor.

export const ICONS: Record<string, string> = {
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  'folder-lock': '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><rect x="9.5" y="12.5" width="5" height="4" rx="1"/><path d="M10.5 12.5v-1a1.5 1.5 0 0 1 3 0v1"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.8 7 8.2 6 8.2-6"/>',
  note: '<path d="M6 3.5h8.5L19 8v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-14.5A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M14 3.5V8h5M8.5 12.5h7M8.5 16h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 15.5-4.5-4.5L6 20"/>',
  activity: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  case: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18M11 12.5v2h2v-2"/>',
  file: '<path d="M6.5 3.5h7.5L19 8.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-14.5A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M13.5 3.5v5h5.5"/>',
  'file-code': '<path d="M6.5 3.5h7.5L19 8.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-14.5A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M13.5 3.5v5h5.5M10 12.5l-2 2 2 2M14 12.5l2 2-2 2"/>',
  'file-log': '<path d="M6.5 3.5h7.5L19 8.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-14.5A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M13.5 3.5v5h5.5M8.5 12h7M8.5 15h7M8.5 18h4"/>',
  binary: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 8.5v3M8 14.5v1M11.5 8.5h1v3h-1zM15.5 8.5v3M11.5 14.5h1v1h-1zM15.5 14.5v1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5l2 2M14.5 8.5l1.5 1.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-up': '<path d="m6 14.5 6-6 6 6"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
  'hard-drive': '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5.5 13 8 5h8l2.5 8M7 16.5h.01M10.5 16.5h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M6 12h12"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  'zoom-in': '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/>',
  'zoom-out': '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8.5 11h5"/>',
  maximize: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  inbox: '<path d="M3 13.5 5.5 5h13l2.5 8.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5"/>',
  send: '<path d="m21 3-9.5 9.5M21 3l-6 18-3.5-8.5L3 9z"/>',
  code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/>',
  save: '<path d="M5 3.5h11L20.5 8v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v5h8v-5M7.5 20.5v-6h9v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  'lock-circle': '<circle cx="12" cy="12" r="9"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10 11v-1.2a2 2 0 0 1 4 0V11"/>',
  lightbulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/>',
  power: '<path d="M12 3v8M6.6 6.6a8 8 0 1 0 10.8 0"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0M12 19.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  diamond: '<path d="M12 3 21 12l-9 9-9-9z"/>',
  filter: '<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  source: '<path d="M8.5 7l-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
};

/** File-type icon + accent class for a file name. */
export function fileIcon(name: string, isDir: boolean, locked = false): { icon: string; tone: string } {
  if (isDir) return { icon: locked ? 'folder-lock' : 'folder', tone: 'dir' };
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { icon: 'image', tone: 'image' };
  if (ext === 'eml') return { icon: 'mail', tone: 'mail' };
  if (ext === 'log' || name === 'syslog' || name === 'wtmp') return { icon: 'file-log', tone: 'log' };
  if (['sh', 'py', 'js', 'ts'].includes(ext)) return { icon: 'file-code', tone: 'script' };
  if (['img', 'bin'].includes(ext) || ['lumenctl', 'lumen-agent'].includes(name)) return { icon: 'binary', tone: 'bin' };
  if (['key', 'pem'].includes(ext) || name === 'shadow' || name === 'authorized_keys') return { icon: 'key', tone: 'key' };
  return { icon: 'file', tone: 'text' };
}
