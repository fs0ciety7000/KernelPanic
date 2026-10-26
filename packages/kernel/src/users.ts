import type { Cred } from './vfs/vfs';
import { secretHash } from './util/sha256';

export interface UserDef {
  name: string;
  uid: number;
  home: string;
  shell?: string;
  groups?: string[];
  fullName?: string;
  /** secretHash(scenarioId, password). Absent = locked account. */
  passwordHash?: string;
}

export class Users {
  private users = new Map<string, UserDef>();

  constructor(private salt: string, defs: UserDef[] = []) {
    for (const d of defs) this.users.set(d.name, d);
    if (!this.users.has('root')) this.users.set('root', { name: 'root', uid: 0, home: '/root', shell: '/bin/bash' });
  }

  get(name: string): UserDef | undefined {
    return this.users.get(name);
  }

  all(): UserDef[] {
    return [...this.users.values()].sort((a, b) => a.uid - b.uid);
  }

  /** Primary group (same name as the user) first, like a real `id`. */
  groupsOf(name: string): string[] {
    const u = this.users.get(name);
    if (!u) return [];
    return [u.uid === 0 ? 'root' : name, ...(u.groups ?? []).filter((g) => g !== name)];
  }

  cred(name: string): Cred {
    const u = this.users.get(name);
    if (!u) throw new Error(`unknown user ${name}`);
    return { user: u.name, uid: u.uid, groups: this.groupsOf(name) };
  }

  verify(name: string, password: string): boolean {
    const u = this.users.get(name);
    return !!u?.passwordHash && u.passwordHash === secretHash(this.salt, password);
  }

  canSudo(name: string): boolean {
    return name === 'root' || this.groupsOf(name).some((g) => g === 'sudo' || g === 'wheel');
  }
}
