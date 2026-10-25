# Mission Orbis — SIN-2026-0412

Prestataire : Ironveil (réponse à incident)
Client : Orbis Assurances, direction de l'audit interne
Contact : Hélène Vasseur (audit interne)

## Périmètre

- ws-audit-02 : ce poste (le mien, rien à chercher ici)
- srv-claims  : serveur de l'application sinistres — ma clé SSH y est autorisée (compte `audit`)
- srv-backup  : sauvegardes nocturnes — **pas joignable d'ici**, seulement depuis srv-claims

## Rappels méthode (Yasmine)

- `ssh audit@srv-claims`, puis on regarde avant de toucher.
- Les journaux mentent parfois. Les sauvegardes, rarement.
- `diff` entre deux versions d'un même fichier vaut mille hypothèses.
- Ce qu'on récupère sur un serveur, on peut le rapatrier ici : `scp`.

## À faire

- [ ] Qui a validé le dossier, d'après l'application ?
- [ ] Que dit le rapport d'expertise ?
- [ ] Les sauvegardes racontent-elles la même histoire ?
