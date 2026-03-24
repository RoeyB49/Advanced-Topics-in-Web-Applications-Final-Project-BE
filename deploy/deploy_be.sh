#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/animon-be}"
BRANCH="${BRANCH:-main}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "Backend directory does not exist: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "[BE] Updating source..."
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[BE] Installing dependencies..."
npm ci

echo "[BE] Building..."
npm run build

mkdir -p uploads/posts uploads/profiles

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[BE] Installing pm2 globally..."
  sudo npm install -g pm2
fi

echo "[BE] Starting/reloading process with pm2..."
pm2 startOrReload deploy/ecosystem.config.cjs --env production
pm2 save

echo "[BE] Deployment completed."
pm2 status animon-be
