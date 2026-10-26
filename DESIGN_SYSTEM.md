# Kernel_Panic — Design System

> Nom de code : **NOCTIS**. Un OS de professionnel de la sécurité, pas un décor de film. Référence mentale : une station de travail d'analyste SOC à 3 h du matin — sombre, calme, précise, et quelques signaux lumineux qui *veulent dire quelque chose*.

## 1. Principes

1. **Le néon est un signal, pas une décoration.** Les accents (cyan, violet, vert) servent à indiquer focus, état, action. Une surface au repos est neutre. Règle : ≤ 10 % de pixels accentués par écran.
2. **Crédibilité avant spectacle.** Les apps ressemblent à de vrais outils (densité d'info, en-têtes de mail complets, colonnes de permissions). Pas de pluie de caractères, pas de vert-sur-noir intégral, pas de crânes.
3. **Profondeur par la lumière.** Hiérarchie par élévation (surfaces de plus en plus claires) + bordures fines translucides + verre dépoli léger sur les éléments flottants (top bar, dock, menus).
4. **Le texte est roi.** Le jeu se lit : typographie soignée, contraste AA minimum (AAA pour le terminal), interlignage généreux.
5. **Glitch avec parcimonie.** Les effets « corrompus » (aberration chromatique, scanline, jitter) sont réservés aux moments narratifs (intrusion détectée, fin de scénario). Jamais en permanence.

## 2. Couleurs

### 2.1 Fondations (neutres froids, légèrement bleutés)

| Token | Valeur | Usage |
|---|---|---|
| `--kp-bg-0` | `#05070b` | Fond absolu (boot, derrière le fond d'écran) |
| `--kp-bg-1` | `#0a0e14` | Fond du bureau / contenu des fenêtres |
| `--kp-bg-2` | `#0f141c` | Surfaces : panneaux latéraux, listes |
| `--kp-bg-3` | `#151b25` | Surfaces élevées : barre de titre active, cartes |
| `--kp-bg-4` | `#1c2430` | Hover, champs de saisie |
| `--kp-line` | `rgba(148, 170, 200, 0.10)` | Bordures, séparateurs |
| `--kp-line-strong` | `rgba(148, 170, 200, 0.18)` | Bordure de fenêtre active |
| `--kp-text-0` | `#e8eef7` | Texte principal |
| `--kp-text-1` | `#a9b4c4` | Texte secondaire |
| `--kp-text-2` | `#808c9e` | Texte tertiaire, placeholders, métadonnées |

### 2.2 Accents (signaux)

| Token | Valeur | Sens |
|---|---|---|
| `--kp-cyan` | `#3ee6f5` | **Système / focus / interactif** — sélection, liens, fenêtre active, curseur |
| `--kp-violet` | `#9d7bff` | **Narratif / indice / découverte** — nouvel objectif, élément important, fichier caché |
| `--kp-green` | `#5af2a0` | **Terminal / succès** — prompt, objectif complété, `ok` |
| `--kp-amber` | `#ffb648` | **Avertissement** — `warn`, permissions sensibles |
| `--kp-red` | `#ff4f6d` | **Danger / intrusion** — `error`, `Permission denied`, alerte |

Chaque accent a une variante `-dim` (12 % d'opacité) pour les fonds de badges/sélections et une variante `-glow` (ombre portée `0 0 24px` à 35 %) réservée au focus.

### 2.3 Palette terminal (ANSI)

| ANSI | Normal | Bright |
|---|---|---|
| black | `#0a0e14` | `#3a4454` |
| red | `#ff4f6d` | `#ff7a91` |
| green | `#5af2a0` | `#8cf7bf` |
| yellow | `#ffb648` | `#ffcc7a` |
| blue | `#5b9cff` | `#8ab8ff` |
| magenta | `#9d7bff` | `#bba3ff` |
| cyan | `#3ee6f5` | `#7befff` |
| white | `#c4cedc` | `#e8eef7` |

Fond terminal `#070a0f`, curseur cyan, sélection `rgba(62,230,245,0.25)`.

## 3. Typographie

| Rôle | Police | Graisse | Taille / interlignage |
|---|---|---|---|
| UI | **Geist** (variable, auto-hébergée) | 400 / 500 / 600 | 13 px / 1.45 (base), 12 px (méta), 11 px (labels capitales, `letter-spacing: .08em`) |
| Titres d'app | Geist | 600 | 15 px / 1.3 |
| Display (boot, vitrine) | Geist | 300 / 700 | 48–96 px, `letter-spacing: -0.03em` |
| Code / terminal / logs | **JetBrains Mono** (variable) | 400 / 600 | 13 px / 1.5 (terminal), 12 px (logs) |

- Chiffres tabulaires (`font-variant-numeric: tabular-nums`) dans les logs, tailles de fichiers, horloge.
- Le nom du jeu s'écrit **Kernel_Panic** ; logotype en Geist 700 avec l'underscore en `--kp-cyan` qui clignote (1 Hz, désactivé en reduced-motion).

## 4. Espacements, rayons, élévation

- Grille de **4 px** : `--kp-space-1..8` = 4, 8, 12, 16, 20, 24, 32, 48.
- Rayons : `--kp-radius-s: 6px` (boutons, champs), `--kp-radius-m: 10px` (fenêtres, cartes), `--kp-radius-l: 16px` (dock, modales).
- Élévations :
  - `--kp-shadow-1` : `0 1px 0 rgba(255,255,255,.03) inset, 0 4px 12px rgba(0,0,0,.35)`
  - `--kp-shadow-2` (fenêtre) : `0 1px 0 rgba(255,255,255,.04) inset, 0 18px 48px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)`
  - `--kp-shadow-focus` : `0 0 0 1px var(--kp-cyan-dim), 0 0 32px -8px rgba(62,230,245,.35)`
- Verre : `background: rgba(12,16,22,.72); backdrop-filter: blur(18px) saturate(140%)`.

## 5. Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `--kp-ease` | `cubic-bezier(.2,.8,.2,1)` | Défaut |
| `--kp-dur-fast` | `120ms` | Hover, press |
| `--kp-dur` | `200ms` | Ouverture fenêtre (scale .96→1 + fade), menus |
| `--kp-dur-slow` | `420ms` | Notifications, transitions narratives |

Ouverture de fenêtre : depuis l'icône du dock (transform-origin). Fermeture : 140 ms, fade + scale .98. Tout est coupé sous `prefers-reduced-motion: reduce`.

## 6. Composants

### 6.1 Fenêtre
- Barre de titre 36 px, `--kp-bg-3`, titre centré Geist 500 12.5 px `--kp-text-1` (active : `--kp-text-0`).
- Contrôles **à gauche** : 3 pastilles 12 px *monochromes* (`--kp-bg-4`), qui prennent leur couleur au survol du groupe (fermer = rouge, réduire = ambre, agrandir = vert). Évite le clin d'œil macOS trop littéral.
- Bordure 1 px `--kp-line` ; active : `--kp-line-strong` + liseré supérieur cyan 1 px à 40 %.
- Fenêtre inactive : contenu à 100 %, seule la chrome s'atténue.

### 6.2 Barre des tâches (48 px, en bas)
Verre, bordure haute `--kp-line-strong`. De gauche à droite :
- **Lanceur** `KP_` (underscore cyan clignotant) → menu d'applications : recherche (apps + fichiers du home), grille d'apps, emplacements, pied avec l'utilisateur et les actions (aide, paramètres, sauvegarder, quitter, recommencer). Touche Windows / Alt+F1.
- **Apps épinglées** : icônes 40 px ; indicateur 3 px sous l'icône (gris = ouverte, cyan + lueur = active).
- **Fenêtres ouvertes** : un bouton par fenêtre (icône + titre, 190 px max), soulignement cyan pour la fenêtre active, opacité réduite si minimisée. Clic droit : réduire, agrandir, ancrer, fermer.
- **Zone de notification** : pastille objectifs (violet), centre de notifications (badge cyan), son, réseau, horloge (heure + date de la machine) → calendrier, et une fine bande « afficher le bureau » à l'extrême droite.
Les panneaux (lanceur, calendrier, notifications, réseau) s'ouvrent au-dessus de la barre, rayon L, verre, animation `rise`.

### 6.3 Bureau
Les icônes sont les fichiers de `~/Desktop` + trois icônes système (Dossier personnel, Corbeille, Dossier d'enquête). Grille de 96 × 102 px, tuile 50 px rayon 13 px, libellé 11.5 px sur 2 lignes (4 si sélectionné) avec ombre portée. Sélection : fond `--kp-cyan` 12 % + bordure 28 %. Cible de dépôt : violet. Élément coupé ou caché : opacité 55 %. Lasso : bordure cyan 70 %, fond 10 %. Lanceurs `.desktop` en cyan.

### 6.3b Menu contextuel
220 px min, verre opaque à 96 %, rayon M, éléments 28 px avec icône 14 px, raccourci en mono `--kp-text-2`, séparateurs `--kp-line`, sous-menus à droite (ou à gauche près du bord). Élément dangereux en rouge, survol `--kp-red-dim`. Clavier : ↑ ↓ Entrée Échap.

### 6.3c Ancrage des fenêtres
Glisser une fenêtre contre un bord : aperçu (bordure cyan 55 %, fond 8 %) puis moitié d'écran ; contre le haut : plein écran. Traîner une fenêtre ancrée la décroche sous le curseur.

### 6.4 Boutons
| Variante | Style |
|---|---|
| Primary | fond `--kp-cyan`, texte `--kp-bg-0`, 600 |
| Secondary | fond `--kp-bg-4`, bordure `--kp-line`, texte `--kp-text-0` |
| Ghost | transparent, texte `--kp-text-1`, hover `--kp-bg-4` |
| Danger | texte `--kp-red`, bordure `--kp-red-dim` |
Hauteur 28 px (compact) / 32 px. Focus clavier : `--kp-shadow-focus` toujours visible.

### 6.5 Listes & tableaux (Files, Mail, Logs)
Lignes 28 px, zébrage *non*, séparateurs `--kp-line`, sélection `--kp-cyan-dim` + barre gauche 2 px cyan. Colonnes de métadonnées en mono 12 px `--kp-text-2`.

### 6.6 Badges
Mono 10.5 px capitales, padding 2×6, fond `-dim`, texte accent. Ex. `HIDDEN` (violet), `ROOT` (ambre), `NEW` (cyan), `DONE` (vert).

### 6.7 Notifications (toasts)
En haut à droite, 340 px, verre, icône accent à gauche, titre 600 + corps 12.5 px. Les notifications narratives (objectif) ont un liseré violet.

### 6.8 Terminal
Pas de chrome supplémentaire. Padding 12 px. Prompt :
```
elias@ws-varga:~/Documents$
```
`user@host` en vert, `:` neutre, chemin en cyan, `$` (ou `#` en rouge pour root) neutre.

### 6.9 Son
Synthétisé en WebAudio (`apps/game/src/lib/os/sound.svelte.ts`), aucun fichier audio. Volume très bas, enveloppes courtes (< 250 ms, sauf la fin de scénario). Un son par type de toast : `notify` (bip sinus), `mail` (deux notes montantes), `objective` (arpège triangle), `success`, `error` (deux notes graves, carré atténué), `end` (arpège long). Quand plusieurs toasts arrivent ensemble, seul le premier est joué (fenêtre de 400 ms). Bouton muet dans la top bar, mémorisé par navigateur.

### 6.10 Aide « Premiers pas »
Panneau flottant non bloquant (verre, liseré cyan à gauche), affiché une seule fois au premier bureau puis réouvrable (menu KP, Ctrl+Alt+H). Rôle de chaque app en une phrase + raccourcis clavier.

### 6.11 Écran de session
Fond d'écran de l'utilisateur (voile flou par-dessus le bureau en mode verrouillé), heure en Geist 200 très grande (64–120 px), date en toutes lettres, avatar 76 px violet avec halo, champ mot de passe en pilule (bouton rond cyan), lien « accès forensique (SOC) » en pilule cyan translucide. Erreur : secousse + texte rouge ; succès : contour vert.

### 6.12 Navigateur
Chrome sombre (barre d'adresse en pilule, cadenas vert en HTTPS, ambre sinon, icône fichier en `file://`), barre de favoris, mais **la page elle-même garde son propre style** (fond blanc d'un intranet, typo d'un média) : c'est un autre monde dans la machine. Pages d'erreur dans le style NOCTIS avec icône par cause (DNS, délai, blocage rouge).

### 6.13 Messages
Liste de contacts avec avatars à teinte stable (dérivée de l'identifiant), badge non lu cyan. Bulles : interlocuteur à gauche (`--kp-bg-3`), vous à droite (cyan 14 %). Séparateur de date en pilule. Indicateur de saisie à trois points avant chaque nouveau message de PNJ. Réponses à choix en cartes ; verrouillées (cadenas) s'il manque une pièce.

## 7. Iconographie
Jeu d'icônes maison au trait (24 px de grille, stroke 1.5, coins arrondis), inspiré de Lucide, stocké dans `apps/game/src/lib/desktop/icons.ts`. Les types de fichiers ont une icône + une teinte : dossier (text-1), texte (text-1), mail (cyan), image (violet), log (amber), script (green), caché (opacité 55 %).

## 8. Fond d'écran
Dégradé radial très sombre (`#0d1420` → `#05070b`), grain (SVG noise à 4 %), une grille isométrique à 3 % et une lueur cyan/violette diffuse hors champ. Animation : dérive très lente de la lueur (60 s), désactivée en reduced-motion.

## 9. Accessibilité
- Contraste texte principal ≥ 12:1, secondaire ≥ 7:1 sur `--kp-bg-1` ; tertiaire ≥ 4.5:1 sur **toutes** les surfaces (`--kp-bg-0` à `--kp-bg-4`, mesuré : 4.58:1 au pire, sur les champs). Seuls les numéros de ligne décoratifs (Logs) descendent en dessous.
- Navigation clavier complète dans les apps, focus visible, `aria-label` sur les contrôles iconiques.
- Le sens n'est jamais porté par la couleur seule (badges textuels, icônes).
- Option « Lisibilité » (Paramètres, phase 2) : +2 px, désactivation du grain et du glow.

## 10. Ton éditorial de l'UI
Sobre, technique, en français pour l'interface du jeu ; les artefacts in-world (logs, en-têtes, man pages) restent dans la langue réaliste de la machine (anglais). Messages d'erreur fidèles à Unix.

## 11. Source de vérité
Les tokens vivent dans `apps/game/src/lib/styles/tokens.css` et sont recopiés dans `apps/site/src/styles/tokens.css`. Toute modification passe par l'agent **Design System** et se reporte dans ce document.
