# Production deployment

Target URL: `https://shop.csscdn.co.uk/`

Runtime allocation:

- application: `css-store`
- loopback address: `127.0.0.1`
- port: `3068`
- process manager: PM2
- reverse proxy: Nginx

Port `3068` is intentionally adjacent to the existing CSS services on `3066` and `3067` and is not present in the current registered proxy list. Verify it is free on the host before first start:

```bash
sudo ss -ltnp | grep ':3068 ' || true
```

## 1. DNS

Point `shop.csscdn.co.uk` at the production server before requesting the certificate.

## 2. Application checkout and environment

A suggested production path is:

```bash
/srv/css/css_store
```

Keep Magento credentials/endpoints in an uncommitted production environment file. For example:

```bash
cd /srv/css/css_store
cp .env.example .env.production.local
$EDITOR .env.production.local
```

At minimum configure the real values for:

```dotenv
MAGENTO_GRAPHQL_URL=https://<magento-host>/graphql
MAGENTO_BASE_URL=https://<magento-host>
MAGENTO_STORE_CODE=default
NEXT_PUBLIC_STORE_NAME=Chelmsford Safety Supplies
```

Do not put secrets in `ecosystem.config.cjs`.

## 3. Build and start with PM2

```bash
cd /srv/css/css_store
git pull --ff-only
yarn install
yarn build
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

The PM2 process binds Next.js to loopback only:

```text
127.0.0.1:3068
```

Check it before exposing Nginx:

```bash
pm2 status css-store
pm2 logs css-store --lines 100
curl -I http://127.0.0.1:3068/login
```

If PM2 is not already configured to return after a reboot, run `pm2 startup` as the deploy user and execute the command PM2 prints, then run `pm2 save` again.

## 4. Obtain the first certificate

The repository contains an HTTP-only bootstrap vhost at:

```text
deploy/nginx/shop.csscdn.co.uk.bootstrap.conf
```

Install it temporarily:

```bash
sudo mkdir -p /var/www/css-acme
sudo cp deploy/nginx/shop.csscdn.co.uk.bootstrap.conf /etc/nginx/sites-available/shop.csscdn.co.uk
sudo ln -sfn /etc/nginx/sites-available/shop.csscdn.co.uk /etc/nginx/sites-enabled/shop.csscdn.co.uk
sudo nginx -t
sudo systemctl reload nginx
```

Then request the certificate with the same webroot pattern used by the other CSS hosts:

```bash
sudo certbot certonly --webroot -w /var/www/css-acme -d shop.csscdn.co.uk
```

## 5. Enable the production HTTPS vhost

Replace the bootstrap site with:

```text
deploy/nginx/shop.csscdn.co.uk.conf
```

```bash
sudo cp deploy/nginx/shop.csscdn.co.uk.conf /etc/nginx/sites-available/shop.csscdn.co.uk
sudo nginx -t
sudo systemctl reload nginx
```

Validate:

```bash
curl -I https://shop.csscdn.co.uk/login
```

## Routine deploy

After the first deployment, a normal release is:

```bash
cd /srv/css/css_store
git pull --ff-only
yarn install
yarn build
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

Then check:

```bash
pm2 status css-store
curl -I http://127.0.0.1:3068/login
curl -I https://shop.csscdn.co.uk/login
```
