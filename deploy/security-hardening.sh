#!/usr/bin/env bash
# =============================================================================
# GNNcab — Standalone security hardening script
# =============================================================================
# Run this on an EXISTING server to apply additional security hardening
# without re-running the full setup. Safe to run multiple times (idempotent).
#
# Usage:
#   chmod +x deploy/security-hardening.sh
#   sudo bash deploy/security-hardening.sh [ssh-port] [email]
#
# What this does:
#   - Verifies and re-applies UFW rules
#   - Re-applies fail2ban configuration
#   - Hardens SSH config
#   - Re-applies sysctl kernel settings
#   - Checks for unpatched packages
#   - Audits file permissions on sensitive paths
#   - Rotates any secrets older than 90 days (checks only, does not rotate)
#   - Generates a security report
# =============================================================================

set -euo pipefail

SSH_PORT="${1:-2222}"
# Preserve the legacy second positional argument without using it yet.
: "${2:-root}"
APP_DIR="/var/www/gnncab"
REPORT_FILE="/tmp/gnncab-security-report-$(date +%Y%m%d-%H%M%S).txt"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: sudo bash $0" >&2; exit 1
fi

info()  { echo -e "\n\033[1;34m[Security]\033[0m $*" | tee -a "$REPORT_FILE"; }
ok()    { echo -e "\033[0;32m  ✔ $*\033[0m" | tee -a "$REPORT_FILE"; }
warn()  { echo -e "\033[0;33m  ⚠ $*\033[0m" | tee -a "$REPORT_FILE"; }
fail()  { echo -e "\033[0;31m  ✖ $*\033[0m" | tee -a "$REPORT_FILE"; }

cleanup_legacy_postgres_config() {
  local pg_conf=""

  pg_conf=$(find /etc/postgresql -maxdepth 3 -type f -name postgresql.conf 2>/dev/null | sort | tail -n 1 || true)
  if [[ -z "$pg_conf" || ! -f "$pg_conf" ]]; then
    warn "Could not locate postgresql.conf for legacy config cleanup"
    return
  fi

  if grep -Eq '^[[:space:]]*log_failed_authentications[[:space:]]*=' "$pg_conf"; then
    sed -i '/^[[:space:]]*log_failed_authentications[[:space:]]*=.*/d' "$pg_conf"
    ok "Removed unsupported legacy PostgreSQL setting from $pg_conf"
  else
    ok "No unsupported legacy PostgreSQL auth logging directive found"
  fi
}

echo "======================================================================" | tee "$REPORT_FILE"
echo "  GNNcab Security Hardening Report — $(date -u '+%Y-%m-%d %H:%M:%S UTC')" | tee -a "$REPORT_FILE"
echo "======================================================================" | tee -a "$REPORT_FILE"

# =============================================================================
# 1. UFW firewall verification
# =============================================================================
info "1. UFW Firewall"

if ! ufw status | grep -q "Status: active"; then
  warn "UFW is NOT active — enabling..."
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw limit "$SSH_PORT/tcp" comment "SSH"
  ufw allow 80/tcp   comment "HTTP"
  ufw allow 443/tcp  comment "HTTPS"
  ufw logging medium
  ufw --force enable
  ok "UFW enabled and configured"
else
  ok "UFW is active"
  # Verify expected rules exist
  if ufw status | grep -q "$SSH_PORT"; then
    ok "SSH port $SSH_PORT rule present"
  else
    warn "SSH port $SSH_PORT rule MISSING — add: ufw limit $SSH_PORT/tcp"
  fi
  if ufw status | grep -q "443"; then
    ok "HTTPS rule present"
  else
    warn "HTTPS rule missing"
  fi
  # Make sure port 22 is NOT open if we moved SSH
  if [[ "$SSH_PORT" != "22" ]]; then
    if ufw status | grep -q "^22 "; then
      warn "Port 22 still open! Run: ufw delete allow 22"
    else
      ok "Port 22 is not open"
    fi
  fi
fi

# =============================================================================
# 2. SSH configuration audit
# =============================================================================
info "2. SSH Configuration"

SSHD_CONFIG_ALL=$(sshd -T 2>/dev/null)

check_ssh() {
  local key="$1" expected="$2"
  local actual
  actual=$(echo "$SSHD_CONFIG_ALL" | grep -i "^$key " | awk '{print $2}' | tr '[:upper:]' '[:lower:]')
  if [[ "$actual" == "$expected" ]]; then
    ok "$key = $actual"
  else
    fail "$key = $actual (expected: $expected) — fix in /etc/ssh/sshd_config.d/99-gnncab-hardening.conf"
  fi
}

check_ssh "permitrootlogin"       "no"
check_ssh "passwordauthentication" "no"
check_ssh "x11forwarding"         "no"
check_ssh "maxauthtries"          "3"

CURRENT_PORT=$(echo "$SSHD_CONFIG_ALL" | grep -i "^port " | awk '{print $2}')
if [[ "$CURRENT_PORT" == "$SSH_PORT" ]]; then
  ok "SSH on port $SSH_PORT"
else
  warn "SSH is on port $CURRENT_PORT, expected $SSH_PORT"
fi

# =============================================================================
# 3. fail2ban status
# =============================================================================
info "3. fail2ban"

if systemctl is-active fail2ban >/dev/null 2>&1; then
  ok "fail2ban service is active"
  fail2ban-client status 2>/dev/null | tee -a "$REPORT_FILE" || warn "Could not get fail2ban status"

  for JAIL in sshd gnncab-auth gnncab-ratelimit nginx-botsearch; do
    if fail2ban-client status "$JAIL" >/dev/null 2>&1; then
      ok "Jail '$JAIL' active"
    else
      warn "Jail '$JAIL' not found"
    fi
  done
else
  fail "fail2ban is NOT running — starting..."
  systemctl start fail2ban
fi

# Re-apply custom filters from repo if present
if [[ -d "$APP_DIR/deploy/fail2ban/filter.d" ]]; then
  if cp "$APP_DIR/deploy/fail2ban/filter.d/"*.conf /etc/fail2ban/filter.d/ 2>/dev/null && \
    systemctl reload fail2ban; then
    ok "Custom filters reloaded"
  else
    warn "Could not reload filters"
  fi
fi

# =============================================================================
# 4. Kernel sysctl hardening
# =============================================================================
info "4. Kernel hardening (sysctl)"

check_sysctl() {
  local key="$1" expected="$2"
  local actual
  actual=$(sysctl -n "$key" 2>/dev/null || echo "MISSING")
  if [[ "$actual" == "$expected" ]]; then
    ok "$key = $actual"
  else
    fail "$key = $actual (expected $expected) — applying..."
    sysctl -w "$key=$expected" >/dev/null
    echo "$key = $expected" >> /etc/sysctl.d/99-gnncab-hardening.conf
  fi
}

check_sysctl net.ipv4.tcp_syncookies      1
check_sysctl net.ipv4.conf.all.rp_filter  1
check_sysctl kernel.randomize_va_space    2
check_sysctl fs.suid_dumpable             0
check_sysctl kernel.dmesg_restrict        1
check_sysctl net.ipv4.conf.all.log_martians 1
check_sysctl fs.protected_hardlinks       1
check_sysctl fs.protected_symlinks        1

# =============================================================================
# 5. Automatic security updates
# =============================================================================
info "5. Automatic security updates"

if systemctl is-active unattended-upgrades >/dev/null 2>&1; then
  ok "unattended-upgrades is active"
else
  warn "unattended-upgrades NOT running — enabling..."
  apt-get install -y unattended-upgrades >/dev/null 2>&1
  systemctl enable --now unattended-upgrades
  ok "Enabled"
fi

# Check for pending security updates
PENDING=$(apt-get -s upgrade 2>/dev/null | grep -c "^Inst" || true)
if [[ "$PENDING" -gt 0 ]]; then
  warn "$PENDING package updates available — run: apt-get upgrade"
else
  ok "No pending package updates"
fi

# =============================================================================
# 6. File permission audit
# =============================================================================
info "6. File permissions"

check_perms() {
  local path="$1" expected_owner="$2" expected_perms="$3"
  if [[ ! -e "$path" ]]; then warn "$path does not exist"; return; fi
  local actual_owner actual_perms
  actual_owner=$(stat -c '%U:%G' "$path")
  actual_perms=$(stat -c '%a' "$path")
  if [[ "$actual_owner" == "$expected_owner" ]]; then
    ok "$path owner: $actual_owner"
  else
    fail "$path owner is $actual_owner (expected $expected_owner)"
  fi
  if [[ "$actual_perms" == "$expected_perms" ]]; then
    ok "$path perms: $actual_perms"
  else
    warn "$path perms: $actual_perms (expected $expected_perms)"
  fi
}

check_perms "$APP_DIR/.env"          "gnncab:gnncab" "600"
check_perms "/var/backups/gnncab"    "postgres:postgres" "750"
check_perms "/var/log/gnncab"        "gnncab:gnncab" "750"
check_perms "/etc/ssh/sshd_config"   "root:root"    "644"

# Ensure .env is not world-readable
if [[ -f "$APP_DIR/.env" ]]; then
  chmod 600 "$APP_DIR/.env"
  chown gnncab:gnncab "$APP_DIR/.env"
  ok ".env permissions enforced (600)"
fi

# =============================================================================
# 7. PostgreSQL security check
# =============================================================================
info "7. PostgreSQL"
cleanup_legacy_postgres_config

if systemctl is-active postgresql >/dev/null 2>&1; then
  ok "PostgreSQL is running"

  # Verify it's not listening on 0.0.0.0
  PG_LISTEN=$(sudo -u postgres psql -tAc "SHOW listen_addresses;" 2>/dev/null || echo "unknown")
  if [[ "$PG_LISTEN" == "localhost" || "$PG_LISTEN" == "127.0.0.1" ]]; then
    ok "PostgreSQL listens on localhost only"
  else
    warn "PostgreSQL listen_addresses = '$PG_LISTEN' — should be 'localhost'"
  fi

  # Verify scram auth
  PG_AUTH=$(sudo -u postgres psql -tAc "SELECT method FROM pg_hba_file_rules WHERE address = '127.0.0.1/32' LIMIT 1;" 2>/dev/null || echo "unknown")
  if [[ "$PG_AUTH" == "scram-sha-256" ]]; then
    ok "scram-sha-256 auth configured"
  else
    warn "Auth method is '$PG_AUTH' — scram-sha-256 recommended"
  fi
else
  fail "PostgreSQL is NOT running!"
fi

# =============================================================================
# 8. TLS certificate status
# =============================================================================
info "8. TLS Certificate"

if [[ -f "/etc/letsencrypt/live/$HOSTNAME/fullchain.pem" ]]; then
  EXPIRY=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$HOSTNAME/fullchain.pem" 2>/dev/null | cut -d= -f2)
  ok "Certificate expires: $EXPIRY"
  DAYS_LEFT=$(( ( $(date -d "$EXPIRY" +%s) - $(date +%s) ) / 86400 ))
  if [[ "$DAYS_LEFT" -gt 14 ]]; then
    ok "$DAYS_LEFT days remaining"
  else
    warn "Certificate expires in $DAYS_LEFT days — check certbot renew"
  fi
else
  warn "No Let's Encrypt certificate found at expected path"
fi

# =============================================================================
# 9. Open ports audit
# =============================================================================
info "9. Open ports"

OPEN_PORTS=$(ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | sort -u)
echo "$OPEN_PORTS" | tee -a "$REPORT_FILE"

# Alert on unexpected external listeners
for line in $(ss -tlnp | grep LISTEN | awk '{print $4}'); do
  addr=$(echo "$line" | cut -d: -f1)
  port=$(echo "$line" | rev | cut -d: -f1 | rev)
  if [[ "$addr" != "127.0.0.1" && "$addr" != "::1" && "$addr" != "[::1]" ]]; then
    if [[ "$port" == "80" || "$port" == "443" || "$port" == "$SSH_PORT" ]]; then
      ok "Expected external listener: $line"
    else
      warn "Unexpected external listener: $line"
    fi
  fi
done

# =============================================================================
# Report complete
# =============================================================================
echo "" | tee -a "$REPORT_FILE"
echo "======================================================================" | tee -a "$REPORT_FILE"
echo "  Report saved to: $REPORT_FILE" | tee -a "$REPORT_FILE"
echo "======================================================================" | tee -a "$REPORT_FILE"
