---
name: new-scenario
description: Créer un nouveau scénario d'enquête Kernel_Panic (dossier scenarios/NN-slug avec scenario.yaml, fs/, deliveries/, SOLUTION.md et test de playthrough). À utiliser pour tout nouveau scénario ou épisode.
---

# Créer un scénario

Référence complète : `SCENARIO_ENGINE.md`. Exemple vivant : `scenarios/01-ghost-shift/`.

## 1. Pitch & chronologie (avant tout fichier)
Écris dans `scenarios/<NN-slug>/SOLUTION.md` :
- le pitch en 3 lignes, la victime, l'attaquant, son mobile ;
- la **timeline à la seconde** (fuseau de `machine.clock`) ;
- la chaîne d'objectifs : pour chacun, *où* est l'indice (≥ 2 chemins), *quelle app* sert, *quel trigger* ou *quelle réponse* le valide.

## 2. Squelette
```
scenarios/<NN-slug>/
├─ scenario.yaml
├─ SOLUTION.md
├─ fs/            # racine du disque : etc/, home/<user>/, var/log/, tmp/ …
└─ deliveries/    # mails livrés en cours de partie ({{date}} = heure de jeu)
```
Copie `scenarios/01-ghost-shift/scenario.yaml` et remplace tout. `id` en kebab-case (il sert de sel aux hash).

## 3. Disque virtuel
- Home : `fs/home/<user>/` (propriétaire auto `<user>`, mode 0750). Dossiers vides : un `.gitkeep`.
- Mails : Maildir (`Maildir/new` non lus, `Maildir/cur` lus, `Maildir/.Sent/cur`), fichiers `.eml` RFC 822 complets (Received, Return-Path, Message-ID…).
- Images : SVG avec `<title>`, `<desc>` et `<kp:exif …/>` dans `<metadata>` (voir `SCENARIO_ENGINE.md §6`).
- Logs : génère-les par script si répétitifs (CRON…), mais vérifie la chronologie à la main.
- Binaires : fichiers texte avec octets de contrôle (`printf '\x7fELF…'`) — `file`/`strings` les traitent.
- Permissions & `mtime` : section `permissions:` (glob `/**` possible). Les `mtime` racontent aussi l'histoire (`ls -lt`).

## 4. Objectifs
- Réponses (`answer.accept`) : toutes les variantes raisonnables, `normalize` adapté. Elles sont hachées dans le bundle.
- Triggers : `fs.read` sur le fichier clé, `cmd.exec` + regex, `auth.sudo`, `mail.open` (Message-ID sans chevrons), `scenario.flag` (émis par une commande scénarisée).
- Un objectif final avec `onComplete: [{ deliver: … }, { end: true }]`.
- 3 paliers d'indices chacun. Bonus avec `optional: true`.

## 5. Test de playthrough (obligatoire)
Copie `packages/scenario-kit/test/ghost-shift.test.ts` → `<slug>.test.ts` et joue le chemin principal commande par commande (+ un test de sauvegarde/chargement).

## 6. Vérifier
```bash
pnpm scenarios:check
pnpm --filter @kp/scenario-kit test
pnpm scenarios && pnpm dev     # partie réelle, ou skill playtest
```
Checklist finale : `SCENARIO_ENGINE.md §7`.
