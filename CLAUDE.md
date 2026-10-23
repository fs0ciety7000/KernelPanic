# Kernel_Panic — instructions pour Claude Code

@AGENTS.md

## Repères rapides
- Noyau (TS pur, testé) : `packages/kernel` — toute la logique de jeu.
- Bureau (SvelteKit SPA, Svelte 5 runes) : `apps/game/src/lib/{os,desktop,apps}`.
- Contenu : `scenarios/<NN-slug>/` (YAML + fichiers réels), compilé par `pnpm scenarios`.
- Ne jamais muter un `$state` depuis un `$derived` ; les événements du noyau vers l'UI passent par `queueMicrotask` (`os.svelte.ts`).
- Avant de rendre la main : `pnpm scenarios:check && pnpm test && pnpm check`.
