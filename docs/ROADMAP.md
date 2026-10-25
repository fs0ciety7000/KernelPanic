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
| 1.3 | ✅ En ligne sur **https://kernel.fs0ciety.org** (site `/`, jeu `/play/`) : Coolify (app `kernel-panic-web`, auto-deploy) + Cloudflare (CNAME proxifié, Full strict). Basculer la branche Coolify sur `main` après fusion | backend |
| 1.4 | ✅ Panneau « Premiers pas » au premier lancement (rôle de chaque app, raccourcis), réouvrable (menu KP, Ctrl+Alt+H) | apps-developer |
| 1.5 | ✅ Petits écrans : avertissement < 1024 px au menu, fenêtres ouvertes en plein écran < 900 px | design-system |
| 1.6 | ✅ Accessibilité : `--kp-text-2` relevé à 4.58:1 minimum, focus qui suit la fenêtre active, raccourcis prioritaires même dans le terminal, Échap ferme le menu | design-system |
| 1.8 | ✅ **Bureau « vrai OS »** : icônes = `~/Desktop` (lanceurs `.desktop`), sélection/lasso/glisser-déposer, clic droit partout, Corbeille freedesktop restaurable, barre des tâches (lanceur + recherche, fenêtres, notifications, calendrier, réseau), ancrage des fenêtres, sélecteur de fenêtres, Propriétés (chmod), Paramètres | os-engine + apps-developer |
| 1.7 | ✅ Sons d'interface synthétisés (WebAudio, sans fichier), anti-chevauchement, bouton muet persistant | design-system |

## Jalon 2 — Profondeur (P1) · ~4 semaines

| # | Tâche | Agent |
|---|---|---|
| 2.1 | ✅ **Scénario 02 « Canary »** (intermédiaire) : fuite vers la presse, client complice, 8 pièces dont une trompeuse, 4 fins | scenario-writer |
| 2.1b | ✅ Moteur « à la *Orwell* » : pièces à conviction, décisions conditionnées par les pièces, fins multiples mémorisées entre parties | os-engine |
| 2.1c | ✅ **Scénario 00 « Premier jour »** : tutoriel (toutes les apps, sudo, pièces, choix) | scenario-writer |
| 2.1d | ✅ **Scénario 03 « Double fond »** (avancé) : 3 machines, pivot par clé de service, sauvegardes qui contredisent le journal, zip chiffré, 4 fins | scenario-writer |
| 2.2 | ✅ Shell : substitution `$(…)` et backticks, `for … in …; do …; done` ; outils `awk` (sous-ensemble), `sed`, `diff` (-u), `seq`, `tee`, `xargs`, `tar`/`gzip`/`zcat`, `zip`/`unzip` (chiffrement réel), `wc` total ; `sort -t -k`, `xxd -p/-r` | os-engine |
| 2.3 | ✅ App **Navigateur** : sites des scénarios (`web/`), iframe sandboxée sans scripts, routes de formulaires, DNS/timeout/blocage, `file://`, historique-fichier | apps-developer |
| 2.4 | ✅ App **Messages** : PNJ déclenchés par l'enquête, réponses à choix (pièces requises, flags) | apps-developer |
| 2.4b | ✅ Écran d'ouverture de session + verrouillage (vrai mot de passe ou accès forensique) | design-system |
| 2.5 | Mode « Lisibilité » (taille +2, sans grain/glow) + thème clair éventuel | design-system |
| 2.6 | Backend : SQLite (sqlx), sauvegardes synchronisées par jeton joueur anonyme | backend |
| 2.7 | Éditeur de scénario en ligne de commande : `kp-scenario new <slug>` (squelette) | scaffolder |

## Jalon 3 — Monde ouvert (P2)

| # | Tâche | Agent |
|---|---|---|
| 3.1 | ✅ **Machines distantes locales** (ADR-009) : `hosts:` dans le scénario, `ssh` (clé ou mot de passe, bannière, known_hosts, auth.log), `scp -r`, `ssh.from` pour les réseaux cloisonnés, événements étiquetés `machine` | architect + os-engine |
| 3.1b | Machines distantes côté serveur (WebSocket, état partagé, leaderboard anti-triche) | backend |
| 3.2 | Validation serveur des réponses + **leaderboard** (temps, indices) | backend |
| 3.3 | ✅ **Mode chronométré** : minuteries déclaratives (`timers:`, avertissements, désamorçage par flag), compte à rebours dans la barre des tâches, case au menu ; Ghost Shift : JOB-0417 part vraiment à 09:00 → fin « Blackout ». Fins colorées (`tone`), score pondéré par les objectifs faits | scenario-writer + os-engine |
| 3.4 | Workshop : chargement de scénarios communautaires (bundle signé, sandbox stricte) | architect |
| 3.5 | Localisation EN (UI + scénarios, artefacts machine déjà en anglais) | scenario-writer |
| 3.6 | Auto-update Tauri, signature/notarisation macOS & Windows | backend |

## Dette & risques suivis

- Rendu de listes longues (Logs > 5 000 lignes) : virtualiser si un scénario l'exige.
- `localStorage` limité (~5 Mo) : passer à IndexedDB si les diffs VFS grossissent (scénarios avec gros fichiers créés par le joueur).
- Le shell n'a que des boucles `for` sur une ligne (pas de `while`, `if`, fonctions) : suffisant pour l'enquête, à réévaluer si un scénario l'exige.
- `awk` est un sous-ensemble (pas de tableaux associatifs ni de `getline`) ; `sort | uniq -c` couvre les comptages.
