# Kernel_Panic — Plan de développement

Priorités : **P0** bloque la sortie publique · **P1** forte valeur joueur · **P2** extension.
Agents : voir `AGENTS.md`.

## Jalon 0 — Fondations ✅ (livré)

| Élément | État |
|---|---|
| Noyau TS : VFS POSIX (modes, propriétaires, sticky, symlinks), utilisateurs, `sudo`/`su` | ✅ testé |
| Shell : parser (quotes, `$VAR`, globs, `\|`, `>`, `>>`, `2>`, `&&`, `\|\|`), ~70 commandes | ✅ testé |
| Runtime de scénario : triggers, réponses hachées, indices, livraisons, découvertes anticipées, score | ✅ testé |
| Compilateur/validateur de scénarios (`kp-scenario`) | ✅ |
| Bureau : boot, menu, intro, window manager (drag, resize, max, min, focus), dock, top bar, toasts, fin | ✅ |
| Apps : Fichiers, Terminal (xterm.js), Notes, Mail (Maildir), Images (EXIF), Logs, Dossier | ✅ |
| Scénario 01 « Ghost Shift » complet + test de playthrough | ✅ |
| Sauvegarde locale (diff VFS + état + fenêtres), autosave | ✅ |
| Site vitrine Astro, image Docker (nginx), compose Coolify, CI, workflow desktop Tauri | ✅ |

## Jalon 1 — MVP public (P0) · ~2 semaines

| # | Tâche | Agent |
|---|---|---|
| 1.1 | Playtests externes (5 joueurs, débutants + confirmés) sur Ghost Shift ; ajuster indices et rythme | scenario-writer |
| 1.2 | Premier build Tauri sur les 3 OS via `desktop.yml`, vérifier sauvegarde locale dans la WebView | os-engine |
| 1.3 | Déploiement Coolify + Cloudflare sur `kernel.fsociety.org` (site `/`, jeu `/play/`) | backend |
| 1.4 | ✅ Panneau « Premiers pas » au premier lancement (rôle de chaque app, raccourcis), réouvrable (menu KP, Ctrl+Alt+H) | apps-developer |
| 1.5 | ✅ Petits écrans : avertissement < 1024 px au menu, fenêtres ouvertes en plein écran < 900 px | design-system |
| 1.6 | ✅ Accessibilité : `--kp-text-2` relevé à 4.58:1 minimum, focus qui suit la fenêtre active, raccourcis prioritaires même dans le terminal, Échap ferme le menu | design-system |
| 1.7 | ✅ Sons d'interface synthétisés (WebAudio, sans fichier), anti-chevauchement, bouton muet persistant | design-system |

## Jalon 2 — Profondeur (P1) · ~4 semaines

| # | Tâche | Agent |
|---|---|---|
| 2.1 | ✅ **Scénario 02 « Canary »** (intermédiaire) : fuite vers la presse, client complice, 8 pièces dont une trompeuse, 4 fins | scenario-writer |
| 2.1b | ✅ Moteur « à la *Orwell* » : pièces à conviction, décisions conditionnées par les pièces, fins multiples mémorisées entre parties | os-engine |
| 2.1c | ⏳ **Scénario 00 « Premier jour »** (en cours) : tutoriel (toutes les apps, sudo, pièces, choix) | scenario-writer |
| 2.1d | Scénario 03 (avancé) : plusieurs machines (dépend de 3.1), pièces contradictoires entre machines | scenario-writer |
| 2.2 | Commandes : `tar`/`unzip`/`gzip` simulés, `diff`, `awk` minimal, substitution `$(…)`, `for` simple (✅ déjà : `sort -t -k`, `xxd -p/-r`) | os-engine |
| 2.3 | App **Navigateur simulé** (intranet de l'entreprise, pages HTML du scénario, formulaires factices) | apps-developer |
| 2.4 | App **Messagerie interne** (chat PNJ scripté, réponses à choix) | apps-developer |
| 2.5 | Mode « Lisibilité » (taille +2, sans grain/glow) + thème clair éventuel | design-system |
| 2.6 | Backend : SQLite (sqlx), sauvegardes synchronisées par jeton joueur anonyme | backend |
| 2.7 | Éditeur de scénario en ligne de commande : `kp-scenario new <slug>` (squelette) | scaffolder |

## Jalon 3 — Monde ouvert (P2)

| # | Tâche | Agent |
|---|---|---|
| 3.1 | **Serveurs distants** : `ssh host` ouvre une seconde machine (VFS propre) — d'abord locale (bundle multi-machines), puis côté serveur (WebSocket) | architect + os-engine |
| 3.2 | Validation serveur des réponses + **leaderboard** (temps, indices) | backend |
| 3.3 | Mode chronométré (JOB qui s'exécute vraiment à l'heure de jeu) et fins alternatives | scenario-writer |
| 3.4 | Workshop : chargement de scénarios communautaires (bundle signé, sandbox stricte) | architect |
| 3.5 | Localisation EN (UI + scénarios, artefacts machine déjà en anglais) | scenario-writer |
| 3.6 | Auto-update Tauri, signature/notarisation macOS & Windows | backend |

## Dette & risques suivis

- Rendu de listes longues (Logs > 5 000 lignes) : virtualiser si un scénario l'exige.
- `localStorage` limité (~5 Mo) : passer à IndexedDB si les diffs VFS grossissent (scénarios avec gros fichiers créés par le joueur).
- Le shell n'a pas de substitution de commande ni de boucles : volontaire au MVP, à réévaluer avec 2.2.
