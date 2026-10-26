# Effet domino — solution complète (spoilers)

Scénario intermédiaire, en direct : l'heure de jeu démarre à 04:15, le premier tram part à 05:00. Il n'y a pas d'attaquant : une mise à jour de configuration non recettée se propage de machine en machine.

## Ce qui se passe si on ne fait rien

| Heure | Événement |
|---|---|
| 04:02 | `tdumas` lance JOB-0914 (horaires-v2.0.0) avec `--skip-canary --force` |
| 04:15 | srv-info défaillant (alerte haute) |
| 04:20 | srv-billet |
| 04:25 / 04:30 | pc-depot-nord, pc-depot-sud |
| 04:40 | srv-sae : plus aucun départ possible (alerte critique, message de Karim) |
| 04:45 | Karim : « premier départ dans 15 minutes » |
| 05:00 | Si rien n'a été réparé : alerte « le premier tram ne peut pas partir », flag `first-tram-late` |

La propagation s'arrête si : le job est en pause (`job-paused`), le miroir de l'éditeur 198.51.100.40 est bloqué au pare-feu, srv-deploy est isolé, ou la cible suivante est isolée.

## Chemin optimal

1. Mail de Karim → Console SOC (ouverte au démarrage) : alerte srv-info → **Incident**.
2. `ssh astreinte@srv-deploy` (clé autorisée), `cat /opt/rollout/README`, `rollout status`.
3. `sudo rollout pause JOB-0914` (mot de passe `Astr31nte-0914`) → la chute s'arrête **sans isoler personne** (bonus).
4. `sudo rollout rollback JOB-0914` → toutes les machines atteintes reviennent saines, le compte à rebours disparaît.
5. `rollout diff JOB-0914` → réponse `refresh_interval_ms`. `rollout log JOB-0914` → réponse `tdumas`.
6. `cat /var/log/rollout/approvals.log` (accord « par téléphone » saisi par tdumas lui-même), `sudo cat /var/mail/tdumas` (l'ordre de Pascal Lagarde, 23:48).
7. Rapport : « Le déploiement a été imposé par Pascal Lagarde… » → **Premier tram**.

## Les pièges

- **Isoler srv-sae** pour le « protéger » : aucun tram ne peut partir → **Trams à l'arrêt** (prioritaire sur toutes les autres fins).
- **Isoler srv-deploy** : la chute s'arrête, mais l'outil de retour arrière devient injoignable (`No route to host`) → 05:00 sans réparation → **Retard à l'allumage**.
- **Bloquer le miroir** de l'éditeur : arrête aussi la propagation et laisse srv-deploy joignable ; il faut quand même mettre le job en pause pour pouvoir le défaire.
- L'alerte « pic de trafic sortant vers 198.51.100.40 » n'est pas une attaque : c'est rollout qui télécharge son paquet. La bloquer est pourtant une bonne idée.

## Pièces et fins

| Pièce | Déclencheur (srv-deploy) |
|---|---|
| Le job de 04:02 | `rollout log JOB-0914` ou `jobs.log` |
| La valeur oubliée | `rollout diff JOB-0914` ou `tar` sur le paquet v2 |
| L'accord par téléphone | `approvals.log` |
| L'ordre de la veille | `sudo cat /var/mail/tdumas` |

| Rapport | Pièces | Fin (si rien d'autre ne prime) |
|---|---|---|
| Thomas Dumas a déployé sans recette | Le job de 04:02 | **Le fusible** (tone bad) |
| Pascal Lagarde a imposé le déploiement | Job + accord + ordre | **Premier tram** si réparé à temps |
| La procédure PR-07 était contournable | L'accord par téléphone | **Premier tram** si réparé à temps |
| Incident technique, en cours d'analyse | — | **Premier tram** si réparé, sinon **Rapport rendu** |

Ordre de priorité : Trams à l'arrêt > Le fusible > Retard à l'allumage > Premier tram > Rapport rendu.
