# Runbook — lumenctl (déploiements firmware OT)

> Propriétaire : Elias Varga · Dernière revue : 2026-03-02 · Classification : INTERNE OT

## 1. Rappels

- `lumenctl` parle à la passerelle **ot-deploy.lumengrid.local**. Il faut être dans le groupe `lumen-ops`.
- Toute image doit figurer dans `/opt/lumen/firmware/MANIFEST.sha256` (images signées Lumen Systems AG).
- Les déploiements se planifient **hors pointe** (22:00 – 05:00). Jamais en journée.

## 2. Commandes courantes

```
lumenctl status              # état de la file
lumenctl show <JOB>          # détail d'un job (image, signature, cible)
sudo lumenctl queue ...      # planifier (root)
```

## 3. Procédure d'urgence — annuler un déploiement planifié

En cas de job suspect ou erroné (validation N+1 obligatoire a posteriori) :

1. Vérifier le job : `lumenctl show <JOB>`
2. Récupérer le **jeton d'override opérateur**. Il est stocké sur chaque poste OT dans
   `/etc/lumen/override.key` (lisible **uniquement par root**, rotation trimestrielle par la RSSI).
3. Annuler :

```
sudo lumenctl abort <JOB> --token <OVERRIDE_TOKEN>
```

4. Prévenir le SOC (soc@lumengrid.fr, poste 4400) et Nadia Kessler.

⚠️ Le jeton ne doit **jamais** être copié hors du poste.
