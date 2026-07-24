#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/culturefit}"
API_URL="${API_URL:-https://api-culturefit.chimaobi.xyz}"
FRONTEND_API_URL="${VITE_API_BASE_URL:-https://api-culturefit.chimaobi.xyz}"
ENV_FILE="${ENV_FILE:-/etc/culturefit/backend.env}"

cd "$APP_DIR"
git pull --ff-only

npm ci --prefix backend
set -a
source "$ENV_FILE"
set +a
npm run db:migrate --prefix backend
npm run build --prefix backend

npm ci --prefix frontend
VITE_API_BASE_URL="$FRONTEND_API_URL" npm run build --prefix frontend

sudo systemctl restart culturefit-api
sudo nginx -t
sudo systemctl reload nginx

curl --fail --silent --show-error "$API_URL/api/health"
printf '\nDeployment complete.\n'
