#!/usr/bin/env bash
# =============================================================================
# GNNcab - Controlled deployment update script
# =============================================================================
# Usage (run from the app directory as root or app user with sudo):
#   sudo ./deploy/update.sh <domain>
#
# What this script does:
#   1. Pulls the latest code from the canonical deploy branch
#   2. Installs new/updated dependencies
#   3. Runs a mandatory local backup gate before any DB-changing operation
#   4. Runs any checked-in database schema migrations
#   5. Rebuilds the API server bundle
#   6. Rebuilds the frontend
#   7. Reloads the PM2-managed API process in single-worker mode
#   8. Re-renders and reloads the Nginx site config for the explicit DOMAIN
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
INSTALL_MODE_RAW="${INSTALL_MODE:-${2:-}}"
APP_DIR="/var/www/gnncab"
APP_USER="gnncab"
REPO_URL="${REPO_URL:-https://github.com/BigDesigner/GNNcab}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
INSTALL_MODE=""

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo ./deploy/update.sh <domain> [install-mode]"
  echo "  e.g. sudo ./deploy/update.sh gnncab.example.com production"
  echo "  e.g. INSTALL_MODE=local sudo ./deploy/update.sh 192.168.1.50"
  exit 1
fi

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
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    echo "  Nginx reloaded."
  else
    echo "  WARNING: Nginx config test failed - not reloading. Fix errors in /etc/nginx/sites-available/gnncab"
  fi
}
EOF
}

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
      *) echo "  ERROR: Please enter 1 for local/test or 2 for production." >&2 ;;
    esac
  done
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

is_real_domain() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] && ! is_local_domain "$1"
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

require_install_mode() {
  local env_install_mode=""

  if [[ -n "$INSTALL_MODE_RAW" ]]; then
    if ! INSTALL_MODE=$(normalize_install_mode "$INSTALL_MODE_RAW"); then
      echo "ERROR: INSTALL_MODE must be one of: local, test, production" >&2
      exit 1
    fi
    return
  fi

  if [[ -f "$APP_DIR/.env" ]]; then
    unset INSTALL_MODE
    load_env_file "$APP_DIR/.env"
    if env_install_mode=$(normalize_install_mode "${INSTALL_MODE:-}" 2>/dev/null); then
      INSTALL_MODE="$env_install_mode"
      return
    fi
  fi

  prompt_install_mode
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

validate_update_env_file() {
  local env_install_mode=""
  local selected_mode="$INSTALL_MODE"

  VALIDATION_ERRORS=()
  unset INSTALL_MODE DATABASE_URL PORT NODE_ENV JWT_SECRET ALLOWED_ORIGINS ROUTING_PROVIDER OSRM_BASE_URL
  load_env_file "$APP_DIR/.env"

  if ! env_install_mode=$(normalize_install_mode "${INSTALL_MODE:-}" 2>/dev/null); then
    append_validation_error "INSTALL_MODE in .env must be set to 'local' or 'production'."
  elif [[ "$env_install_mode" != "$selected_mode" ]]; then
    append_validation_error "INSTALL_MODE in .env ($env_install_mode) does not match the selected install mode ($selected_mode)."
  fi

  if [[ -z "${DATABASE_URL:-}" || "${DATABASE_URL}" != postgresql://* ]]; then
    append_validation_error "DATABASE_URL must be a valid postgresql:// connection string."
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
    append_validation_error "NODE_ENV must be set to production for deploy/update flows."
  fi

  case "${ROUTING_PROVIDER:-}" in
    mock|osrm) ;;
    *) append_validation_error "ROUTING_PROVIDER must be explicitly set to 'mock' or 'osrm'." ;;
  esac

  if [[ "${ROUTING_PROVIDER:-}" == "osrm" && -z "${OSRM_BASE_URL:-}" ]]; then
    append_validation_error "OSRM_BASE_URL is required when ROUTING_PROVIDER=osrm."
  fi

  if [[ "$selected_mode" == "production" && "${ROUTING_PROVIDER:-}" != "osrm" ]]; then
    append_validation_error "Production mode requires ROUTING_PROVIDER=osrm."
  fi

  if [[ "${#VALIDATION_ERRORS[@]}" -gt 0 ]]; then
    echo "ERROR: .env validation failed:" >&2
    printf '  - %s\n' "${VALIDATION_ERRORS[@]}" >&2
    exit 1
  fi
}

cd "$APP_DIR"
require_install_mode
validate_domain_for_mode
validate_update_env_file

echo "======================================================================"
echo "  GNNcab update - $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Mode         : $INSTALL_MODE"
echo "  Domain       : $DOMAIN"
echo "  Deploy branch: $DEPLOY_BRANCH"
echo "======================================================================"

echo "[1/8] Pulling latest code..."
sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin $REPO_URL
  else
    git remote add origin $REPO_URL
  fi
  git fetch --prune origin
  git checkout -B $DEPLOY_BRANCH origin/$DEPLOY_BRANCH
  git reset --hard origin/$DEPLOY_BRANCH
"
echo "  HEAD is now: $(git log --oneline -1)"

echo "[2/8] Installing dependencies..."
sudo -u "$APP_USER" pnpm install --frozen-lockfile

echo "[3/8] Running mandatory pre-migration backup gate..."
if [[ ! -x /usr/local/bin/gnncab-backup ]]; then
  echo "  ERROR: /usr/local/bin/gnncab-backup is missing or not executable."
  echo "  Aborting before database migration."
  exit 1
fi

if /usr/local/bin/gnncab-backup; then
  echo "  Backup gate passed."
else
  echo "  ERROR: Backup gate failed. Aborting before database migration."
  exit 1
fi

echo "[4/8] Applying checked-in database migrations..."
sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  set -a
  . ./.env
  set +a
  pnpm --filter @workspace/db run migrate
"

echo "[5/8] Building API server..."
sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  set -a
  . ./.env
  set +a
  pnpm --filter @workspace/api-server run build
"

echo "[6/8] Building frontend..."
sudo -u "$APP_USER" bash -c "
  set -e
  cd $APP_DIR
  set -a
  . ./.env
  set +a
  pnpm --filter @workspace/gnncab run build
"

echo "[7/8] Reloading the PM2 API process..."
sudo -u "$APP_USER" pm2 reload gnncab-api --update-env
sudo -u "$APP_USER" pm2 save

echo "[8/8] Re-applying Nginx configuration for $DOMAIN..."
install_nginx_global_config
if is_local_domain "$DOMAIN"; then
  render_local_nginx_config "$DOMAIN"
else
  render_production_nginx_config "$DOMAIN"
fi
activate_nginx_site

echo ""
echo "======================================================================"
echo "  Update complete - $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Process list:     pm2 list"
echo "  Tail logs:        pm2 logs gnncab-api --lines 50"
echo "======================================================================"
