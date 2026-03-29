#!/usr/bin/env bash
# =============================================================================
# GNNcab - PostgreSQL backup script
# =============================================================================
# Usage:
#   /usr/local/bin/gnncab-backup          # daily incremental-style (full dump)
#   /usr/local/bin/gnncab-backup full     # explicitly full backup
#   /usr/local/bin/gnncab-backup verify   # verify the latest backup only
#   /usr/local/bin/gnncab-backup list     # list available backups
#   /usr/local/bin/gnncab-backup clean    # manually run retention cleanup
#
# Cron (as postgres user):
#   0 2 * * *   /usr/local/bin/gnncab-backup >> /var/log/gnncab/backup.log 2>&1
#   0 1 * * 0   /usr/local/bin/gnncab-backup full >> /var/log/gnncab/backup.log 2>&1
#
# Operational model:
#   - may be invoked as root (manual/update/restore flows) or postgres (cron)
#   - local PostgreSQL access is always executed as the postgres OS user
#
# Environment overrides (set in crontab or .env):
#   BACKUP_DIR         local backup root       default: /var/backups/gnncab
#   DB_NAME            database name           default: gnncab
#   DB_USER            database user           default: gnncab
#   KEEP_DAILY         daily backups to keep   default: 7
#   KEEP_WEEKLY        weekly backups to keep  default: 4
#   KEEP_MONTHLY       monthly backups to keep default: 3
#   RCLONE_REMOTE      rclone remote path      e.g. "spaces:gnncab-backups"
#   NOTIFY_URL         webhook URL for alerts  (optional)
# =============================================================================

set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gnncab}"
DB_NAME="${DB_NAME:-gnncab}"
DB_USER="${DB_USER:-gnncab}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-3}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
NOTIFY_URL="${NOTIFY_URL:-}"
LOG_DIR="/var/log/gnncab"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H-%M-%SZ')
DOW=$(date +%u)
DOM=$(date +%d)
CURRENT_USER="$(id -un)"

BACKUP_FILE=""
CHECKSUM_FILE=""
TMP_BACKUP_FILE=""
TMP_CHECKSUM_FILE=""

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [BACKUP] $*"
}

warn() {
  log "WARN: $*"
}

warn_remote() {
  warn "$*"
  if [[ -n "$NOTIFY_URL" ]]; then
    local msg="$1"
    curl -sS -X POST "$NOTIFY_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"[GNNcab] Backup WARN on $(hostname): $msg\"}" \
      >/dev/null 2>&1 || true
  fi
}

notify_failure() {
  if [[ -n "$NOTIFY_URL" ]]; then
    local msg="$1"
    curl -sS -X POST "$NOTIFY_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"[GNNcab] Backup FAILED on $(hostname): $msg\"}" \
      >/dev/null 2>&1 || true
  fi
}

notify_success() {
  if [[ -n "$NOTIFY_URL" ]]; then
    local file_size="$1"
    curl -sS -X POST "$NOTIFY_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"[GNNcab] Backup OK on $(hostname) - $file_size\"}" \
      >/dev/null 2>&1 || true
  fi
}

die() {
  log "ERROR: $*"
  notify_failure "$*"
  exit 1
}

require_commands() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
  done
}

run_as_postgres() {
  if [[ "$CURRENT_USER" == "postgres" ]]; then
    "$@"
    return
  fi

  [[ $EUID -eq 0 ]] || die "Run gnncab-backup as root or postgres so PostgreSQL peer authentication stays reliable."
  sudo -u postgres "$@"
}

# shellcheck disable=SC2317 # Invoked indirectly via EXIT trap.
cleanup_partial_files() {
  if [[ -n "$TMP_BACKUP_FILE" && -f "$TMP_BACKUP_FILE" ]]; then
    rm -f "$TMP_BACKUP_FILE"
  fi
  if [[ -n "$TMP_CHECKSUM_FILE" && -f "$TMP_CHECKSUM_FILE" ]]; then
    rm -f "$TMP_CHECKSUM_FILE"
  fi
}

trap cleanup_partial_files EXIT

COMMAND="${1:-daily}"

require_commands id psql pg_dump gzip sha256sum df du find awk sort head date mkdir rm mv tee
if [[ "$CURRENT_USER" != "postgres" ]]; then
  require_commands sudo
fi
mkdir -p "$BACKUP_DIR" "$LOG_DIR"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

if [[ "$COMMAND" == "list" ]]; then
  log "Available backups in $BACKUP_DIR:"
  find "$BACKUP_DIR" -name "*.sql.gz" -printf '%T@ %Tc %p\n' 2>/dev/null | sort -rn | head -30
  exit 0
fi

if [[ "$COMMAND" == "clean" ]]; then
  log "Running retention cleanup..."
  BACKUP_TYPE="clean"
fi

if [[ "$COMMAND" == "verify" ]]; then
  LATEST=$(find "$BACKUP_DIR" -name "*.sql.gz" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | awk '{print $2}')
  if [[ -z "$LATEST" ]]; then
    die "No backups found to verify in $BACKUP_DIR"
  fi

  log "Verifying $LATEST..."
  gzip -t "$LATEST" || die "Integrity check FAILED for $LATEST"
  log "Integrity check PASSED for $LATEST"

  if [[ -f "${LATEST}.sha256" ]]; then
    sha256sum -c "${LATEST}.sha256" >/dev/null || die "Checksum verification FAILED for $LATEST"
    log "Checksum verification PASSED for $LATEST"
  else
    warn "No checksum file found for $LATEST"
  fi

  ROW_COUNT=$(
    run_as_postgres psql -d "$DB_NAME" -tAc "
      SELECT CASE
        WHEN to_regclass('public.users') IS NULL THEN 'skip'
        ELSE (SELECT COUNT(*)::text FROM public.users)
      END;
    " 2>/dev/null || echo "skip"
  )
  [[ "$ROW_COUNT" != "skip" ]] && log "Row count sanity: users=$ROW_COUNT"
  exit 0
fi

if [[ "$COMMAND" == "clean" ]]; then
  :
elif [[ "$COMMAND" == "full" || "$DOW" == "7" ]]; then
  BACKUP_TYPE="weekly"
elif [[ "$DOM" == "01" ]]; then
  BACKUP_TYPE="monthly"
else
  BACKUP_TYPE="daily"
fi

if [[ "$COMMAND" != "clean" ]]; then
  BACKUP_SUBDIR="$BACKUP_DIR/$BACKUP_TYPE"
  mkdir -p "$BACKUP_SUBDIR"

  BACKUP_FILE="$BACKUP_SUBDIR/${DB_NAME}_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"
  CHECKSUM_FILE="${BACKUP_FILE}.sha256"
  TMP_BACKUP_FILE="${BACKUP_FILE}.tmp"
  TMP_CHECKSUM_FILE="${CHECKSUM_FILE}.tmp"

  [[ ! -e "$BACKUP_FILE" ]] || die "Refusing to overwrite existing backup archive: $BACKUP_FILE"
  [[ ! -e "$CHECKSUM_FILE" ]] || die "Refusing to overwrite existing backup checksum: $CHECKSUM_FILE"

  log "Starting $BACKUP_TYPE backup of '$DB_NAME' database..."
  log "Target: $BACKUP_FILE"

  run_as_postgres psql -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1 || \
    die "Cannot connect to PostgreSQL as postgres"

  AVAIL_KB=$(df -P "$BACKUP_DIR" | awk 'NR==2 {print $4}')
  if [[ "$AVAIL_KB" -lt 512000 ]]; then
    die "Low disk space: only ${AVAIL_KB}KB free in $BACKUP_DIR"
  fi

  # Produce a compressed plain SQL dump and only move it into place after verification.
  run_as_postgres pg_dump \
    --dbname="$DB_NAME" \
    --no-password \
    --format=plain \
    --verbose \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    2>>"$LOG_DIR/backup-verbose.log" \
  | gzip -9 > "$TMP_BACKUP_FILE" \
  || die "pg_dump failed - check $LOG_DIR/backup-verbose.log"

  gzip -t "$TMP_BACKUP_FILE" || die "Backup file is corrupted (gzip test failed)"

  sha256sum "$TMP_BACKUP_FILE" > "$TMP_CHECKSUM_FILE"
  mv "$TMP_BACKUP_FILE" "$BACKUP_FILE"
  mv "$TMP_CHECKSUM_FILE" "$CHECKSUM_FILE"
  TMP_BACKUP_FILE=""
  TMP_CHECKSUM_FILE=""

  BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)

  log "Backup complete - size: $BACKUP_SIZE"
  log "Checksum: $(cat "$CHECKSUM_FILE")"

  cat >> "$BACKUP_DIR/backup-history.log" <<EOF
$(date -u '+%Y-%m-%dT%H:%M:%SZ') | $BACKUP_TYPE | $BACKUP_FILE | $BACKUP_SIZE | OK
EOF
fi

if [[ "$COMMAND" != "clean" && -n "$RCLONE_REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    log "Syncing to remote storage: $RCLONE_REMOTE..."
    if rclone copy "$BACKUP_FILE" "$RCLONE_REMOTE/$BACKUP_TYPE/" \
      --progress \
      --stats-one-line \
      --log-level INFO \
      2>>"$LOG_DIR/backup-rclone.log"; then
      log "Remote sync OK"
    else
      warn_remote "rclone sync failed - backup is still local"
    fi
  else
    warn "RCLONE_REMOTE is set but rclone is not installed - skipping remote sync"
    warn "Install with: curl https://rclone.org/install.sh | sudo bash"
  fi
fi

cleanup_old_backups() {
  local dir="$1" keep="$2" label="$3"
  local count
  count=$(find "$dir" -name "*.sql.gz" | wc -l)
  if [[ "$count" -gt "$keep" ]]; then
    local to_delete=$(( count - keep ))
    log "Pruning $to_delete old $label backup(s) (keeping $keep)..."
    find "$dir" -name "*.sql.gz" -printf '%T@ %p\n' | \
      sort -n | head -"$to_delete" | awk '{print $2}' | \
      while read -r file; do
        rm -f "$file" "${file}.sha256"
        log "  Removed: $file"
      done
  else
    log "$label backups: $count / $keep (no cleanup needed)"
  fi
}

cleanup_old_backups "$BACKUP_DIR/daily" "$KEEP_DAILY" "daily"
cleanup_old_backups "$BACKUP_DIR/weekly" "$KEEP_WEEKLY" "weekly"
cleanup_old_backups "$BACKUP_DIR/monthly" "$KEEP_MONTHLY" "monthly"

if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
  rclone delete --min-age "${KEEP_DAILY}d" "$RCLONE_REMOTE/daily/" >/dev/null 2>&1 || true
  rclone delete --min-age "$(( KEEP_WEEKLY * 7 ))d" "$RCLONE_REMOTE/weekly/" >/dev/null 2>&1 || true
fi

TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "All backups total size: $TOTAL_SIZE"
if [[ "$COMMAND" == "clean" ]]; then
  log "Retention cleanup completed successfully"
else
  log "Backup job completed successfully"
  notify_success "$BACKUP_SIZE ($BACKUP_TYPE)"
fi

exit 0
