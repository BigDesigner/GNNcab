#!/usr/bin/env bash
# =============================================================================
is_ipv4_address() {
  local ip="$1"
  local part

  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r -a octets <<< "$ip"
  for part in "${octets[@]}"; do
    (( part >= 0 && part <= 255 )) || return 1
  done
}

is_private_ipv4_address() {
  local ip="$1"

  if ! is_ipv4_address "$ip"; then
    return 1
  fi

  case "$ip" in
    10.*|127.*|192.168.*) return 0 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) return 0 ;;
    *) return 1 ;;
  esac
}

is_local_domain() {
  case "$1" in
    localhost|*.local|*.test) return 0 ;;
    *)
      is_private_ipv4_address "$1"
      ;;
  esac
}

render_production_nginx_config() {
  local domain="$1"

  sed \
    -e "s/DOMAIN_PLACEHOLDER/$domain/g" \
    -e "/server_name /s/ www\\.$domain//g" \
    "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/gnncab
}

render_local_nginx_config() {
  local domain="$1"

  cat > /etc/nginx/sites-available/gnncab <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    root /var/www/gnncab/artifacts/gnncab/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";
    }

    location /ws {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}

install_nginx_global_config() {
  install -d -m 755 /etc/nginx/conf.d
  install -m 644 "$APP_DIR/deploy/nginx-rate-limits.conf" /etc/nginx/conf.d/gnncab-rate-limits.conf
  rm -f /etc/nginx/conf.d/gnncab.conf
}

activate_nginx_site() {
  ln -sf /etc/nginx/sites-available/gnncab /etc/nginx/sites-enabled/gnncab
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
}
EOF
}

# =============================================================================
# GNNcab — First-time server setup for Ubuntu 22.04 / 24.04 (DigitalOcean)
# =============================================================================
# Usage:
#   chmod +x deploy/setup.sh
#   sudo bash deploy/setup.sh <domain> <email> [ssh-port]
#
# Arguments:
#   domain    Primary domain name, or a local test host such as localhost
#   email     Email address for Let's Encrypt and security notifications
#   ssh-port  (Optional) SSH port to move to — defaults to 2222
#
# Steps performed:
#   1.  System update & essential packages
#   2.  SSH hardening
#   3.  UFW firewall rules
#   4.  fail2ban intrusion prevention
#   5.  Automatic security updates
#   6.  Kernel / sysctl hardening
#   7.  Node.js 24 + pnpm + PM2
#   8.  PostgreSQL 16 (hardened)
#   9.  Nginx
#  10.  Let's Encrypt TLS certificate
#  11.  App user + directories
#  12.  Clone, configure, build, and start the app
#  13.  PostgreSQL backup cron job
#  14.  Final security audit summary
# =============================================================================

set -euo pipefail

# ─── Arguments ────────────────────────────────────────────────────────────────
DOMAIN="${1:-}"
EMAIL="${2:-}"
SSH_PORT="${3:-2222}"
INSTALL_MODE_RAW="${INSTALL_MODE:-${4:-}}"
REPO_URL="${REPO_URL:-https://github.com/BigDesigner/GNNcab}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
APP_DIR="/var/www/gnncab"
APP_USER="gnncab"
LOG_DIR="/var/log/gnncab"
BACKUP_DIR="/var/backups/gnncab"
NODE_VERSION="24"
INSTALL_MODE=""

# ─── Pre-flight ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: sudo bash $0" >&2; exit 1
fi
if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo bash $0 <domain> <email> [ssh-port] [install-mode]"
  echo "  e.g. sudo bash $0 gnncab.example.com admin@example.com 2222 production"
  echo "  e.g. INSTALL_MODE=local sudo bash $0 192.168.1.50 local@example.test 2222"
  exit 1
fi

BANNER="======================================================================"

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "\n\033[1;34m[GNNcab]\033[0m $*"; }
ok()    { echo -e "\033[0;32m  ✔ $*\033[0m"; }
warn()  { echo -e "\033[0;33m  ⚠ $*\033[0m"; }

# =============================================================================
# Install mode and env validation helpers
# =============================================================================
trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

normalize_install_mode() {
  local raw_mode
  raw_mode=$(trim_whitespace "${1:-}")

  case "${raw_mode,,}" in
    local|test|local/test) printf '%s' "local" ;;
    production|prod) printf '%s' "production" ;;
    *) return 1 ;;
  esac
}

prompt_install_mode() {
  local choice=""

  while true; do
    echo ""
    echo "Select install mode:"
    echo "  1) local/test"
    echo "  2) production"
    read -rp "Install mode [1/2]: " choice

    case "$(trim_whitespace "$choice")" in
      1) INSTALL_MODE="local"; return 0 ;;
      2) INSTALL_MODE="production"; return 0 ;;
      *) warn "Please enter 1 for local/test or 2 for production." ;;
    esac
  done
}

require_install_mode() {
  if [[ -n "$INSTALL_MODE_RAW" ]]; then
    if ! INSTALL_MODE=$(normalize_install_mode "$INSTALL_MODE_RAW"); then
      echo "ERROR: INSTALL_MODE must be one of: local, test, production" >&2
      exit 1
    fi
    return
  fi

  prompt_install_mode
}

is_real_domain() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] && ! is_local_domain "$1"
}

validate_domain_for_mode() {
  if [[ "$INSTALL_MODE" == "production" ]]; then
    if ! is_real_domain "$DOMAIN"; then
      echo "ERROR: production mode requires a real public domain (not localhost or a LAN/IP target)." >&2
      exit 1
    fi
    return
  fi

  if ! is_local_domain "$DOMAIN"; then
    echo "ERROR: local/test mode requires localhost, a .local/.test host, or a private/LAN IPv4 address." >&2
    exit 1
  fi
}

upsert_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local temp_file

  temp_file=$(mktemp)
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    $0 ~ ("^[[:space:]]*" key "=") {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$env_file" > "$temp_file"
  mv "$temp_file" "$env_file"
}

load_env_file() {
  local env_file="$1"

  if [[ ! -f "$env_file" ]]; then
    echo "ERROR: Missing env file: $env_file" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}

append_validation_error() {
  VALIDATION_ERRORS+=("$1")
}

validate_allowed_origins() {
  local raw_origins="$1"
  local mode="$2"
  local origin_list=()
  local origin=""
  local host=""
  local host_without_port=""

  IFS=',' read -r -a origin_list <<< "$raw_origins"
  if [[ "${#origin_list[@]}" -eq 0 ]]; then
    append_validation_error "ALLOWED_ORIGINS must contain at least one explicit origin."
    return
  fi

  for origin in "${origin_list[@]}"; do
    origin=$(trim_whitespace "$origin")
    if [[ -z "$origin" ]]; then
      append_validation_error "ALLOWED_ORIGINS contains an empty entry. Remove extra commas or blanks."
      continue
    fi
    if [[ "$origin" == "*" ]]; then
      append_validation_error "ALLOWED_ORIGINS must not include wildcard '*'."
      continue
    fi
    if [[ ! "$origin" =~ ^https?://[^/]+$ ]]; then
      append_validation_error "ALLOWED_ORIGINS entry '$origin' must be an exact origin like https://example.com or http://192.168.1.50:5173."
      continue
    fi

    host="${origin#*://}"
    host_without_port="${host%%:*}"

    if [[ "$mode" == "production" ]]; then
      if [[ "$origin" != https://* ]]; then
        append_validation_error "Production ALLOWED_ORIGINS entry '$origin' must use https://."
      fi
      if ! is_real_domain "$host_without_port"; then
        append_validation_error "Production ALLOWED_ORIGINS entry '$origin' must use a real public domain."
      fi
    else
      if ! is_local_domain "$host_without_port"; then
        append_validation_error "Local/test ALLOWED_ORIGINS entry '$origin' must use localhost, .local/.test, or a private/LAN IPv4 host."
      fi
    fi
  done
}

validate_setup_env_file() {
  local env_file="$1"
  local env_install_mode=""
  local selected_mode="$INSTALL_MODE"

  VALIDATION_ERRORS=()
  unset INSTALL_MODE PORT NODE_ENV JWT_SECRET ALLOWED_ORIGINS ROUTING_PROVIDER OSRM_BASE_URL DATABASE_URL
  load_env_file "$env_file"

  if ! env_install_mode=$(normalize_install_mode "${INSTALL_MODE:-}" 2>/dev/null); then
    append_validation_error "INSTALL_MODE in .env must be set to 'local' or 'production'."
  elif [[ "$env_install_mode" != "$selected_mode" ]]; then
    append_validation_error "INSTALL_MODE in .env ($env_install_mode) does not match the selected install mode ($selected_mode)."
  fi

  if [[ -z "${JWT_SECRET:-}" || "${JWT_SECRET}" == CHANGE_THIS* || ${#JWT_SECRET} -lt 64 ]]; then
    append_validation_error "JWT_SECRET must be replaced with a strong random value at least 64 characters long."
  fi

  if [[ -z "${ALLOWED_ORIGINS:-}" ]]; then
    append_validation_error "ALLOWED_ORIGINS must be set to one or more exact browser origins."
  else
    validate_allowed_origins "$ALLOWED_ORIGINS" "$selected_mode"
  fi

  if [[ ! "${PORT:-}" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    append_validation_error "PORT must be a numeric TCP port between 1 and 65535."
  fi

  if [[ "${NODE_ENV:-}" != "production" ]]; then
    append_validation_error "NODE_ENV must be set to production for deploy/setup flows."
  fi

  case "${ROUTING_PROVIDER:-}" in
    mock|osrm) ;;
    *) append_validation_error "ROUTING_PROVIDER must be explicitly set to 'mock' or 'osrm'." ;;
  esac

  if [[ "${ROUTING_PROVIDER:-}" == "osrm" && -z "${OSRM_BASE_URL:-}" ]]; then
    append_validation_error "OSRM_BASE_URL is required when ROUTING_PROVIDER=osrm."
  fi

  if [[ "$selected_mode" == "production" ]]; then
    if [[ "${ROUTING_PROVIDER:-}" != "osrm" ]]; then
      append_validation_error "Production mode requires ROUTING_PROVIDER=osrm."
    fi
  fi

  if [[ "${#VALIDATION_ERRORS[@]}" -gt 0 ]]; then
    echo "ERROR: .env validation failed:" >&2
    printf '  - %s\n' "${VALIDATION_ERRORS[@]}" >&2
    return 1
  fi

  ok ".env validation passed for $selected_mode mode"
}

require_install_mode
validate_domain_for_mode
echo "$BANNER"
echo "  GNNcab deployment setup"
echo "  Mode   : $INSTALL_MODE"
echo "  Domain : $DOMAIN"
echo "  Email  : $EMAIL"
echo "  SSH    : port $SSH_PORT (will change from 22 after step 2)"
echo "$BANNER"

# =============================================================================
# PostgreSQL hardening helpers
# =============================================================================
cleanup_legacy_postgres_config() {
  local pg_conf="$1"

  if [[ -f "$pg_conf" ]] && grep -Eq '^[[:space:]]*log_failed_authentications[[:space:]]*=' "$pg_conf"; then
    sed -i '/^[[:space:]]*log_failed_authentications[[:space:]]*=.*/d' "$pg_conf"
    warn "Removed unsupported legacy PostgreSQL setting: log_failed_authentications"
  fi
}

postgres_setting_supported() {
  local setting_name="$1"
  local exists

  exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_settings WHERE name = '${setting_name}';" 2>/dev/null | tr -d '[:space:]')
  [[ "$exists" == "1" ]]
}

write_postgres_hardening_config() {
  local pg_conf_file="$1"

  cat > "$pg_conf_file" <<'EOF'
# GNNcab PostgreSQL hardening
# Managed by deploy/setup.sh. Safe to overwrite on repeat runs.
listen_addresses = 'localhost'
ssl = on
ssl_min_protocol_version = 'TLSv1.2'
password_encryption = scram-sha-256

# Connection limits
max_connections = 100
superuser_reserved_connections = 3

# Logging
log_connections = on
log_disconnections = on
log_lock_waits = on
log_duration = off
log_min_duration_statement = 2000
log_checkpoints = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_timezone = 'UTC'
log_min_error_statement = error
EOF

  if postgres_setting_supported "log_failed_authentications"; then
    printf '%s\n' "log_failed_authentications = on" >> "$pg_conf_file"
  else
    warn "Skipping unsupported PostgreSQL setting on this server: log_failed_authentications"
  fi
}

# =============================================================================
# 1. System update & essential packages
# =============================================================================
info "[1/14] System update and essential packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
apt-get install -y \
  curl wget gnupg2 ca-certificates lsb-release software-properties-common \
  unzip git build-essential ufw fail2ban \
  unattended-upgrades apt-listchanges \
  logrotate rsync gzip \
  net-tools htop ncdu \
  libpam-pwquality
ok "System packages installed"

# =============================================================================
# 2. SSH hardening
# =============================================================================
info "[2/14] Hardening SSH..."

# Backup original config
cp /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%Y%m%d)"

# Write a drop-in hardening file (overrides defaults without touching the main config)
cat > /etc/ssh/sshd_config.d/99-gnncab-hardening.conf <<EOF
# GNNcab SSH hardening — $(date)
Port                    $SSH_PORT
PermitRootLogin         no
PasswordAuthentication  no
ChallengeResponseAuthentication no
PubkeyAuthentication    yes
AuthorizedKeysFile      .ssh/authorized_keys
MaxAuthTries            3
MaxSessions             5
LoginGraceTime          30
ClientAliveInterval     300
ClientAliveCountMax     2
X11Forwarding           no
AllowTcpForwarding      no
GatewayPorts            no
PermitTunnel            no
PrintLastLog            yes
LogLevel                VERBOSE
UsePAM                  yes
# Restrict to specific users (add deploy/CI users here as needed)
# AllowUsers             gnncab deploy
EOF

# Validate and restart SSH
sshd -t && systemctl restart ssh
ok "SSH hardened — port $SSH_PORT, root login disabled, password auth disabled"
warn "IMPORTANT: Ensure your SSH key is in authorized_keys before closing this session!"

# =============================================================================
# 3. UFW Firewall
# =============================================================================
info "[3/14] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw default deny forward

# SSH on new port — rate-limit to block brute force (6 attempts / 30 seconds per IP)
ufw limit "$SSH_PORT/tcp" comment "SSH hardened port"

# HTTP and HTTPS
ufw allow 80/tcp  comment "HTTP (Nginx)"
ufw allow 443/tcp comment "HTTPS (Nginx)"

# PostgreSQL — only localhost (no external access)
# (it listens on 127.0.0.1 only after hardening)

# Enable logging at medium verbosity
ufw logging medium

ufw --force enable
ufw status verbose
ok "UFW active — SSH:$SSH_PORT (rate-limited), HTTP:80, HTTPS:443 only"

# =============================================================================
# 4. fail2ban
# =============================================================================
info "[4/14] Configuring fail2ban..."

# Copy bundled jail config from repo if it exists, else write inline
if [[ -f "$APP_DIR/deploy/fail2ban/jail.local" ]]; then
  cp "$APP_DIR/deploy/fail2ban/jail.local" /etc/fail2ban/jail.local
else
  cat > /etc/fail2ban/jail.local <<'EOF'
# GNNcab fail2ban jail configuration
# Overrides /etc/fail2ban/jail.conf — only define what you want changed

[DEFAULT]
bantime   = 3600          ; 1 hour ban
findtime  = 600           ; look-back window: 10 minutes
maxretry  = 5
ignoreip  = 127.0.0.1/8 ::1
banaction = ufw

# ── SSH ───────────────────────────────────────────────────────────────────────
[sshd]
enabled  = true
port     = SSH_PORT_PLACEHOLDER
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400          ; 24-hour ban for SSH brute force

# ── Nginx: 404 / bad bots ─────────────────────────────────────────────────────
[nginx-botsearch]
enabled  = true
port     = http,https
filter   = nginx-botsearch
logpath  = /var/log/nginx/gnncab_access.log
maxretry = 10
bantime  = 3600

# ── Nginx: HTTP auth failures ─────────────────────────────────────────────────
[nginx-http-auth]
enabled  = true
port     = http,https
filter   = nginx-http-auth
logpath  = /var/log/nginx/gnncab_error.log
maxretry = 5

# ── GNNcab: API auth failures (401 from our API) ─────────────────────────────
[gnncab-auth]
enabled  = true
port     = http,https
filter   = gnncab-auth
logpath  = /var/log/nginx/gnncab_access.log
maxretry = 10
findtime = 300            ; 5-minute window
bantime  = 7200           ; 2-hour ban for repeated auth failures

# ── GNNcab: Rate limit abuse (429) ───────────────────────────────────────────
[gnncab-ratelimit]
enabled  = true
port     = http,https
filter   = gnncab-ratelimit
logpath  = /var/log/nginx/gnncab_access.log
maxretry = 20
findtime = 60             ; 1-minute window
bantime  = 3600
EOF
  sed -i "s/SSH_PORT_PLACEHOLDER/$SSH_PORT/g" /etc/fail2ban/jail.local
fi

# Install custom filters from repo if they exist
if [[ -d "$APP_DIR/deploy/fail2ban/filter.d" ]]; then
  cp "$APP_DIR/deploy/fail2ban/filter.d/"*.conf /etc/fail2ban/filter.d/ 2>/dev/null || true
fi

# Write the custom API filter directly (safe to overwrite)
cat > /etc/fail2ban/filter.d/gnncab-auth.conf <<'EOF'
[Definition]
# Match 401 responses in Nginx combined log format:
# IP - - [timestamp] "METHOD /api/auth/... HTTP/..." 401 ...
failregex = ^<HOST> - .+ "(?:POST|GET) /api/auth/.+ HTTP/\d+\.\d+" 401 .+$
ignoreregex =
EOF

cat > /etc/fail2ban/filter.d/gnncab-ratelimit.conf <<'EOF'
[Definition]
# Match 429 Too Many Requests from Nginx
failregex = ^<HOST> - .+ ".*" 429 .+$
ignoreregex =
EOF

systemctl enable fail2ban
systemctl restart fail2ban
ok "fail2ban configured — SSH, Nginx, API auth, and rate-limit jails active"

# =============================================================================
# 5. Automatic security updates
# =============================================================================
info "[5/14] Configuring automatic security updates..."

cat > /etc/apt/apt.conf.d/50unattended-upgrades <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Mail "$EMAIL";
Unattended-Upgrade::MailReport "on-change";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

systemctl enable unattended-upgrades
systemctl restart unattended-upgrades
ok "Automatic security updates enabled — notifications to $EMAIL"

# =============================================================================
# 6. Kernel / sysctl hardening
# =============================================================================
info "[6/14] Applying kernel hardening (sysctl)..."

cat > /etc/sysctl.d/99-gnncab-hardening.conf <<'EOF'
# GNNcab kernel hardening
# Apply with: sysctl -p /etc/sysctl.d/99-gnncab-hardening.conf

# ── Network: SYN flood protection ────────────────────────────────────────────
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5

# ── Network: Routing / spoofing hardening ────────────────────────────────────
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1

# ── Network: Performance ─────────────────────────────────────────────────────
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.core.netdev_max_backlog = 5000

# ── Kernel: Memory / process hardening ───────────────────────────────────────
kernel.randomize_va_space = 2
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
fs.suid_dumpable = 0
fs.protected_hardlinks = 1
fs.protected_symlinks = 1

# ── Kernel: Prevent PTRACE abuse ─────────────────────────────────────────────
kernel.yama.ptrace_scope = 1
EOF

sysctl -p /etc/sysctl.d/99-gnncab-hardening.conf > /dev/null
ok "Kernel hardening applied (SYN cookies, ASLR, rp_filter, log_martians)"

# =============================================================================
# 7. Node.js 24 + pnpm + PM2
# =============================================================================
info "[7/14] Installing Node.js $NODE_VERSION, pnpm, and PM2..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
apt-get install -y nodejs
npm install -g pnpm pm2 pm2-logrotate
# Configure PM2 log rotation
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
node --version && pnpm --version && pm2 --version
ok "Node.js $(node --version), pnpm $(pnpm --version), PM2 $(pm2 --version)"

# =============================================================================
# 8. PostgreSQL 16 (hardened)
# =============================================================================
info "[8/14] Installing and hardening PostgreSQL 16..."
sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update -y
apt-get install -y postgresql-16 postgresql-client-16
systemctl enable postgresql
systemctl start postgresql

PG_CONF_DIR="/etc/postgresql/16/main"
PG_HBA="$PG_CONF_DIR/pg_hba.conf"
PG_CONF="$PG_CONF_DIR/postgresql.conf"

# Harden pg_hba.conf — enforce scram-sha-256, localhost only
cp "$PG_HBA" "$PG_HBA.bak.$(date +%Y%m%d)"
cat > "$PG_HBA" <<EOF
# GNNcab hardened pg_hba.conf — $(date)
# TYPE  DATABASE  USER      ADDRESS        METHOD
local   all       postgres                 peer
local   all       all                      peer
host    gnncab    gnncab    127.0.0.1/32   scram-sha-256
host    gnncab    gnncab    ::1/128        scram-sha-256
EOF

# Harden postgresql.conf — security and logging settings
: <<'DISABLED_POSTGRES_CONF_APPEND'

# ── GNNcab security hardening ─────────────────────────────────────────────
listen_addresses = 'localhost'
ssl = on
ssl_min_protocol_version = 'TLSv1.2'
password_encryption = scram-sha-256

# Connection limits
max_connections = 100
superuser_reserved_connections = 3

# Logging (essential for audit trail)
log_connections = on
log_disconnections = on
log_failed_authentications = on
log_lock_waits = on
log_duration = off
log_min_duration_statement = 2000
log_checkpoints = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_timezone = 'UTC'

# Query logging for slow queries
log_min_error_statement = error
DISABLED_POSTGRES_CONF_APPEND

cleanup_legacy_postgres_config "$PG_CONF"
install -d -m 755 "$PG_CONF_DIR/conf.d"
write_postgres_hardening_config "$PG_CONF_DIR/conf.d/99-gnncab.conf"

systemctl restart postgresql
ok "PostgreSQL 16 installed and hardened (scram-sha-256, localhost-only, SSL)"

# =============================================================================
# 9. Nginx
# =============================================================================
info "[9/14] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx
ok "Nginx installed"

# =============================================================================
# 10. Let's Encrypt TLS certificate
# =============================================================================
if is_local_domain "$DOMAIN"; then
  info "[10/14] Skipping Let's Encrypt for local Ubuntu testing..."
  warn "Local domain detected ($DOMAIN) - TLS bootstrap and Certbot were skipped"
else
  info "[10/14] Obtaining TLS certificate from Let's Encrypt..."
  apt-get install -y certbot python3-certbot-nginx
  mkdir -p /var/www/certbot

  # Minimal bootstrap config so certbot can pass ACME challenge
  cat > /etc/nginx/sites-available/gnncab <<NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    root /var/www/html;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINXEOF
  activate_nginx_site

  certbot certonly --nginx \
    --non-interactive --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN"

  # Auto-renew with reload hook
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

  # Test renewal dry-run
  certbot renew --dry-run --quiet

  # Cron fallback (Certbot also registers a systemd timer automatically)
  (crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet") | crontab -
ok "TLS certificate obtained for $DOMAIN — auto-renewal configured"

fi

# =============================================================================
# 11. App user and directories
# =============================================================================
info "[11/14] Creating app user and directory structure..."
id -u "$APP_USER" &>/dev/null || \
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"

mkdir -p "$APP_DIR" "$LOG_DIR" "$BACKUP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$LOG_DIR"
chown -R postgres:postgres "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

# App dir: gnncab owns files but root owns the directory itself
chmod 755 "$APP_DIR"
ok "App user '$APP_USER' created, directories ready"

# =============================================================================
# 12. Clone, configure, build, and start the app
# =============================================================================
info "[12/14] Deploying application..."

sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  if [ -d .git ]; then
    if git remote get-url origin >/dev/null 2>&1; then
      git remote set-url origin $REPO_URL
    else
      git remote add origin $REPO_URL
    fi
    git fetch --prune origin
    git checkout -B $DEPLOY_BRANCH origin/$DEPLOY_BRANCH
    git reset --hard origin/$DEPLOY_BRANCH
  else
    git clone --branch $DEPLOY_BRANCH $REPO_URL .
  fi

  if [ ! -f .env ]; then
    cp .env.example .env
  fi
"

upsert_env_value "$APP_DIR/.env" "INSTALL_MODE" "$INSTALL_MODE"

echo ""
warn "ACTION REQUIRED: Review $APP_DIR/.env before continuing."
warn "  INSTALL_MODE has been set to $INSTALL_MODE automatically"
warn "  Set JWT_SECRET, ALLOWED_ORIGINS, PORT, and routing values for this mode"
warn "  Generate a JWT secret: openssl rand -base64 64"
until validate_setup_env_file "$APP_DIR/.env"; do
  warn "Edit $APP_DIR/.env to fix the validation errors above."
  read -rp "  Press Enter after updating .env (Ctrl+C to abort)..."
done

# Set up PostgreSQL user and database
DB_PASS=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 40)
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'gnncab';" | tr -d '[:space:]')

if [[ "$DB_EXISTS" == "1" ]]; then
  EXISTING_TABLE_COUNT=$(sudo -u postgres psql -d gnncab -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d '[:space:]')

  if [[ "${EXISTING_TABLE_COUNT:-0}" != "0" ]]; then
    warn "Detected existing non-empty database 'gnncab'."
    warn "deploy/setup.sh is for new/empty database bootstrap only."
    warn "Use deploy/update.sh $DOMAIN for controlled updates."
    exit 1
  fi
fi

echo ""
ROLE_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'gnncab';" | tr -d '[:space:]')
info "Preparing PostgreSQL user 'gnncab' for first-deploy bootstrap..."
if [[ "$ROLE_EXISTS" == "1" ]]; then
  sudo -u postgres psql -c "ALTER USER gnncab WITH PASSWORD '$DB_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE LOGIN CONNECTION LIMIT 50;"
else
  sudo -u postgres psql -c "CREATE USER gnncab WITH PASSWORD '$DB_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE LOGIN CONNECTION LIMIT 50;"
fi

if [[ "$DB_EXISTS" == "1" ]]; then
  sudo -u postgres psql -c "ALTER DATABASE gnncab OWNER TO gnncab;"
else
  sudo -u postgres psql -c "CREATE DATABASE gnncab OWNER gnncab ENCODING 'UTF8';"
fi

# Inject DB password into .env
DB_URL="postgresql://gnncab:${DB_PASS}@localhost:5432/gnncab"
sed -i "s|DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$APP_DIR/.env"
echo ""
ok "PostgreSQL database 'gnncab' is ready for first-deploy bootstrap — password stored in .env"

sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  set -a
  . ./.env
  set +a
  pnpm install --frozen-lockfile
  pnpm --filter @workspace/db run migrate
  pnpm --filter @workspace/api-server run build
  pnpm --filter @workspace/gnncab run build
"

warn "Production setup does not create an admin automatically."
warn "Run an explicit bootstrap command after setup completes:"
warn "  cd $APP_DIR && pnpm --filter @workspace/scripts run bootstrap-admin -- --email admin@example.com --password 'StrongPassword!1'"

# Deploy Nginx config
install_nginx_global_config
if is_local_domain "$DOMAIN"; then
  render_local_nginx_config "$DOMAIN"
else
  render_production_nginx_config "$DOMAIN"
fi
activate_nginx_site
if is_local_domain "$DOMAIN"; then
  ok "Nginx configured for local HTTP-only testing"
else
  ok "Nginx configured with production TLS settings"
fi

# Start PM2
sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  pm2 start deploy/ecosystem.config.cjs --env production
  pm2 save
"
pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" | grep 'sudo' | bash
ok "PM2 single-worker process started and registered for auto-start on reboot"

# =============================================================================
# 13. Backup cron job
# =============================================================================
info "[13/14] Configuring PostgreSQL backup cron jobs..."

# Install backup script
cp "$APP_DIR/deploy/backup.sh" /usr/local/bin/gnncab-backup
chmod +x /usr/local/bin/gnncab-backup

# Daily backup at 02:00 UTC (as postgres user)
(crontab -u postgres -l 2>/dev/null | grep -v gnncab-backup; \
 echo "0 2 * * * /usr/local/bin/gnncab-backup >> $LOG_DIR/backup.log 2>&1") \
 | crontab -u postgres -

# Weekly full backup on Sunday at 01:00 UTC
(crontab -u postgres -l 2>/dev/null | grep -v gnncab-backup-weekly; \
 echo "0 1 * * 0 /usr/local/bin/gnncab-backup full >> $LOG_DIR/backup.log 2>&1") \
 | crontab -u postgres -
ok "Backup cron jobs configured — daily at 02:00 UTC, full weekly on Sunday"

# =============================================================================
# 14. Final security audit summary
# =============================================================================
info "[14/14] Running final security checks..."

echo ""
echo "$BANNER"
echo "  GNNcab Deployment Setup Complete"
echo "$BANNER"
echo ""
if is_local_domain "$DOMAIN"; then
  echo "  URL           : http://$DOMAIN"
else
  echo "  URL           : https://$DOMAIN"
fi
echo "  SSH port      : $SSH_PORT (old port 22 is now blocked by UFW)"
echo "  App directory : $APP_DIR"
echo "  Backups       : $BACKUP_DIR"
echo "  Logs          : $LOG_DIR"
echo ""
echo "  Security status:"
ufw status | sed 's/^/    /'
echo ""
echo "  fail2ban jails:"
fail2ban-client status 2>/dev/null | sed 's/^/    /' || echo "    (starting...)"
echo ""
echo "  PM2 processes:"
sudo -u "$APP_USER" pm2 list 2>/dev/null | sed 's/^/    /' || echo "    (check: pm2 list)"
echo ""
echo "$BANNER"
echo "  POST-SETUP CHECKLIST:"
echo "  [ ] Verify SSH login on port $SSH_PORT with your key"
if is_local_domain "$DOMAIN"; then
  echo "  [ ] Confirm http://$DOMAIN loads correctly"
else
  echo "  [ ] Confirm https://$DOMAIN loads correctly"
fi
echo "  [ ] Review $APP_DIR/.env — ensure all secrets are set"
echo "  [ ] Set up remote backup storage in deploy/backup.sh (RCLONE_REMOTE)"
echo "  [ ] Run: fail2ban-client status gnncab-auth"
echo "  [ ] Subscribe to DigitalOcean alerts (CPU, memory, disk)"
echo "$BANNER"
