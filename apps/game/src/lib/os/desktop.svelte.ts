// Desktop icon layout: grid positions (saved with the game) and selection.

export interface Cell {
  c: number;
  r: number;
}

export const CELL_W = 96;
export const CELL_H = 102;
export const MARGIN = 10;

class DesktopState {
  /** Icon key (VFS path or `sys:<id>`) → grid cell. Missing keys are auto-placed. */
  positions = $state<Record<string, Cell>>({});
  selection = $state<string[]>([]);
  renaming = $state<string | null>(null);

  select(keys: string[]): void {
    this.selection = keys;
  }

  isSelected(key: string): boolean {
    return this.selection.includes(key);
  }

  /** Re-key a moved/renamed icon so it keeps its place. */
  rekey(from: string, to: string): void {
    const cell = this.positions[from];
    if (!cell) return;
    const next = { ...this.positions, [to]: cell };
    delete next[from];
    this.positions = next;
  }

  reset(): void {
    this.positions = {};
    this.selection = [];
    this.renaming = null;
  }
}

export const desktop = new DesktopState();

/** Column-major auto layout (top-left first), skipping occupied cells. */
export function layout(keys: string[], rows: number, positions: Record<string, Cell>): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  const taken = new Set<string>();
  for (const k of keys) {
    const p = positions[k];
    if (p && !taken.has(`${p.c},${p.r}`)) {
      out[k] = p;
      taken.add(`${p.c},${p.r}`);
    }
  }
  let i = 0;
  for (const k of keys) {
    if (out[k]) continue;
    while (taken.has(`${Math.floor(i / rows)},${i % rows}`)) i++;
    out[k] = { c: Math.floor(i / rows), r: i % rows };
    taken.add(`${out[k].c},${out[k].r}`);
  }
  return out;
}
