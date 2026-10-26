---
name: playtest
description: Lancer le jeu dans un vrai navigateur (Chromium headless via Playwright), jouer une séquence d'actions et produire des captures d'écran + la liste des erreurs console. À utiliser pour vérifier visuellement une app, un écran ou un scénario après modification.
---

# Playtest navigateur

1. Construire et servir :
   ```bash
   pnpm scenarios && pnpm --filter @kp/game build
   (cd apps/game && npx vite preview --port 4173 --strictPort &) ; sleep 3
   ```
2. Lancer le script (Playwright doit être résolvable ; dans l'environnement cloud il est global : `NODE_PATH=$(npm root -g)`) :
   ```bash
   NODE_PATH=$(npm root -g) node .claude/skills/playtest/playtest.cjs <dossier-captures> [scénario-id]
   ```
   Le script : passe le boot, ouvre le dossier, entre sur le bureau, ouvre le briefing, exécute quelques commandes au terminal, ouvre chaque app du dock et capture chaque étape. Il affiche les erreurs console/page à la fin.
3. Lire les captures (outil Read sur les PNG) et vérifier : pas d'erreur console, rendu conforme à `DESIGN_SYSTEM.md`, contenu attendu visible.
4. Adapter `STEPS` dans le script pour tester un parcours précis (nouvelle app, nouveau scénario).
5. Arrêter le serveur de preview à la fin (`kill` du PID de `vite preview` ; éviter `pkill -f` depuis une commande qui contient elle-même ce texte).
