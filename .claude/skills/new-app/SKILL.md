---
name: new-app
description: Ajouter une application système au bureau de Kernel_Panic (manifeste, composant Svelte, association de fichiers, dock). À utiliser quand on crée une nouvelle app (navigateur simulé, chat interne, calendrier, visionneuse PDF…).
---

# Ajouter une app au bureau

## 1. Composant
Crée `apps/game/src/lib/apps/<id>/<Id>.svelte` :

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { os } from '$lib/os/os.svelte';
  import type { AppProps } from '$lib/os/apps';
  import { fsErrorText } from '../fs-helpers';

  let { win }: AppProps = $props();
  const k = os.kernel!;

  let path = $state<string | null>(null);

  // Deep link: wm.open('<id>', { path }) — réagit aussi quand une instance singleton est réutilisée.
  $effect(() => {
    void win.nonce;
    const target = win.args.path;
    untrack(() => { if (typeof target === 'string') path = target; });
  });

  // Lecture réactive, silencieuse (pas d'événement à chaque rendu).
  const doc = $derived.by(() => {
    void os.version;
    if (!path) return { text: '', error: null };
    try { return { text: k.vfs.readFile(path, os.cred, { silent: true }), error: null }; }
    catch (e) { return { text: '', error: fsErrorText(e, path) }; }
  });

  // L'action observable (triggers de scénario) : une fois par ouverture.
  $effect(() => {
    const p = path;
    untrack(() => { if (p) try { k.vfs.readFile(p, os.cred); } catch { /* affiché plus haut */ } });
  });

  $effect(() => { win.title = path ? `${path} — <Titre>` : '<Titre>'; });
</script>

<div class="app">
  <div class="kp-toolbar">…</div>
  {#if doc.error}<div class="kp-error">{doc.error}</div>{:else}…{/if}
</div>

<style>
  .app { display: flex; flex-direction: column; flex: 1; min-height: 0; }
</style>
```

## 2. Manifeste
Ajoute l'entrée dans `APPS` (`apps/game/src/lib/os/apps.ts`) : `id`, `title`, `icon` (clé de `desktop/icons.ts`, en ajouter une si besoin), `load: () => import('../apps/<id>/<Id>.svelte')`, `opens` (extensions), `singleton`, `defaultSize`, `dock`.
Si l'app doit ouvrir des chemins particuliers (comme `/var/log` → logs), adapte `appForPath`.

## 3. Événements
Si l'app crée un nouveau type d'action observable (ex. `browser.visit`), ajoute-le à `KernelEvents` (`packages/kernel/src/events.ts`), à `KNOWN_EVENTS` (`packages/scenario-kit/src/compile.ts`) et au tableau de `SCENARIO_ENGINE.md §3.1`.

## 4. Règles
- Aucune mutation de `$state` dans un `$derived`. Aucune `{@html}` sur du contenu.
- Primitives `kp-*` et tokens `--kp-*` uniquement (voir `DESIGN_SYSTEM.md`).
- Permissions : toujours `os.cred`, jamais `ROOT`.

## 5. Vérifier
```bash
pnpm --filter @kp/game check
pnpm scenarios && pnpm --filter @kp/game build
```
Puis skill `playtest` pour une capture de l'app ouverte. Mets à jour `ARCHITECTURE.md §5.1` et le tableau des apps du `README.md`.
