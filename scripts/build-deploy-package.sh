#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_ROOT="$REPO_ROOT/release"
PACKAGE_DIR="$RELEASE_ROOT/gnncab-deploy"
ARCHIVE_PATH="$RELEASE_ROOT/gnncab-deploy.tar.gz"
CREATE_TARBALL="${CREATE_TARBALL:-1}"

ensure_safe_release_target() {
  case "$PACKAGE_DIR" in
    "$RELEASE_ROOT"/gnncab-deploy) ;;
    *)
      echo "ERROR: unsafe package directory target: $PACKAGE_DIR" >&2
      exit 1
      ;;
  esac

  case "$ARCHIVE_PATH" in
    "$RELEASE_ROOT"/gnncab-deploy.tar.gz) ;;
    *)
      echo "ERROR: unsafe archive target: $ARCHIVE_PATH" >&2
      exit 1
      ;;
  esac
}

copy_tracked_file() {
  local relative_path="$1"
  local source_path="$REPO_ROOT/$relative_path"
  local target_path="$PACKAGE_DIR/$relative_path"

  if [[ ! -e "$source_path" ]]; then
    echo "ERROR: required path is missing: $relative_path" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$target_path")"
  cp -Rp "$source_path" "$target_path"
}

copy_tracked_path() {
  local relative_path="$1"
  local source_path="$REPO_ROOT/$relative_path"

  if [[ -f "$source_path" ]]; then
    copy_tracked_file "$relative_path"
    return
  fi

  if [[ ! -d "$source_path" ]]; then
    echo "ERROR: required path is missing: $relative_path" >&2
    exit 1
  fi

  local tracked_files=()
  mapfile -t tracked_files < <(git -C "$REPO_ROOT" ls-files -- "$relative_path")

  if [[ "${#tracked_files[@]}" -eq 0 ]]; then
    echo "ERROR: no tracked files found under: $relative_path" >&2
    exit 1
  fi

  for tracked_file in "${tracked_files[@]}"; do
    if [[ -f "$REPO_ROOT/$tracked_file" ]]; then
      copy_tracked_file "$tracked_file"
    fi
  done
}

ROOT_FILES=(
  ".env.example"
  ".npmrc"
  "DEPLOYMENT.md"
  "package.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "tsconfig.base.json"
  "tsconfig.json"
)

DEPLOY_PATHS=(
  "deploy/backup-restore.sh"
  "deploy/backup.sh"
  "deploy/ecosystem.config.cjs"
  "deploy/fail2ban"
  "deploy/nginx.conf"
  "deploy/postgres-setup.sql"
  "deploy/security-hardening.sh"
  "deploy/setup.sh"
  "deploy/update.sh"
)

API_SERVER_PATHS=(
  "artifacts/api-server/build.ts"
  "artifacts/api-server/package.json"
  "artifacts/api-server/src"
  "artifacts/api-server/tsconfig.json"
)

FRONTEND_PATHS=(
  "artifacts/gnncab/index.html"
  "artifacts/gnncab/package.json"
  "artifacts/gnncab/public"
  "artifacts/gnncab/src"
  "artifacts/gnncab/tsconfig.json"
  "artifacts/gnncab/vite.config.ts"
)

LIBRARY_PATHS=(
  "lib/api-client-react/package.json"
  "lib/api-client-react/src"
  "lib/api-client-react/tsconfig.json"
  "lib/api-zod/package.json"
  "lib/api-zod/src"
  "lib/api-zod/tsconfig.json"
  "lib/db/drizzle"
  "lib/db/drizzle.config.ts"
  "lib/db/package.json"
  "lib/db/src"
  "lib/db/tsconfig.json"
)

SCRIPT_PATHS=(
  "scripts/package.json"
  "scripts/src/bootstrap-admin.ts"
  "scripts/tsconfig.json"
)

EXPECTED_PATHS=(
  "deploy/setup.sh"
  "deploy/update.sh"
  "deploy/backup.sh"
  "deploy/backup-restore.sh"
  "artifacts/api-server/package.json"
  "artifacts/gnncab/package.json"
  "lib/db/drizzle/0000_init.sql"
  "scripts/src/bootstrap-admin.ts"
  "package.json"
  "pnpm-lock.yaml"
)

echo "Preparing generated deploy package under: $PACKAGE_DIR"

ensure_safe_release_target
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"
rm -f "$ARCHIVE_PATH"

for relative_path in "${ROOT_FILES[@]}"; do
  copy_tracked_path "$relative_path"
done

for relative_path in "${DEPLOY_PATHS[@]}"; do
  copy_tracked_path "$relative_path"
done

for relative_path in "${API_SERVER_PATHS[@]}"; do
  copy_tracked_path "$relative_path"
done

for relative_path in "${FRONTEND_PATHS[@]}"; do
  copy_tracked_path "$relative_path"
done

for relative_path in "${LIBRARY_PATHS[@]}"; do
  copy_tracked_path "$relative_path"
done

for relative_path in "${SCRIPT_PATHS[@]}"; do
  copy_tracked_path "$relative_path"
done

for relative_path in "${EXPECTED_PATHS[@]}"; do
  if [[ ! -e "$PACKAGE_DIR/$relative_path" ]]; then
    echo "ERROR: expected packaged path is missing: $relative_path" >&2
    exit 1
  fi
done

if [[ "$CREATE_TARBALL" == "1" ]]; then
  if command -v tar >/dev/null 2>&1; then
    tar -czf "$ARCHIVE_PATH" -C "$RELEASE_ROOT" gnncab-deploy
    echo "Created archive: $ARCHIVE_PATH"
  else
    echo "WARNING: tar not available; skipped archive creation." >&2
  fi
fi

echo "Deploy package ready:"
echo "  $PACKAGE_DIR"
if [[ -f "$ARCHIVE_PATH" ]]; then
  echo "  $ARCHIVE_PATH"
fi
