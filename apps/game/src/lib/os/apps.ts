import type { Component } from 'svelte';
import type { WindowState } from './wm.svelte';
import type { ScenarioBundle } from '@kp/kernel';

export interface AppProps {
  win: WindowState;
}

export interface AppManifest {
  id: string;
  title: string;
  icon: string;
  /** Lazy component import — apps are code-split. */
  load: () => Promise<{ default: Component<AppProps> }>;
  opens?: string[];
  singleton?: boolean;
  defaultSize: { w: number; h: number };
  dock?: boolean;
  /** Only installed on machines whose scenario needs it. */
  when?: (bundle: ScenarioBundle) => boolean;
}

export const APPS: AppManifest[] = [
  {
    id: 'files',
    title: 'Fichiers',
    icon: 'folder',
    load: () => import('../apps/files/Files.svelte'),
    defaultSize: { w: 820, h: 520 },
    dock: true,
  },
  {
    id: 'terminal',
    title: 'Terminal',
    icon: 'terminal',
    load: () => import('../apps/terminal/Terminal.svelte'),
    defaultSize: { w: 780, h: 480 },
    dock: true,
  },
  {
    id: 'mail',
    title: 'Mail',
    icon: 'mail',
    load: () => import('../apps/mail/Mail.svelte'),
    opens: ['eml'],
    singleton: true,
    defaultSize: { w: 940, h: 580 },
    dock: true,
  },
  {
    id: 'notes',
    title: 'Notes',
    icon: 'note',
    load: () => import('../apps/notes/Notes.svelte'),
    opens: ['txt', 'md', 'conf', 'cfg', 'ini', 'yaml', 'yml', 'json', 'sh', 'key', 'pem', 'csv', ''],
    defaultSize: { w: 720, h: 520 },
    dock: true,
  },
  {
    id: 'images',
    title: 'Images',
    icon: 'image',
    load: () => import('../apps/images/Images.svelte'),
    opens: ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'],
    defaultSize: { w: 860, h: 600 },
    dock: true,
  },
  {
    id: 'logs',
    title: 'Logs',
    icon: 'activity',
    load: () => import('../apps/logs/Logs.svelte'),
    opens: ['log'],
    defaultSize: { w: 960, h: 560 },
    dock: true,
  },
  {
    id: 'browser',
    title: 'Navigateur',
    icon: 'globe',
    load: () => import('../apps/browser/Browser.svelte'),
    opens: ['html', 'htm'],
    defaultSize: { w: 1000, h: 640 },
    dock: true,
  },
  {
    id: 'chat',
    title: 'Messages',
    icon: 'chat',
    load: () => import('../apps/chat/Chat.svelte'),
    singleton: true,
    defaultSize: { w: 760, h: 540 },
    dock: true,
  },
  {
    id: 'soc',
    title: 'Console SOC',
    icon: 'shield',
    load: () => import('../apps/soc/Soc.svelte'),
    singleton: true,
    defaultSize: { w: 1040, h: 640 },
    dock: true,
    when: (b) => !!b.soc,
  },
  {
    id: 'case',
    title: 'Dossier',
    icon: 'case',
    load: () => import('../apps/case/Case.svelte'),
    singleton: true,
    defaultSize: { w: 560, h: 620 },
    dock: true,
  },
  {
    id: 'settings',
    title: 'Paramètres',
    icon: 'settings',
    load: () => import('../apps/settings/Settings.svelte'),
    singleton: true,
    defaultSize: { w: 720, h: 520 },
  },
  {
    id: 'properties',
    title: 'Propriétés',
    icon: 'info',
    load: () => import('../apps/properties/Properties.svelte'),
    defaultSize: { w: 400, h: 520 },
  },
];

export const appById = (id: string) => APPS.find((a) => a.id === id);

/** Apps installed for this scenario. */
export const appsFor = (bundle: ScenarioBundle | undefined) => APPS.filter((a) => !a.when || (bundle && a.when(bundle)));

/** Picks the app for a path: by extension, /var/log → logs, Maildir → mail, else notes. */
export function appForPath(path: string, isDir: boolean): AppManifest {
  if (isDir) return appById('files')!;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const ext = name.includes('.') && !name.startsWith('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (path.includes('/Maildir/')) return appById('mail')!;
  if (path.startsWith('/var/log/') && !['gz'].includes(ext)) return appById('logs')!;
  return APPS.find((a) => a.opens?.includes(ext) && ext !== '') ?? appById('notes')!;
}
