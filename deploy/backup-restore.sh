#!/usr/bin/env bash
# =============================================================================
# GNNcab - PostgreSQL backup restore script
# =============================================================================
# Usage:
#   sudo bash deploy/backup-restore.sh [backup-file]
#
# If no backup file is provided, the script lists available backups and
# prompts you to choose one.
#
# DANGER: This DROPS all objects in the target database and restores from
# the backup. It WILL cause downtime. In live production restores, the script
# takes an emergency local backup before continuing.
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gnncab}"
DB_NAME="${DB_NAME:-gnncab}"
DB_OWNER="${DB_OWNER:-gnncab}"
RESTORE_DB="${RESTORE_DB:-$DB_NAME}"
EMERGENCY_BACKUP_CMD="${EMERGENCY_BACKUP_CMD:-/usr/local/bin/gnncab-backup}"
RESTORE_LOG="/tmp/gnncab-restore-$(date +%Y%m%d-%H%M%S).log"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: sudo bash $0 [backup-file]" >&2
  exit 1
fi

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [RESTORE] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_commands() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
  done
}

require_commands find gzip zcat sha256sum psql tee date du sort head grep sudo

echo "========================================================================"
echo "  GNNcab Database Restore"
echo "  Target database : $RESTORE_DB"
echo "  Restore log     : $RESTORE_LOG"
echo "========================================================================"

BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo ""
  echo "Available backups (most recent first):"
  echo "---------------------------------------"
  find "$BACKUP_DIR" -name "*.sql.gz" -printf '%TY-%Tm-%Td %TH:%TM  %s bytes  %p\n' 2>/dev/null \
    | sort -rn | head -20
  echo ""
  read -rp "Enter full path to backup file: " BACKUP_FILE
fi

[[ -f "$BACKUP_FILE" ]] || die "File not found: $BACKUP_FILE"

log "Verifying backup integrity..."
gzip -t "$BACKUP_FILE" || die "Backup file is corrupted (gzip test failed)"

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  sha256sum -c "${BACKUP_FILE}.sha256" || die "SHA-256 checksum verification failed"
  log "Checksum verified OK"
else
  log "WARNING: No checksum file found - proceeding without checksum verification"
fi

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Backup file: $BACKUP_FILE ($BACKUP_SIZE)"

echo ""
echo "  ======================================================================"
echo "  WARNING: This will DESTROY and RECREATE the database '$RESTORE_DB'"
echo "  Stop the API server before proceeding:"
echo "    sudo -u gnncab pm2 stop gnncab-api"
echo "  ======================================================================"
echo ""

if [[ "$RESTORE_DB" == "$DB_NAME" ]]; then
  log "Live restore detected for primary database '$DB_NAME'"
  [[ -x "$EMERGENCY_BACKUP_CMD" ]] || die "Emergency backup command is missing or not executable: $EMERGENCY_BACKUP_CMD"
  read -rp "Type 'restore-live $RESTORE_DB' to confirm: " CONFIRM
  [[ "$CONFIRM" == "restore-live $RESTORE_DB" ]] || die "Aborted"
else
  read -rp "Type 'restore $RESTORE_DB' to confirm: " CONFIRM
  [[ "$CONFIRM" == "restore $RESTORE_DB" ]] || die "Aborted"
fi

log "Stopping API server..."
sudo -u gnncab pm2 stop gnncab-api 2>/dev/null || log "PM2 already stopped or not running"

if [[ "$RESTORE_DB" == "$DB_NAME" ]]; then
  log "Taking emergency local backup before destructive restore..."
  "$EMERGENCY_BACKUP_CMD" full || die "Emergency backup failed - refusing destructive restore"
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_OWNER';" | grep -q 1 || \
  die "Database owner role '$DB_OWNER' does not exist"

log "Dropping existing database '$RESTORE_DB'..."
sudo -u postgres psql -c "
  SELECT pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pg_stat_activity.datname = '$RESTORE_DB'
    AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || true

sudo -u postgres psql -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";"
sudo -u postgres psql -c "CREATE DATABASE \"$RESTORE_DB\" OWNER \"$DB_OWNER\" ENCODING 'UTF8';"
log "Database recreated"

log "Restoring from backup - this may take a few minutes..."
START_TIME=$(date +%s)

zcat "$BACKUP_FILE" | sudo -u postgres psql "$RESTORE_DB" \
  --single-transaction \
  --set ON_ERROR_STOP=1 \
  2>&1 | tee "$RESTORE_LOG"

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))
log "Restore completed in ${ELAPSED}s"

log "Running post-restore sanity checks..."
USERS=$(sudo -u postgres psql -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM users;" 2>/dev/null || echo 0)
TRIPS=$(sudo -u postgres psql -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM trips;" 2>/dev/null || echo 0)
log "Users: $USERS, Trips: $TRIPS"

if [[ "$USERS" -gt 0 ]]; then
  log "Sanity check PASSED"
else
  log "WARNING: users table is empty - verify restore was complete"
fi

read -rp "Restart the API server now? [y/N] " START_API
if [[ "${START_API,,}" == "y" ]]; then
  sudo -u gnncab pm2 start gnncab-api
  log "API server started"
fi

log "Restore complete"
echo ""
echo "Restore log: $RESTORE_LOG"
