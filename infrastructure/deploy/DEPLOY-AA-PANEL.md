# Deploying Copinex to the aaPanel live server

Auto-deploy is wired at both ends. This file is the server-side half —
do it once, then every push to `main` deploys itself.

## Status

- GitHub → panel delivery: VERIFIED (webhook `692031437`, push events,
  ping delivery `200 OK`). No pull credentials needed — the repo is public.
- Server half: DO NOW (below). Until then, pushes trigger the hook but the
  panel has no deployment script attached, so nothing happens on the server.

## One-time server setup (SSH as root)

```sh
# 1. Toolchain (skip what aaPanel already provides)
node -v   # need 20+; pnpm -v; pm2 -v; psql --version
# If missing: install Node 20 LTS + pnpm + pm2 + PostgreSQL 16.

# 2. Checkout (public repo — no token needed, never put one here)
git clone https://github.com/Ebankz007/Copinex.git /www/wwwroot/copinex
cd /www/wwwroot/copinex && git checkout main

# 3. Production env — THE secrets live here and ONLY here.
#    Copy platform/.env.production.example to platform/.env and fill:
#      DATABASE_URL (production postgres role, strong password)
#      JWT_SECRET   (openssl rand -base64 48 — NOT any dev value)
#      PAY2CRYPTO_API_URL + PAY2CRYPTO_TOKEN (live merchant token)
#      PAY2CRYPTO_WEBHOOK_SECRET (openssl rand -base64 32)
#      SMTP_URL + EMAIL_FROM + EMAIL_REPLY_TO (SMTP.com sender or Mailgun)
#      APP_URL=https://<your-domain>  TRUST_PROXY=1
#    The API refuses to boot with placeholders or missing rail/mail config —
#    that refusal is the checklist working, not a bug.

# 4. Production database + first migration + seed
sudo -u postgres psql -c "CREATE ROLE copinex LOGIN PASSWORD '<strong>';"
sudo -u postgres psql -c "CREATE DATABASE copinex OWNER copinex;"
cd /www/wwwroot/copinex/platform
pnpm install --frozen-lockfile
pnpm --filter @copinex/database migrate
# Seed ONLY the permission catalog + your own admin account. NEVER run the
# dev seed-users here: its passwords are published in git history.

# 5. Register the processes (names must match deploy.sh RESTART_CMD)
pm2 start apps/api/dist/index.js --name copinex-api   # after pnpm build (step 6)
pm2 start "node_modules/.bin/next start -p 3000" --name copinex-web
pm2 save && pm2 startup   # resurrect on reboot

# 6. First deploy by hand (proves the script before automation does)
bash infrastructure/deploy/deploy.sh
curl -sf http://127.0.0.1:4000/api/health && curl -sf http://127.0.0.1:3000/api/health
```

## Attach the script to the webhook (aaPanel panel)

1. Open the panel → webhook/hook entry for the site (`site_id=56`).
2. Paste the contents of `infrastructure/deploy/deploy.sh`, adjusting only
   the `── Configure these ──` block (APP_DIR, ports, PM2 names).
3. Save. Push any commit to `main` → panel runs it → `deploy.log` in
   APP_DIR records every deployment (commit + UTC time).

## Verify end-to-end

1. Push to `main`.
2. GitHub → repo Settings → Webhooks → the hook → Recent Deliveries →
   the push delivery must be green (200).
3. On the server: `tail deploy.log`, both health URLs 200, site loads
   on the domain.

## Rollback

Automatic on health-check failure (previous commit + rebuild + restart).
Manual: `cd APP_DIR && git reset --hard <sha> && bash
infrastructure/deploy/deploy.sh` (replays full build + health gate).

## Credential hygiene (do this week)

- The GitHub PAT used to create the webhook: **revoke it now**
  (Settings → Developer settings → Personal access tokens). It is also in
  chat history — treat it as burned. The server never needs it (public repo).
- The webhook `access_key` is in chat history too: regenerate it in the
  panel and update the GitHub webhook URL to match.
- Never put the live Pay2Crypto token or SMTP passwords anywhere but the
  server `.env`.
