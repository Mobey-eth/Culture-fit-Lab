# VPS deployment

These instructions deploy the frontend to `culturefit.chimaobi.xyz` and the API to `api-culturefit.chimaobi.xyz` on the same Ubuntu VPS.

## 1. Install server packages

Install Git, Nginx, Certbot, the Certbot Nginx plugin, and Node.js 22. Confirm that `/usr/bin/node` exists because the systemd unit uses that path.

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx
node --version
```

## 2. Clone the repository

```bash
sudo mkdir -p /var/www/culturefit
sudo chown -R "$USER":www-data /var/www/culturefit
git clone https://github.com/Mobey-eth/Culture-fit-Lab.git /var/www/culturefit
```

## 3. Create the backend environment file

Never put the production file in the repository. Start from `deploy/backend.env.example` and fill it with fresh production credentials.

```bash
sudo mkdir -p /etc/culturefit
sudo cp /var/www/culturefit/deploy/backend.env.example /etc/culturefit/backend.env
sudo chown root:www-data /etc/culturefit/backend.env
sudo chmod 640 /etc/culturefit/backend.env
openssl rand -hex 32
openssl rand -hex 32
sudo nano /etc/culturefit/backend.env
```

Set `NODE_ENV=production`, keep `FRONTEND_ORIGIN=https://culturefit.chimaobi.xyz`, and use the real PostgreSQL URL and DeepSeek key. Use the two different OpenSSL values for `JWT_SECRET` and `SESSION_SECRET`.

## 4. Install, migrate, and build

```bash
cd /var/www/culturefit
npm ci --prefix backend
set -a
source /etc/culturefit/backend.env
set +a
npm run db:migrate --prefix backend
npm run build --prefix backend

npm ci --prefix frontend
VITE_API_BASE_URL=https://api-culturefit.chimaobi.xyz npm run build --prefix frontend
```

The question bank is already stored in PostgreSQL. CSV and Excel source files are intentionally not part of the repository.

## 5. Enable the API service

```bash
sudo cp /var/www/culturefit/deploy/systemd/culturefit-api.service /etc/systemd/system/culturefit-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now culturefit-api
sudo systemctl status culturefit-api --no-pager
```

## 6. Enable Nginx and HTTPS

```bash
sudo cp /var/www/culturefit/deploy/nginx/culturefit.conf /etc/nginx/sites-available/culturefit.conf
sudo ln -s /etc/nginx/sites-available/culturefit.conf /etc/nginx/sites-enabled/culturefit.conf
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx \
  -d culturefit.chimaobi.xyz \
  -d api-culturefit.chimaobi.xyz \
  --redirect
```

Certbot updates the Nginx configuration for TLS and installs automatic renewal. Verify it with `sudo certbot renew --dry-run`.

## 7. Verify the deployment

```bash
curl --fail https://api-culturefit.chimaobi.xyz/api/health
curl --head https://culturefit.chimaobi.xyz
sudo journalctl -u culturefit-api -n 100 --no-pager
```

## Updating later

`deploy/update.sh` pulls `main`, installs locked dependencies, applies migrations, rebuilds both apps, restarts the API, reloads Nginx, and checks API health.

```bash
cd /var/www/culturefit
./deploy/update.sh
```

Keep ports 4000 and 5432 closed to the public internet. Nginx should be the only public entry point on ports 80 and 443.
