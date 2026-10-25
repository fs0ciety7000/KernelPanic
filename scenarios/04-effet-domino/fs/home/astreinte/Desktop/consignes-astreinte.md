# Astreinte nuit — Valmobilis (prestataire Ironveil)

Premier tram : **05:00** (ligne A, dépôt nord). Avant ça, tout doit tourner.

## Systèmes

| Machine | Rôle | Si on l'isole |
|---|---|---|
| srv-sae | Aide à l'exploitation (positions des trams, radio) | plus aucun tram ne peut partir |
| srv-billet | Billettique (valideurs, distributeurs) | les voyageurs ne peuvent plus acheter de titre |
| srv-info | Panneaux d'information voyageurs | écrans noirs en station |
| pc-depot-nord / sud | Postes des dépôts (prise de service) | prise de service sur papier |
| srv-deploy | Outil de déploiement « rollout » | plus de déploiement… ni de retour arrière |

## Réflexes

- Qualifier chaque alerte avant d'agir (Console SOC).
- **Isoler est définitif jusqu'au matin.** On isole ce qui menace les autres, pas ce qui souffre.
- Un déploiement qui part en vrille se **met en pause** (`rollout pause`), puis se **défait** (`rollout rollback`).
- Accès : `ssh astreinte@srv-deploy` (clé autorisée). Mot de passe sudo dans le mail de prise de poste.
