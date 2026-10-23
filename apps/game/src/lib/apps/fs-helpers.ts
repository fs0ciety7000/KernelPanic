import { FsError } from '@kp/kernel';

/** Human message for an error coming out of the VFS. */
export function fsErrorText(e: unknown, path: string): string {
  if (e instanceof FsError) return `${path} : ${e.message}`;
  return `${path} : ${(e as Error).message}`;
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
