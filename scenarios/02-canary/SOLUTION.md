# Canary — Solution (SPOILERS)

> Document auteur. Référence des tests : `packages/scenario-kit/test/canary.test.ts`.

## Pitch
Aqualis distribue l'eau de Valmont. Les analyses PFAS du T1 à Saint-Ambroise dépassaient le seuil (jusqu'à 0,31 µg/L pour 0,1). Sur ordre du directeur d'usine **Arnaud Ferrand**, avec l'aval du directeur juridique **Laurent Sorel**, le responsable du labo **Samir Rahmani** a produit une version « validée » conforme, en changeant de méthode. La technicienne **Margaux Lefort** a imprimé les résultats bruts et les a remis à la journaliste Clara Monteil (*Le Veilleur*).
Sorel, le client du joueur, est donc lui-même impliqué. Il veut un nom, pas la vérité.

Inspiration *Orwell* : le joueur rassemble des pièces dont certaines se contredisent, puis choisit ce que son rapport transmet. Il y a quatre fins, et aucune n'est un « game over ».

## Chronologie (+02:00)

| Quand | Quoi | Où le voir |
|---|---|---|
| 03/03 | Prélèvements T1 Saint-Ambroise | CSV, carnet de Margaux |
| 20/03 16:12 | Export `STA_PFAS_T1_ORIGINAL.csv` (5/8 non conformes, max P4 0,31) | `/srv/lims/exports` (mtime) |
| 02/04 09:40 | Ferrand → Samir : « repasse le T1 sous 0,1 […] validé par L. Sorel » | Maildir de srahmani |
| 02/04 10:25 | Samir : « je garde les résultats bruts, et ce mail » | `.Sent` de srahmani |
| 08/04 11:47 | Export `…_VALIDE.csv` (méthode composite rév. B, tout conforme) | `/srv/lims/exports` |
| 06/05 22:47 | Badge Margaux (entrée) | `accesslog --date 2026-05-06` |
| 06/05 22:51 | Session mlefort | `auth.log` |
| 06/05 22:57–22:59 | Ouvre le PDF, l'**imprime (14 p.)**, vide la corbeille | `syslog`, `cups/page_log` |
| 06/05 23:00 | Fin de session mlefort ; badge Samir (entrée) | `auth.log`, `accesslog` |
| 06/05 23:02–23:31 | Session srahmani : **clé USB Kingston**, copie des CSV + des mails (son « assurance ») | `syslog` (udisks), `.bash_history` |
| 06/05 23:19 | Carnet de Margaux : « je l'ai imprimé […] je le donne à C.M. vendredi » | `~mlefort/.notes/.journal.md` |
| 12/05 | Article du *Veilleur* (« document de 14 pages, remis imprimé ») | `~/Documents` du joueur |
| 13/05 09:30 | Début de partie | — |

## Chemin
1. **briefing** : ouvrir le mail de Sorel, qui donne le mot de passe `Aud1t-QA-0513`.
2. **root** : `sudo …`. Les homes sont en 0700 et `/var/log/cups` est réservé à root.
3. **document** : `sudo cat /var/log/cups/page_log` → `STA_PFAS_T1_ORIGINAL.pdf`. On peut aussi recouper l'article et les exports LIMS. Sorel envoie alors une relance (« la qualité des analyses n'est pas votre sujet »).
4. **max-value** : `sudo sort -t, -k4 -n /srv/lims/exports/STA_PFAS_T1_ORIGINAL.csv | tail -1` → `0.31`.
5. **night** : `auth.log` dans Logs, ou `accesslog --date 2026-05-06`. Le mail anonyme « canary » arrive et pointe vers la boîte de Samir.
6. **verdict** : décision définitive (voir ci-dessous).

Bonus : **motive** (le mail de Ferrand, via `sudo grep -rl Ferrand /home/srahmani/Maildir`) et **why** (le carnet caché de Margaux, via `sudo ls -la /home/mlefort`).

## Décisions et fins

| Option | Pièces requises | Fin |
|---|---|---|
| Nommer Margaux | `print-log` + `sessions` | **Le prix du silence** : elle est poursuivie, les puits restent ouverts. |
| Accuser Samir | `usb-copy` (pièce trompeuse) | **Le mauvais nom** : il est licencié, la vérité ressort quand même, le joueur est attaqué. |
| Saisir l'ARS | `original-results` + `order-mail` | **En pleine lumière** : enquête sanitaire, puits fermés, Ferrand et Sorel mis en examen, personne n'est nommé. |
| Rapport non concluant | — | **Brouillard**. |

## Pièges volontaires
- La copie USB de Samir a lieu la même nuit et vise les mêmes fichiers. C'est la pièce trompeuse : il se protégeait, il n'a rien divulgué. Rien dans la machine ne relie Samir à la journaliste, alors que l'article parle d'un document **imprimé**.
- Le client (Sorel) est nommé dans l'ordre de falsification. La relance et le mail « canary » invitent le joueur à se demander pour qui il travaille.
- Le compte d'audit voit tout, mais les apps graphiques (Fichiers, Mail) respectent les droits : les dossiers des techniciens ne s'ouvrent qu'au terminal avec `sudo`.

## Navigateur et messagerie

- **aqualis.fr/qualite** : les résultats publiés (tous < 0,1 µg/L, « rév. B ») — ce sont les chiffres « validés ».
- **leveilleur.fr** : l'article en ligne, qui précise que le document a été « remis sous forme imprimée ».
- **Historique** : le compte d'audit a déjà consulté l'article et la page qualité le 12/05.
- **Samir Rahmani** écrit dès que vous êtes root ; il élude la nuit du 6 mai. Après la lecture de son mail (pièce *L'ordre*), une réponse se débloque avec *Les relevés originaux* et *La clé USB de Samir* : il explique pourquoi il a gardé les originaux et qu'il n'a rien donné à la presse (drapeau d'ambiance `samir-confided`, sans effet sur les fins).
- **Laurent Sorel** met la pression après « La nuit du 6 mai » et recadre si vous évoquez le risque sanitaire.
