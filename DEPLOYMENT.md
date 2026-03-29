# GNNcab - DigitalOcean Deployment Guide

## Architecture Overview

```text
Internet
    |  HTTPS :443 / HTTP :80
    v
  Nginx ---- TLS (Let's Encrypt)
    |
    |-- /             -> Static frontend build (dist/)
    |-- /api/*        -> PM2 single worker by default (Node.js Express, port 3000)
  `-- /ws           -> WebSocket proxy -> same PM2 process
```

## Generated Deploy Package

`release/` is generated local packaging output only. It is not part of the maintained source tree, must stay ignored by git, and must not be treated as a second living codebase.

- Build a deploy package locally with:
  - `bash scripts/build-deploy-package.sh`
- Generated output lives only under:
  - `release/gnncab-deploy/`
  - optionally `release/gnncab-deploy.tar.gz`
- Normal repository review, audit, search, validation, and patching must ignore `release/` unless a task explicitly asks to inspect generated release artifacts.
- Production validation may be run against the generated release package, but source-of-truth development work must continue in the real repository tree.

## Prerequisites

| Requirement | Version |
|---|---|
| Ubuntu | 22.04 LTS or 24.04 LTS |
| Node.js | 24.x |
| pnpm | latest |
| PostgreSQL | 16 |
| Nginx | >= 1.18 |
| PM2 | >= 5 |
| Certbot | latest |

---

## 1. Create a DigitalOcean Droplet

1. Create a **Basic** Droplet (4 GB RAM / 2 vCPUs recommended)
2. Choose **Ubuntu 22.04 LTS**
3. Add your SSH key
4. Enable **Backups** (optional but recommended)
5. Note the public IP address

For public HTTPS deployment, point your domain's DNS **A record** to the Droplet IP before running setup so Certbot can validate the host.

For local Ubuntu testing, you can use `localhost` or another explicit local-only host such as `gnncab.local`; the setup/update path will stay HTTP-only in that mode.

---

## 2. First-Time Setup (Automated)

SSH into your Droplet as root and run the setup script:

```bash
ssh root@YOUR_DROPLET_IP

# Clone the repo first (or upload the deploy/ directory)
git clone https://github.com/BigDesigner/GNNcab /tmp/gnncab-setup
cd /tmp/gnncab-setup

# Run the setup script
chmod +x deploy/setup.sh
./deploy/setup.sh yourdomain.com admin@yourdomain.com

# Local Ubuntu test setup (HTTP only, no Certbot)
./deploy/setup.sh localhost local@example.test
```

The script will pause and ask you to edit `.env` - do that before pressing Enter.

The automated setup path is for a new or empty `gnncab` database only. If setup detects an existing non-empty database, it will abort and you should use the controlled update path instead.

---

## 3. Manual Setup (Step-by-Step)

If you prefer full control, follow these steps:

### 3a. Install system packages

```bash
apt-get update && apt-get upgrade -y
apt-get install -y curl wget gnupg2 git build-essential ufw \
  ca-certificates lsb-release software-properties-common

# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

# pnpm and PM2
npm install -g pnpm pm2 pm2-logrotate

# PostgreSQL 16
sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update && apt-get install -y postgresql-16

# Nginx
apt-get install -y nginx

# Certbot
apt-get install -y certbot python3-certbot-nginx
```

### 3b. Configure PostgreSQL

```bash
# Set a strong password - save it for DATABASE_URL
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'POSTGRES_ADMIN_PASS';"

# Run the app DB setup script
sudo -u postgres psql -f /var/www/gnncab/deploy/postgres-setup.sql
# (Edit the file first to replace STRONG_PASSWORD_HERE)
```

### 3c. Configure environment

```bash
cp /var/www/gnncab/.env.example /var/www/gnncab/.env
nano /var/www/gnncab/.env
```

Key values to set:

| Variable | How to get |
|---|---|
| `DATABASE_URL` | `postgresql://gnncab:YOUR_DB_PASS@localhost:5432/gnncab` |
| `JWT_SECRET` | `openssl rand -base64 64` |
| `ALLOWED_ORIGINS` | Exact browser origin(s) only, such as `https://yourdomain.com` or `http://localhost:5173` for local testing; wildcard `*` is not allowed |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `ROUTING_PROVIDER` | `osrm` in production; use `mock` only for intentional local/dev testing |
| `OSRM_BASE_URL` | `http://localhost:5000` (required whenever `ROUTING_PROVIDER=osrm`) |
| `REDIS_URL` | optional for single-worker mode; required before enabling multi-worker PM2 cluster mode |

Current verified runtime expectations:

- `ALLOWED_ORIGINS` must be a non-empty list of exact browser origins.
- `ALLOWED_ORIGINS` must not include wildcard `*`.
- Production routing must use `ROUTING_PROVIDER=osrm`.
- `OSRM_BASE_URL` is required whenever `ROUTING_PROVIDER=osrm`.
- Treat `mock` routing as local/dev-only, not a production fallback.

### 3d. Apply checked-in migrations

```bash
cd /var/www/gnncab
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate
```

### 3e. Bootstrap first admin

```bash
cd /var/www/gnncab
pnpm --filter @workspace/scripts run bootstrap-admin -- \
  --email admin@yourdomain.com \
  --password 'ChangeMe!123' \
  --first-name System \
  --last-name Admin
```

This command creates exactly one admin user and aborts if an admin already exists or if the requested email is already taken.

### 3f. Build

```bash
# Build the API server (outputs to artifacts/api-server/dist/index.cjs)
pnpm --filter @workspace/api-server run build

# Build the React frontend (outputs to artifacts/gnncab/dist/)
pnpm --filter @workspace/gnncab run build
```

### 3g. Obtain TLS certificate

```bash
# Temporary Nginx config for ACME challenge
certbot certonly --nginx -d yourdomain.com \
  --non-interactive --agree-tos --email admin@yourdomain.com

# Enable auto-renewal
(crontab -l; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
```

### 3h. Configure Nginx

```bash
# Replace placeholder with your domain
sed 's/DOMAIN_PLACEHOLDER/yourdomain.com/g' /var/www/gnncab/deploy/nginx.conf \
  | sed '/server_name /s/ www\.yourdomain\.com//g' \
  > /etc/nginx/sites-available/gnncab

ln -sf /etc/nginx/sites-available/gnncab /etc/nginx/sites-enabled/gnncab
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
```

### 3i. Start PM2

```bash
cd /var/www/gnncab
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save

# Start PM2 automatically on reboot
pm2 startup systemd -u gnncab --hp /var/www/gnncab | tail -1 | bash
```

Current verified runtime behavior:

- the backend bootstrap sends the PM2 ready signal after the HTTP server is listening
- the default PM2 production mode is a single worker
- do not switch back to multi-worker cluster mode unless Redis/pubsub is provisioned and configured

### 3j. Configure firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 4. Deploying Updates

```bash
ssh root@YOUR_DROPLET_IP
cd /var/www/gnncab
./deploy/update.sh yourdomain.com

# Local Ubuntu test update
./deploy/update.sh localhost
```

This pulls the canonical `master` branch from `https://github.com/BigDesigner/GNNcab`, runs a mandatory local backup gate via `/usr/local/bin/gnncab-backup`, applies checked-in database migrations, rebuilds the app, reapplies the repository Nginx template for the explicit `DOMAIN`, and reloads the PM2-managed API process using the current ecosystem config.

With the current verified production default (`instances: 1`, `exec_mode: "fork"`), treat this as a controlled single-process reload, not a correctness-safe multi-worker rollout.

---

## 5. PM2 Operations Reference

```bash
# View process list
pm2 list

# Tail live logs
pm2 logs gnncab-api

# Tail last 100 lines
pm2 logs gnncab-api --lines 100

# Restart the API process
pm2 restart gnncab-api

# Reload the API process with updated environment/config
pm2 reload gnncab-api --update-env

# Stop
pm2 stop gnncab-api

# Monitor CPU / memory in real time
pm2 monit
```

---

## 6. Database Operations

```bash
# Connect to the database
sudo -u postgres psql gnncab

# Apply checked-in schema migrations
pnpm --filter @workspace/db run migrate

# Generate a new migration during development/maintenance work
pnpm --filter @workspace/db run generate -- --name describe_change

# Run sample seed data for local/dev environments only
pnpm --filter @workspace/scripts run seed

# Create a full local backup before DB-changing maintenance
sudo /usr/local/bin/gnncab-backup full

# Verify the latest backup artifact and checksum
sudo /usr/local/bin/gnncab-backup verify

# Restore from a selected backup (downtime-causing)
sudo bash deploy/backup-restore.sh
```

Backup invocation model:

- `deploy/backup.sh` is safe to invoke either:
  - as `postgres` (cron / direct local DB ops)
  - or as `root` (manual maintenance, update gate, live-restore emergency backup)
- when invoked as `root`, the script drops into the `postgres` OS user for local PostgreSQL access so peer-auth remains reliable

---

## 7. Rollback / Restore Runbook

Use this when a deployment or migration must be rolled back and the last known-good state requires a database restore. This is a downtime-based rollback path.

```bash
# 1. Identify the backup you want to restore
sudo /usr/local/bin/gnncab-backup list

# 2. Stop the API
sudo -u gnncab pm2 stop gnncab-api

# 3. Restore the database from the chosen backup
sudo bash deploy/backup-restore.sh /var/backups/gnncab/.../YOUR_BACKUP.sql.gz

# 4. Roll code back to the last known-good commit
cd /var/www/gnncab
git fetch origin
git checkout <known-good-commit>
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/gnncab run build

# 5. Start the API again
sudo -u gnncab pm2 start gnncab-api
```

Notes:

- `deploy/backup-restore.sh` performs an emergency local full backup before a destructive live restore of the primary `gnncab` database.
- Choose a backup that matches the code revision you are rolling back to; do not re-run forward schema changes as part of the rollback itself.
- `deploy/postgres-setup.sql` remains a manual/bootstrap reference only, not the authoritative production migration path.
- After rollback, validate HTTPS, login, and core trip flows before reopening traffic.

---

## 8. Log Locations

| Log | Path |
|---|---|
| PM2 stdout | `/var/log/gnncab/pm2-out.log` |
| PM2 stderr | `/var/log/gnncab/pm2-error.log` |
| Nginx access | `/var/log/nginx/gnncab_access.log` |
| Nginx error | `/var/log/nginx/gnncab_error.log` |
| PostgreSQL | `/var/log/postgresql/` |

---

## 9. Security Checklist

- [ ] `JWT_SECRET` is at least 64 random characters
- [ ] `ALLOWED_ORIGINS` lists only your production domains
- [ ] `NODE_ENV=production` is set
- [ ] PostgreSQL `gnncab` user has no superuser privileges
- [ ] UFW firewall is enabled - only ports 22, 80, 443 open
- [ ] TLS certificate auto-renews (`crontab -l | grep certbot`)
- [ ] Server is on a private VPC if using DigitalOcean Managed DB
- [ ] Regular `pg_dump` backups scheduled (cron or DigitalOcean Backups)
- [ ] PM2 log rotation enabled (`pm2 set pm2-logrotate:max_size 50M`)

---

## 10. Scaling

| Need | Solution |
|---|---|
| More API throughput | Provision Redis/pubsub first, then revisit safe multi-worker PM2 configuration |
| Database scaling | Migrate to DigitalOcean Managed PostgreSQL |
| WebSocket at scale | Add Redis adapter (socket.io or ws + Redis pub/sub) |
| Static asset CDN | Put Cloudflare or DigitalOcean Spaces in front of Nginx |
| Multi-region | Deploy multiple Droplets behind a DigitalOcean Load Balancer |

---

## 11. DigitalOcean Managed Database (Optional)

If using DigitalOcean's managed PostgreSQL service instead of a self-hosted instance:

1. Create a **PostgreSQL 16** cluster in the same region as your Droplet
2. Create a database named `gnncab` and user `gnncab`
3. Copy the connection string from the dashboard
4. Set `DATABASE_URL` in `.env` to that connection string
5. Add your Droplet to the database's **Trusted Sources**
6. Skip the PostgreSQL installation step in the setup script
