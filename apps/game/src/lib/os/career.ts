// Ironveil career: results per contract, reputation, ranks and badges. Pure logic; storage lives in os.svelte.ts.
import type { Kernel, ScenarioIndexEntry } from '@kp/kernel';

/** What one finished playthrough produced. */
export interface RunResult {
  scenario: string;
  score: number;
  ending?: string;
  tone: 'good' | 'bad' | 'mixed';
  hints: number;
  /** Play time in ms. */
  playtime: number;
  timed: boolean;
  evidence: number;
  evidenceTotal: number;
  bonusDone: number;
  bonusTotal: number;
  /** Distinct remote machines logged into. */
  hosts: number;
  isolations: number;
  /** Endings discovered so far for this case (after this run). */
  endingsSeen: number;
  endingsTotal: number;
  at: number;
}

export interface ContractRecord {
  best?: RunResult;
  runs: number;
}

export function runResult(k: Kernel, endingsSeen: number): RunResult {
  const rt = k.runtime;
  const ending = rt.ending();
  const journal = rt.journal();
  const objectives = rt.objectives();
  const bonus = objectives.filter((o) => o.optional);
  return {
    scenario: k.bundle.id,
    score: rt.score().score,
    ending: ending?.id,
    tone: ending?.tone ?? 'good',
    hints: rt.score().hints,
    playtime: rt.playtime(),
    timed: !!rt.state.timed,
    evidence: rt.evidence().length,
    evidenceTotal: k.bundle.evidence?.length ?? 0,
    bonusDone: bonus.filter((o) => o.status === 'done').length,
    bonusTotal: bonus.length,
    hosts: new Set(journal.filter((j) => j.kind === 'ssh').map((j) => j.text.split('@')[1])).size,
    isolations: journal.filter((j) => j.kind === 'action' && j.text.startsWith('Isolement')).length,
    endingsSeen,
    endingsTotal: k.bundle.endings?.length ?? 0,
    at: Date.now(),
  };
}

/** Keeps the better run: good endings first, then score. */
export function better(a: RunResult | undefined, b: RunResult): RunResult {
  if (!a) return b;
  const rank = (r: RunResult) => (r.tone === 'good' ? 2 : r.tone === 'mixed' ? 1 : 0);
  if (rank(b) !== rank(a)) return rank(b) > rank(a) ? b : a;
  return b.score > a.score ? b : a;
}

/** 0–3 stars: closed · good ending · good ending without hints. */
export function stars(r?: RunResult): number {
  if (!r) return 0;
  if (r.tone !== 'good') return 1;
  return r.hints === 0 ? 3 : 2;
}

export const RANKS = [
  { min: 0, title: 'Stagiaire' },
  { min: 800, title: 'Analyste junior' },
  { min: 2000, title: 'Analyste' },
  { min: 3500, title: 'Analyste senior' },
  { min: 5000, title: 'Référent incident' },
] as const;

/** Reputation = sum of the best score of each closed contract. */
export function reputation(records: Record<string, ContractRecord>): number {
  return Object.values(records).reduce((sum, r) => sum + (r.best?.score ?? 0), 0);
}

export function rankOf(rep: number) {
  let i = 0;
  while (i + 1 < RANKS.length && rep >= RANKS[i + 1]!.min) i++;
  const next = RANKS[i + 1];
  return { title: RANKS[i]!.title, index: i, next: next ? { title: next.title, at: next.min } : null, floor: RANKS[i]!.min };
}

export interface BadgeDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  /** Earned by this run (the index entry gives context like estimated minutes). */
  check: (r: RunResult, entry?: ScenarioIndexEntry) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-case', title: 'Premier dossier', desc: 'Clore une enquête.', icon: 'case', check: () => true },
  { id: 'no-hints', title: 'Sans filet', desc: 'Clore une enquête sans aucun indice.', icon: 'lightbulb', check: (r) => r.hints === 0 && r.tone !== 'bad' },
  { id: 'all-evidence', title: 'Rien ne m’échappe', desc: 'Réunir toutes les pièces d’un dossier.', icon: 'key', check: (r) => r.evidenceTotal > 0 && r.evidence === r.evidenceTotal },
  { id: 'all-bonus', title: 'Zèle', desc: 'Accomplir tous les objectifs bonus d’une enquête.', icon: 'diamond', check: (r) => r.bonusTotal > 0 && r.bonusDone === r.bonusTotal },
  { id: 'timed', title: 'Contre la montre', desc: 'Réussir une enquête en mode chronométré.', icon: 'clock', check: (r) => r.timed && r.tone === 'good' },
  { id: 'fast', title: 'Rapide', desc: 'Réussir une enquête en moins de temps que prévu.', icon: 'refresh', check: (r, e) => r.tone === 'good' && !!e?.estimatedMinutes && r.playtime < e.estimatedMinutes * 60_000 },
  { id: 'hops', title: 'De proche en proche', desc: 'Se connecter à deux machines distantes dans une même enquête.', icon: 'server', check: (r) => r.hosts >= 2 },
  { id: 'gentle', title: 'Sans casser', desc: 'Réussir une crise en direct sans isoler une seule machine.', icon: 'shield', check: (r) => r.scenario === 'effet-domino' && r.tone === 'good' && r.isolations === 0 },
  { id: 'all-endings', title: 'Toutes les vérités', desc: 'Découvrir toutes les fins d’une enquête.', icon: 'source', check: (r) => r.endingsTotal > 1 && r.endingsSeen >= r.endingsTotal },
  { id: 'wrong-call', title: 'L’erreur est humaine', desc: 'Atteindre une fin d’échec. On apprend aussi comme ça.', icon: 'alert', check: (r) => r.tone === 'bad' },
];
