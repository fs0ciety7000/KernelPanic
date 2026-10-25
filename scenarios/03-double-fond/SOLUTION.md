# Double fond — solution complète (spoilers)

Scénario avancé, environ 50 minutes, trois machines.

| Machine | Adresse | Accès du joueur |
|---|---|---|
| `ws-audit-02` | 10.40.5.12 | session `audit` (mot de passe `Iv-Audit-26`, inutile en pratique) |
| `srv-claims` | 10.40.1.20 | `ssh audit@srv-claims` : clé `~/.ssh/id_ed25519` autorisée ; sudo avec `Orb1s-Audit-0608` |
| `srv-backup` | 10.40.1.30 | joignable **uniquement depuis srv-claims**, via la clé de service `/opt/claims/keys/backup_ed25519` (groupe `adm`) |

## Ce qui s'est passé

| Date | Événement | Où le voir |
|---|---|---|
| 12/05 03:40 | Incendie de l'entrepôt Delcourt (deux foyers, essence) | rapport d'expertise (zip chiffré, srv-backup) |
| 01/06 15:31 | Rapport Lazare reçu et archivé chiffré | app.log, `/srv/backups/documents` |
| 02/06 21:14 | Christophe Delcourt écrit à son cousin Fabien Marchal (DBA) : « arrange » le statut, 10 % | `/var/mail/fmarchal` (srv-claims, root) |
| 03/06 14:02 | Julie Ruiz **refuse** le dossier | sauvegarde `logs-2026-06-03_2000.tgz` |
| 03/06 20:00 | Sauvegarde des journaux, encore intacts | srv-backup |
| 03/06 23:39 | Connexion de fmarchal | `auth.log` (srv-claims) |
| 03/06 23:41 | `claimsctl set-status … APPROUVE --as jruiz --at "14:02" --force` | `auth.log` |
| 03/06 23:42 | `claimsctl purge-events` : l'historique du dossier est vidé | `auth.log`, `claimsctl history` |
| 03/06 23:44 | `vi /var/log/claims/app.log` : la ligne de 14:02 est réécrite (REFUSE → APPROUVE), le courrier de refus supprimé | `auth.log` + `diff` des sauvegardes |
| 03/06 23:47 | `rm -f ~/.bash_history` | `auth.log` |
| 04/06 02:00 | La base sauvegardée montre APPROUVE « jruiz 14:02 » | `claims-db-2026-06-04_0200.tgz` |
| 04/06 09:14 | Ordre de paiement en batch, contrôle R-12 désactivé | app.log |
| 05/06 10:03 | Virement de 2,4 M€ | app.log |

## Chemin optimal

```bash
# 1. Mail de mission (Hélène Vasseur), puis :
ssh audit@srv-claims                          # clé déjà autorisée
cat /opt/claims/README
claimsctl show SIN-2026-0412                  # → objectif « version officielle » : jruiz
grep 0412 /var/log/claims/app.log

# 2. Atteindre srv-backup
cat /etc/cron.d/claims-backup
cat /opt/claims/scripts/nightly-backup.sh     # KEY=/opt/claims/keys/backup_ed25519
ssh -i /opt/claims/keys/backup_ed25519 svc-backup@srv-backup

# 3. Le rapport d'expertise (mot de passe : convention donnée par Julie dans Messages)
cd /tmp && unzip /srv/backups/documents/rapport-expertise-SIN-2026-0412.zip   # sin20260412
cat rapport-expertise-SIN-2026-0412.txt        # → « volontaire »

# 4. Les deux versions du journal
mkdir /tmp/j3 /tmp/j4
tar -xzf /srv/backups/claims/logs-2026-06-03_2000.tgz -C /tmp/j3
tar -xzf /srv/backups/claims/logs-2026-06-04_2000.tgz -C /tmp/j4
diff /tmp/j3/claims/app.log /tmp/j4/claims/app.log   # → « REFUSE » devient « APPROUVE »
exit

# 5. Qui, quand, pourquoi (de retour sur srv-claims)
grep sudo /var/log/auth.log                    # → fmarchal, 23:44
sudo cat /var/mail/fmarchal                    # → le cousin, 10 %
```

Réponses : `jruiz`, `volontaire`, `refusé`, `fmarchal`, `23:44`.

## Pièces et fins

| Pièce | Déclencheur |
|---|---|
| La version officielle | lire `app.log` ou `claimsctl show` (srv-claims) |
| La règle R-12 contournée | lire `/opt/claims/README` (srv-claims) |
| Le rapport de l'expert | `unzip` réussi du rapport (n'importe quelle machine) |
| Deux nuits, deux statuts | `tar` sur une sauvegarde `claims-db-2026-06-03/04` |
| Le journal d'origine | `tar`/`zcat` sur `logs-2026-06-03_2000.tgz` |
| La nuit du 3 juin | lire `auth.log` de srv-claims |
| L'historique purgé | `claimsctl history SIN-2026-0412` |
| Le cousin | `sudo cat /var/mail/fmarchal` |

| Choix final | Pièces requises | Fin |
|---|---|---|
| Julie Ruiz a validé | La version officielle | **La mauvaise signature** (piège : c'est ce que dit l'application) |
| Fabien Marchal a falsifié | Journal d'origine + Nuit du 3 juin | **Le faussaire** |
| Marchal au profit de Delcourt, contre 10 % | + Le cousin | **Double fond** (meilleure fin) |
| Impossible de conclure | — | **Classé sans suite** |

Le rapport peut être rendu dès que l'application et l'expert ont parlé : rien n'empêche de conclure trop tôt, comme dans *Orwell*.

## Messagerie

- **Julie Ruiz** donne la convention de mot de passe des pièces jointes dès que vous êtes sur srv-claims, et peut nommer l'administrateur de la base. Avec la pièce *Le journal d'origine*, vous pouvez lui annoncer qu'elle est blanchie.
- **Yasmine** réagit à un premier refus de srv-backup (indice sur la clé de service) et rappelle d'extraire dans `/tmp` avant de comparer.

## Variantes testées

- Extraire le rapport sur le poste après `scp` (srv-backup → srv-claims → ws-audit-02) : la pièce est créditée.
- `ssh srv-backup` depuis le poste : délai dépassé (réseau de sauvegarde).
- Sauvegarde/chargement : les fichiers créés sur les serveurs distants sont conservés.
