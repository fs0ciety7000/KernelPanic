# Ghost Shift — Solution (SPOILERS)

> Document auteur. Ne pas publier. Sert de référence aux tests (`packages/scenario-kit/test/ghost-shift.test.ts`).

## Pitch
Lumen Grid, opérateur électrique de Valmont. À 03:12, le compte de l'admin OT **Elias Varga** programme `JOB-0417` : un firmware non signé sur 14 sous-stations, exécution 09:00. Elias est en congé, innocent : il a été **phishé** la veille et réutilise son mot de passe partout. L'attaquant, **kade**, veut ouvrir tous les disjoncteurs de la ville à 09:30.

## Chronologie (Europe/Paris, +02:00)

| Quand | Quoi | Où le voir |
|---|---|---|
| 13/04 | Réunion : Nadia alerte sur une campagne de phishing ciblant les énergéticiens | `~/Documents/notes/reunion-2026-04-13.md` |
| 14/04 09:03 | Tomás : « change ton mdp, je le devine en 5 min avec ce qui traîne sur ton bureau » | Mail |
| 16/04 18:41:57 | Phishing depuis `mail.k4de-relay.net [185.220.101.47]`, From `support@lumengr1d.com` | Mail (source), en-têtes `Received`, `X-Originating-IP` |
| 16/04 18:57 | Elias répond « c'est fait… c'est le même que ma session » | Mail › Envoyés |
| 16/04 19:24 | Elias se déconnecte, part en congé | `auth.log`, `wtmp`, `.bash_history` (mtime) |
| 17/04 02:41–02:43 | Tentatives SSH `admin`, `root`, `elias` (échec) depuis 185.220.101.47 | `auth.log` |
| 17/04 02:47:12 | **Accepted password for elias from 185.220.101.47** | `auth.log`, `wtmp`/`last` |
| 17/04 02:49:03 | `sudo cat /etc/lumen/override.key` (reconnaissance) | `auth.log` |
| 17/04 02:51:58 | Dépôt de `~/.cache/.sync/sync.sh` | `ls -la ~/.cache` (mtime), Fichiers (cachés) |
| 17/04 02:52:40 | `crontab` REPLACE (elias) : `*/10 * * * * sync.sh` | `syslog`, `auth.log`, `crontab -l` |
| 17/04 02:55:13 | Ajout clé SSH `kade@ghost` | `~/.ssh/authorized_keys` (mtime) |
| 17/04 02:58:31 | Firmware déposé dans `/tmp/.fw/` | `ls -la /tmp`, `lumenctl show JOB-0417` |
| 17/04 03:00 → 08:10 | `sync.sh` exfiltre toutes les 10 min | `syslog` (CRON) |
| 17/04 03:12:05 | `sudo lumenctl queue … --force-unsigned --no-rollback` | `auth.log`, `lumenctl.log`, `syslog` |
| 17/04 03:14:51 | Déconnexion | `auth.log`, `wtmp` |
| 17/04 08:12 | Début de partie | — |

## Chemin principal

1. **briefing** — ouvrir le mail de Nadia Kessler (trigger `mail.open`).
2. **phish** — mail « [IT] Votre mot de passe VPN expire » : domaine `lumengr1d.com` (1 au lieu de i). → réponse `lumengr1d.com`.
3. **intrusion-ip** — Logs › auth.log › filtre « Connexions » ou `grep Accepted /var/log/auth.log` → `185.220.101.47` (aussi : en-têtes du phishing, `last`). → Nadia livre le mail 02 (indice : tâches planifiées).
4. **persistence** — `crontab -l` ou syslog CRON → `cat ~/.cache/.sync/sync.sh` (trigger `fs.read`).
5. **c2** — `E="aHR0cHM6Ly9kcm9wLms0ZGUubmV0L2luZ2VzdA=="` → `echo … | base64 -d` → `https://drop.k4de.net/ingest` → réponse `drop.k4de.net`. → mail 03.
6. **root** — mot de passe d'Elias `Pixel2019` :
   - chemin A : `~/Pictures/bureau.svg` (post-it : « mdp session = VPN, chat + année d'adoption ») + `pixel.svg` (titre « Pixel », EXIF `DateTimeOriginal 2019:03:09`) ; facture croquettes « Pour Pixel » ; todo « croquettes pour Pixel ».
   - chemin B : `~/.bash_history` — Elias a tapé son mot de passe comme commande après `sudo -k` (et son `history -d -2` a supprimé la mauvaise ligne).
   - `sudo -i` ou `sudo <cmd>` → trigger `auth.sudo ok`.
7. **abort** — runbook `~/Documents/procedures/runbook-lumenctl.md` → `sudo cat /etc/lumen/override.key` → `OVR-7Q2K-VX91` → `sudo lumenctl abort JOB-0417 --token OVR-7Q2K-VX91` (flag `job-aborted`). → mail 04.
8. **attribution** — pseudonyme `kade` : domaine `k4de.net`, relais `k4de-relay.net`, clé `kade@ghost`, `strings` du firmware (`build: kade@ghostshift`, `msg=lights out, valmont. -- k`). → mail 05 + fin.

## Bonus
- **backdoor-key** : lire `~/.ssh/authorized_keys` (clé `kade@ghost`).
- **firmware** : `strings` ou `sha256sum` sur `/tmp/.fw/lumen-fw-4.2.1-hotfix.img` (4.2.x n'existe pas, absent de `MANIFEST.sha256` ; `breaker.cmd=OPEN_ALL`, `watchdog=disabled`).

## Pièges volontaires
- Accès SSH ouvert depuis l'extérieur (exception OT-2025-31) : mentionné dans `sshd_config`, la todo, le rapport T1 — c'est la faille d'infrastructure du rapport final.
- `lumenctl abort` sans root → « requires root privileges » ; sans jeton → message d'usage ; mauvais jeton → « attempt logged ».
- `wget`/`curl` vers le C2 → bloqués (egress filtré, domaine sinkholé).
- Exécuter `sync.sh` → bloqué par la politique forensique.
- Les actions `sudo` du joueur sont ajoutées à `/var/log/auth.log` (la machine enregistre aussi l'enquêteur).
