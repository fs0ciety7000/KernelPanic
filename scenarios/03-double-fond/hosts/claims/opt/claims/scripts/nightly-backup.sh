#!/bin/bash
# Sauvegarde nocturne vers srv-backup (réseau 10.40.1.0/24).
# db   : 02:00 — instantané de la base
# logs : 20:00 — journaux applicatifs
set -euo pipefail

KEY=/opt/claims/keys/backup_ed25519
DEST=svc-backup@srv-backup:/srv/backups/claims
STAMP=$(date +%F_%H%M)

case "$1" in
  db)   tar -czf /tmp/claims-db-$STAMP.tgz -C /opt/claims db ;;
  logs) tar -czf /tmp/logs-$STAMP.tgz -C /var/log claims ;;
esac

scp -q -i "$KEY" /tmp/*-$STAMP.tgz "$DEST/"
rm -f /tmp/*-$STAMP.tgz
