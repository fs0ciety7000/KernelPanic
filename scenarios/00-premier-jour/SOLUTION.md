# Premier jour — Solution (SPOILERS)

> Document auteur. Ne pas publier. Sert de référence au test (`packages/scenario-kit/test/premier-jour.test.ts`).

## Pitch
Tutoriel. Le joueur est une **nouvelle recrue DFIR** chez **Ironveil** (cabinet de réponse à
incident, Valmont — même ville que Ghost Shift, mais 11 jours plus tôt). Lundi 6 avril 2026,
9 h, premier jour. Sa mentore **Yasmine Haddad** lui a préparé une VM d'entraînement jetable,
`training-01`, avec un mini-incident bidon monté par un ancien stagiaire, **Léo Marchand**
(parti le 3 avril). Pas de vrai drame : l'objectif est d'apprendre les 6 apps et `sudo` en les
utilisant, guidé pas à pas par les mails de Yasmine.

L'« incident » : Léo a laissé le mot de passe d'un compte de service **en clair** dans la config
de l'appli LedgerLite, et une **connexion de test depuis l'extérieur** (`198.51.100.23`, un
samedi soir) traîne dans le journal d'accès. Tout est faux ; seuls les réflexes sont vrais.

## Chronologie (Europe/Paris, +02:00)

| Quand | Quoi | Où le voir |
|---|---|---|
| Ven 03/04 16:40 | Léo compile/déploie LedgerLite (codename IRONLEDGER-0.4) | `strings /opt/ledgerlite/bin/ledgerlited`, `access.log` |
| Ven 03/04 16:58 | `settings.ini` écrit avec `deploy_password = Printemps2026!` en clair | `/opt/ledgerlite/config/settings.ini` (mtime) |
| Ven 03/04 17:02 | Léo laisse une copie cachée de la config dans le home | `~/.ledgerlite/settings.ini.bak` (mtime) |
| Ven 03/04 17:05 | Jeton de validation déposé (root only) | `/etc/ironveil/lab.key` |
| Ven 03/04 17:20 | Mail d'adieu de Léo | Mail › Réception (lu) |
| **Sam 04/04 23:13:50** | **REJECT** deploy depuis `198.51.100.23` (mauvais mdp) | `/var/log/lab/access.log` |
| **Sam 04/04 23:14:07** | **ACCEPT** deploy depuis `198.51.100.23` (la connexion « suspecte ») | `access.log`, `ledgerlite.log` |
| Dim 05/04 22:14 | Léo prend une capture du tableau de bord | `~/Pictures/capture-ledgerlite.svg` (EXIF) |
| Lun 06/04 04:00 | Reset nocturne de la VM (snapshot propre) | `/var/log/syslog` |
| Lun 06/04 08:50 | Mail de bienvenue de Yasmine | Mail › Réception (non lu) |
| Lun 06/04 09:00 | Début de partie (session recrue) | `/var/log/auth.log` |

Cohérence : tous les `mtime`, en-têtes de mails et lignes de log pointent sur cette fenêtre
03 → 06 avril. Le mot de passe de session (`IronveilLab6`) est donné par Yasmine, jamais trouvé.

## Chemin principal (≈ 10–12 min)

Chaque objectif est déverrouillé par le précédent ; Yasmine envoie un mail-guide à chaque étape.

1. **bienvenue** — ouvrir le mail de Yasmine (`mail.open`, Message-ID `welcome-0006.yh@ironveil.fr`).
   L'app Mail est ouverte au démarrage.
2. **ticket** — « Afficher la source » du mail → en-tête `X-Ironveil-Ticket: IV-2026-0006`.
   → réponse `IV-2026-0006`. *2e chemin :* `~/Documents/onboarding.md`. → livre le mail 02.
3. **cache** — fichier caché `~/.ledgerlite/settings.ini.bak` (bouton « Cachés » / `ls -a`).
   Trigger `fs.read`. *2 chemins :* app Fichiers (double-clic → Notes) ou `cat`. → mail 03.
4. **mot-de-passe** — `grep -i password /opt/ledgerlite/config/settings.ini` (ou le `.bak`) →
   `deploy_password = Printemps2026!`. → réponse `Printemps2026!`. → mail 04.
5. **connexion** — app Logs › `/var/log/lab/access.log`, filtre « Connexions »/« Échecs », ligne
   du 04/04 23:14 → `198.51.100.23`. *2 chemins :* Logs ou `grep ACCEPT …`. → réponse
   `198.51.100.23`. → mail 05.
6. **capture** — app Images › `capture-ledgerlite.svg` › panneau Infos › EXIF `DateTimeOriginal`
   `2026:04:05`. *2 chemins :* Images ou `exiftool …`. → réponse `2026-04-05`. → mail 06.
7. **droits-root** — `cat /etc/ironveil/lab.key` → « Permission denied ». Puis
   `sudo cat /etc/ironveil/lab.key` (mot de passe de session `IronveilLab6`, donné au mail 01).
   Trigger `auth.sudo ok`. Le fichier root devient lisible. → mail 07.
8. **valider** — le fichier contient `SVZMQUItN0YzQQ==` (base64). `echo SVZMQUItN0YzQQ== | base64 -d`
   → `IVLAB-7F3A`. Puis `trainingctl submit IVLAB-7F3A` (commande maison, groupe `ironveil`) →
   flag `lab-submitted`. → mail 08.
9. **rapport** — décision finale (dans le Dossier), deux options :
   - *sobre* (sans prérequis) → fin **sobre** (par défaut).
   - *reunion* (exige les pièces `ev-config` + `ev-login`) → flag `alarme-reunion` → fin **zele**.

## Bonus
- **bonus-codename** : `strings /opt/ledgerlite/bin/ledgerlited` (un binaire ne se lit pas avec
  `cat`) → `codename: IRONLEDGER`. Trigger `cmd.exec`/`strings`. +150 au score.

## Pièces à conviction (Dossier › Pièces)
| id | Fait | Source | Déclencheur |
|---|---|---|---|
| `ev-config` | mot de passe en clair | `settings.ini` (ou `.bak`) | lecture du fichier **ou** `grep deploy_password` |
| `ev-login` | connexion 198.51.100.23, 04/04 23:14 | `access.log` | lecture du log **ou** `grep 198.51.100.23` |
| `ev-capture` | capture EXIF 2026:04:05 | `capture-ledgerlite.svg` | ouverture Images **ou** `exiftool` |
| `ev-key` | jeton base64 root-only | `/etc/ironveil/lab.key` | lecture (via `sudo`) |

Les deux pièces `ev-config` + `ev-login` conditionnent l'option « réunion » du choix final :
on ne dramatise qu'avec des preuves en main.

## Fins
- **zele** — flag `alarme-reunion` (option *reunion*). Le joueur débarque en réunion pour un
  faux incident ; Yasmine, amusée, salue l'énergie. Fin 1/2.
- **sobre** — sans condition (défaut). Rapport propre, une ligne, une source. Fin 2/2.

`outro` reste le repli si aucune fin ne correspond.

## Table des indices (3 paliers : orientation → méthode → quasi-solution)
| Objectif | Palier 1 | Palier 2 | Palier 3 |
|---|---|---|---|
| bienvenue | app Mail ouverte au boot / dock | cliquer la pastille non-lu | — |
| ticket | « Afficher la source » | ligne `X-Ironveil-Ticket:` | aussi dans `onboarding.md` — `IV-2026-0006` |
| cache | fichiers en `.point`, bouton Cachés / `ls -a` | dossier `.ledgerlite` | `cat ~/.ledgerlite/settings.ini.bak` |
| mot-de-passe | config dans `/opt/ledgerlite/...` | `grep -i password …` | `deploy_password = Printemps2026!` |
| connexion | Logs › `access.log` | filtres / recherche, samedi 23 h | ligne ACCEPT 23:14 — `198.51.100.23` |
| capture | Images › panneau Infos | champ `DateTimeOriginal` | `exiftool …` — 2026-04-05 |
| droits-root | mot de passe dans le mail 01 | `sudo cat /etc/ironveil/lab.key` | mot de passe `IronveilLab6` |
| valider | `sudo cat` le jeton base64 | `echo … | base64 -d` | `trainingctl submit IVLAB-7F3A` |
| bonus | `strings` lit un binaire | `strings /opt/ledgerlite/bin/ledgerlited` | — |

## Garde-fous / réalisme
- IP de documentation (`198.51.100.23`, `203.0.113.10`), domaines fictifs `*.ironveil.fr` /
  `*.lab.ironveil.local`. Aucun vrai exploit : juste un mot de passe en clair, un compte de
  démo `admin/admin`, un log d'accès. C'est un lab explicitement jetable (reset nocturne).
- Mot de passe de session **donné** (jamais à deviner) : le but est d'enseigner `sudo`, pas de
  piéger. Les réponses attendues sont hachées dans le bundle (aucun spoil lisible).
- Bruit modéré (tutoriel) : mail d'adieu de Léo, newsletter café, invitation au point d'équipe,
  photo d'équipe, antisèche de commandes, charte du lab — ils humanisent sans égarer.

## Bonus — navigateur et messagerie

- **Bonus — ouvrir le navigateur** : globe de la barre des tâches → favori « Aide-mémoire » (`lab.ironveil.local/wiki/aide-memoire`).
- **Bonus — répondre à Yasmine** : après l'objectif « ticket », Yasmine écrit dans Messages ; choisir l'une des deux réponses valide le bonus.
