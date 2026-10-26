// Archive files (tar, gzip, zip) as they live in the VFS: a recognisable magic header followed by a
// base64 payload. `file`, `strings` and `xxd` see something archive-like; only tar/gzip/unzip read them.
// Encrypted zips are really encrypted (XOR with a SHA-256 keystream): the content is not in the file in clear.
import { decodeBytes, encodeBytes } from './base64';
import { sha256 } from './sha256';

export interface ArchiveEntry {
  /** Relative path inside the archive ("dir/file.txt", directories end without "/"). */
  path: string;
  type: 'file' | 'dir';
  mode: number;
  mtime: number;
  content?: string;
}

export const GZIP_MAGIC = '\x1f\x8b\x08\x00';
export const ZIP_MAGIC = 'PK\x03\x04';
const TAR_MAGIC = 'ustar\x0000';

export type ArchiveKind = 'gzip' | 'tar' | 'zip';

export function archiveKind(content: string): ArchiveKind | null {
  if (content.startsWith(GZIP_MAGIC)) return 'gzip';
  if (content.startsWith(ZIP_MAGIC)) return 'zip';
  if (content.startsWith(TAR_MAGIC)) return 'tar';
  return null;
}

const b64 = (text: string) => encodeBytes(new TextEncoder().encode(text));
const unb64 = (data: string) => new TextDecoder().decode(decodeBytes(data));

export class ArchiveError extends Error {}

/** gzip of a single stream; `name` is the original file name (as gzip -N records it). */
export function gzip(content: string, name: string, mtime: number): string {
  return `${GZIP_MAGIC}\n${JSON.stringify({ name, mtime })}\n${b64(content)}\n`;
}

export function gunzip(data: string): { name: string; mtime: number; content: string } {
  const [, header, payload] = data.split('\n');
  try {
    const h = JSON.parse(header ?? '') as { name: string; mtime: number };
    return { ...h, content: unb64(payload ?? '') };
  } catch {
    throw new ArchiveError('not in gzip format');
  }
}

export function tar(entries: ArchiveEntry[]): string {
  return `${TAR_MAGIC}\n${b64(JSON.stringify(entries))}\n`;
}

export function untar(data: string): ArchiveEntry[] {
  try {
    return JSON.parse(unb64(data.split('\n')[1] ?? '')) as ArchiveEntry[];
  } catch {
    throw new ArchiveError('This does not look like a tar archive');
  }
}

// ── zip ─────────────────────────────────────────────────────────────────

interface ZipHeader {
  /** Per entry: path, type, mode, mtime, size; content is in the payload. */
  entries: Array<Omit<ArchiveEntry, 'content'> & { size: number }>;
  /** Present when encrypted: salt + check value of the password. */
  salt?: string;
  check?: string;
}

function keystream(password: string, salt: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let block = 0; block * 32 < length; block++) {
    const hex = sha256(`${salt}:${password}:${block}`);
    for (let k = 0; k < 32 && block * 32 + k < length; k++) out[block * 32 + k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
  }
  return out;
}

function xor(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i]! ^ key[i]!;
  return out;
}

export function zip(entries: ArchiveEntry[], password?: string, salt = sha256(JSON.stringify(entries.map((e) => e.path))).slice(0, 16)): string {
  const contents = entries.map((e) => (e.type === 'file' ? (e.content ?? '') : ''));
  const header: ZipHeader = {
    entries: entries.map(({ content: _c, ...e }, i) => ({ ...e, size: new TextEncoder().encode(contents[i]!).length })),
  };
  let payload: Uint8Array = new TextEncoder().encode(JSON.stringify(contents));
  if (password) {
    header.salt = salt;
    header.check = sha256(`${salt}:check:${password}`).slice(0, 16);
    payload = xor(payload, keystream(password, salt, payload.length));
  }
  return `${ZIP_MAGIC}\n${JSON.stringify(header)}\n${encodeBytes(payload)}\n`;
}

export function zipInfo(data: string): ZipHeader & { encrypted: boolean } {
  try {
    const h = JSON.parse(data.split('\n')[1] ?? '') as ZipHeader;
    return { ...h, encrypted: !!h.check };
  } catch {
    throw new ArchiveError('End-of-central-directory signature not found.');
  }
}

/** Returns null when the password is wrong (or missing for an encrypted archive). */
export function unzip(data: string, password?: string): ArchiveEntry[] | null {
  const h = zipInfo(data);
  let payload = decodeBytes(data.split('\n')[2] ?? '');
  if (h.encrypted) {
    if (password === undefined || sha256(`${h.salt}:check:${password}`).slice(0, 16) !== h.check) return null;
    payload = xor(payload, keystream(password, h.salt!, payload.length));
  }
  const contents = JSON.parse(new TextDecoder().decode(payload)) as string[];
  return h.entries.map(({ size: _s, ...e }, i) => ({ ...e, ...(e.type === 'file' ? { content: contents[i] ?? '' } : {}) }));
}
