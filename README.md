# Kernel_Panic

> Un jeu d'enquête hacking où le moteur **est** un système d'exploitation. Fichiers, terminal, mails, journaux, photos : tout est réel dans la machine, rien ne l'est en dehors.

**Kernel_Panic** vous assoit devant la station de travail d'un inconnu. Vous lisez ses mails, fouillez ses dossiers cachés, filtrez ses logs, décodez ce qu'un attaquant a laissé derrière lui — avec de vrais réflexes d'analyste (`grep`, `sudo`, `base64 -d`, en-têtes de mail, EXIF, crontab). Tout est simulé et sandboxé : aucune vraie commande n'est exécutée.

- 🌐 Web : **https://kernel.fs0ciety.org/play/** (en ligne)
- 🖥️ Desktop : macOS · Windows · Linux (Tauri)
- 📖 Site : `https://kernel.fs0ciety.org/`

## Les dossiers

| # | Dossier | Niveau | Pitch |
|---|---|---|---|
| 00 | **Premier jour** | Tutoriel · ~12 min | Premier matin chez Ironveil, cabinet de réponse à incident. Votre mentore vous a préparé une machine d'entraînement. |
| 01 | **Ghost Shift** | Débutant → intermédiaire · ~40 min | 03:12 : le compte de l'admin d'un opérateur électrique programme un firmware non signé sur 14 sous-stations. Exécution à 09:00. |
| 02 | **Canary** | Intermédiaire · ~40 min · 4 fins | On vous paie pour démasquer la source d'une fuite dans la presse. Les fichiers racontent une autre histoire, et c'est vous qui décidez ce que dira votre rapport. |
| 03 | **Double fond** | Avancé · ~50 min · 3 machines · 4 fins | 2,4 M€ versés pour un incendie. Le journal dit que la responsable a validé, elle jure avoir refusé. De serveur en serveur, jusqu'aux sauvegardes. |
| 04 | **Effet domino** | Intermédiaire · ~40 min · en direct · 5 fins | 04:15, les systèmes des transports de Valmont tombent un par un. Premier tram à 05:00. Arrêtez la chute sans casser ce qui tient encore, puis trouvez qui a voulu cette mise à jour. |

Comme dans *Orwell*, chaque enquête accumule des **pièces à conviction** sourcées, dont certaines sont trompeuses. Les **décisions** finales ne sont possibles qu'avec les bonnes pièces, et mènent à des **fins différentes**, mémorisées d'une partie à l'autre.

## Le bureau

Un vrai bureau : un écran d'ouverture de session (et de verrouillage, Ctrl+Alt+L), les icônes sont les fichiers de `~/Desktop` (double-clic, lasso, glisser-déposer, F2, Suppr, clic droit partout), une Corbeille restaurable, une barre des tâches avec lanceur et recherche, liste des fenêtres, centre de notifications, calendrier et réseau, des fenêtres qu'on ancre aux bords, un panneau Propriétés qui montre (et modifie, si on en a le droit) les permissions rwx, et des Paramètres (fonds d'écran, son, lisibilité).

| App | Ce qu'elle fait | Pourquoi elle compte |
|---|---|---|
| **Fichiers** | Liste ou icônes, fichiers cachés, droits, glisser-déposer, couper/copier/coller, Corbeille | Ce qu'on cache commence par un point |
| **Terminal** | xterm.js + shell bash-like : pipes, redirections, globs, `sudo`, ~70 commandes, complétion Tab, historique | Le scalpel |
| **Mail** | Client Maildir lisant de vrais `.eml`, vue source complète | Les en-têtes ne mentent pas |
| **Notes** | Éditeur de texte (Ctrl+S), lecture seule selon les droits | Runbooks, todo, vos propres notes |
| **Images** | Visionneuse, zoom, panneau métadonnées/EXIF | Une photo dit quand, où, et parfois quoi |
| **Logs** | Journaux colorés par gravité, filtres (texte, `/regex/`, presets) | La nuit, minute par minute |
| **Dossier** | Objectifs, réponses, indices à paliers, pièces à conviction, décisions | Le fil de l'enquête |
| **Navigateur** | Intranet et sites des scénarios, erreurs réseau réalistes, sites bloqués par le SOC, historique (fichier) | Le web interne en dit autant que les mails |
| **Messages** | Messagerie interne : des collègues vous écrivent, vous répondez par choix | Les gens savent des choses que les fichiers ignorent |
| **Paramètres** · **Propriétés** | Fond d'écran, son, lisibilité · type, taille, propriétaire, permissions | Une machine qui se règle et s'inspecte |

## Démarrer

Prérequis : Node 22, pnpm 10 (`corepack enable`), Rust stable pour le serveur et Tauri.

```bash
pnpm install
pnpm dev                 # compile les scénarios puis lance le jeu sur http://localhost:5173
pnpm site:dev            # site vitrine (Astro)
pnpm tauri dev           # application desktop (nécessite les prérequis Tauri, voir DEPLOYMENT.md)
```

Qualité :

```bash
pnpm scenarios:check     # valide les scénarios (schéma, chemins, regex, dépendances)
pnpm test                # noyau + playthrough complet de chaque scénario + serveur
pnpm check               # typecheck
pnpm build               # jeu (apps/game/build) + site (apps/site/dist)
```

## Structure

```
apps/
  game/          SvelteKit (SPA) — bureau, window manager, apps ; src-tauri/ pour le desktop
  site/          Astro — site vitrine
  server/        Axum (Rust) — API (phase 2 : sauvegardes synchronisées, validation, leaderboard)
packages/
  kernel/        Noyau TypeScript pur : VFS, utilisateurs, shell, commandes, runtime de scénario
  scenario-kit/  Compilateur/validateur de scénarios (YAML + fichiers → bundle JSON)
scenarios/       Contenu jouable (00-premier-jour, 01-ghost-shift, 02-canary)
docker/          Image web (nginx : site /, jeu /play/, proxy /api/), compose Coolify
docs/            Roadmap
.claude/         Agents spécialisés et skills
```

## Documentation

| Document | Contenu |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Stack argumentée, diagrammes, noyau, système d'apps, ADR |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | NOCTIS : couleurs, typo, composants, motion, accessibilité |
| [`SCENARIO_ENGINE.md`](SCENARIO_ENGINE.md) | Format des scénarios, triggers, effets, commandes scénarisées, règles d'écriture |
| [`AGENTS.md`](AGENTS.md) | Agents spécialisés, skills, flux de travail |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Coolify + Cloudflare, Docker, variables, builds Tauri, rollback |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Plan priorisé MVP → extensions |

## Sécurité

Tout est simulé : le shell n'interprète que ses propres commandes TypeScript, les « binaires » du disque virtuel ne s'exécutent pas, le réseau est factice, l'application desktop n'expose aucune API native. Les domaines et adresses du scénario sont fictifs.
