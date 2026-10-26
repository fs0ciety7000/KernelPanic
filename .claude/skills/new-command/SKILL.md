---
name: new-command
description: Ajouter une commande au terminal de Kernel_Panic — soit une commande système dans le noyau (TypeScript), soit un outil propre à un scénario (déclaratif YAML). À utiliser dès qu'un joueur devrait pouvoir taper une nouvelle commande.
---

# Ajouter une commande

## A. Outil propre à un scénario (préféré pour le contenu)
Dans `scenario.yaml`, section `commands:` (voir `SCENARIO_ENGINE.md §4`) :

```yaml
commands:
  vpnctl:
    path: /usr/local/bin/vpnctl     # pour `which` et l'exécution par chemin
    summary: Corporate VPN client
    group: vpn-users                # optionnel : refus sinon
    rules:
      - match: "^status$"
        output: "connected to gw-02 (10.8.0.1)"
      - match: "^kill (\\S+)$"
        requireRoot: true
        emit: session-killed        # → scenario.flag
        once: true
        output: "\\e[32m[ok]\\e[0m session terminated"
      - match: "^status$"
        ifFlag: session-killed      # variantes selon l'avancement
        output: "disconnected"
    fallback: "usage: vpnctl <status|kill ID>"
```
Ajoute aussi un fichier binaire factice à `fs/usr/local/bin/<nom>` pour `ls`/`file`. Puis `pnpm scenarios:check`.

## B. Commande système (noyau)
1. Choisis la famille : `packages/kernel/src/shell/commands/{fs,text,system,net}.ts`.
2. Écris un `CommandDef` :

```ts
const rev: CommandDef = {
  name: 'rev',
  summary: 'reverse lines characterwise',
  usage: 'rev [FILE]...',
  run(ctx) {
    return eachInput(ctx, ctx.argv, (text) => ctx.out(/* … */));
  },
};
```
- Options : `getopt(ctx.argv, 'bools', 'withValue', { long: 'x' })` (`shell/args.ts`).
- Entrées : `eachInput` (fichiers ou stdin). Fichiers : `ctx.kernel.vfs.*(…, ctx.cred)`.
- Erreurs : `ctx.err(fsMessage(name, e, path))` → format coreutils exact ; code de sortie Unix.
- Couleurs uniquement si `ctx.tty`.
3. Ajoute-la au tableau exporté de la famille ; si elle doit apparaître dans `help`, ajoute-la au bon groupe (`system.ts` › `help`). Page `man` facultative (`commands/man.ts`).
4. Test dans `packages/kernel/test/shell.test.ts` (sortie exacte + code de sortie + cas d'erreur de permission).

```bash
pnpm --filter @kp/kernel test && pnpm --filter @kp/kernel check
```
