#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/osso"
APP_NAME="osso"

echo "==> Deploy start: $(date)"
cd "$APP_DIR"

if [ ! -f ".env.production" ]; then
  echo "ERROR: .env.production not found in $APP_DIR"
  exit 1
fi

echo "==> Pull latest code"
git fetch --all --prune
git reset --hard origin/main

echo "==> Install dependencies"
npm ci

echo "==> Prisma generate + migrate"
npx prisma generate
npx prisma migrate deploy

echo "==> Clean Next cache and build"
rm -rf .next
npm run build

echo "==> Restart app via PM2"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "==> Deploy done: $(date)"
