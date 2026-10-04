#!/bin/sh
# Copinex auto-deploy — runs on the LIVE server on a 2-minute poll (aaPanel
# cron) and, once attached, on the panel webhook (GitHub push to main).
# Poll-driven because the panel's native hook endpoint proved inert in the
# 2026-10-04 fire drill (pushes delivered 200 but moved nothing). The script
# is idempotent: no new commit → health check only, no rebuild.
# Triggered remotely/unattended; must be fully non-interactive and fail
# LOUDLY: any failed step aborts before the next one runs, and a failed
# health check rolls back to the previous commit.
#
# One-time server setup (see DEPLOY-AA-PANEL.md):
#   1. git clone https://github.com/Ebankz007/Copinex.git (public repo: no
#      credentials needed) into APP_DIR on the server.
#   2. Paste THIS script into the aaPanel webhook entry for the site
#      (or call it from there). Keep secrets OUT of this file.
#   3. Create the production .env (never committed) + install node/pnpm/pm2.
#
# Design notes:
# - Always deploys origin/main HEAD, whatever branch was pushed (a feature-
#   branch push triggers a harmless no-op redeploy, never a wrong deploy).
# - Migrations run automatically (drizzle-kit migrate is additive-only in
#   this project: 0000-0011 add tables/columns, never drop or alter data).
# - Rollback = previous commit + rebuild + restart. The DB is NOT rolled
#   back (migrations are forward-only by design).

set -eu

# ── Configure these for the server ──────────────────────
APP_DIR="/www/wwwroot/copinex"   # server checkout of the Copinex repo
BRANCH="main"
API_PORT="4000"
WEB_PORT="3100"                  # 3000 is taken by another app on this host
API_HEALTH="http://127.0.0.1:${API_PORT}/api/health"
WEB_HEALTH="http://127.0.0.1:${WEB_PORT}/api/health"
# Absolute node/pnpm first: webhook/cron shells carry a minimal PATH.
export PATH="/www/server/nodejs/v24.18.0/bin:$PATH"
# How the two processes are (re)started. PM2 keeps the previous environment
# across `restart`, so a changed .env needs delete+start, not restart:
# the commands below do exactly that.
# ─────────────────────────────────────────────────────────

log() { echo "[deploy $(date '+%Y-%m-%dT%H:%M:%S')] $1"; }
fail() { log "FAILED: $1"; exit 1; }

# (Re)start both processes with a FRESH environment. Never `pm2 restart`:
# it preserves the old env, so a changed .env would silently not apply.
start_processes() {
  pm2 delete copinex-api copinex-web >/dev/null 2>&1 || true
  (cd "$APP_DIR/apps/api" && pm2 start dist/index.js --name copinex-api) || return 1
  (cd "$APP_DIR/apps/web" && pm2 start node_modules/next/dist/bin/next --name copinex-web -- start -p "$WEB_PORT") || return 1
  pm2 save >/dev/null 2>&1 || true
}

[ -d "$APP_DIR/.git" ] || fail "APP_DIR $APP_DIR is not a git checkout"
cd "$APP_DIR"

# The webhook runs with a minimal PATH — fail here naming the missing
# binary, not halfway through a deploy. If these exist interactively but
# not here, export an absolute PATH above (e.g. /root/.nvm/versions/...).
for bin in git pnpm curl node pm2; do
  command -v "$bin" >/dev/null 2>&1 || fail "required binary not on webhook PATH: $bin"
done

PREV_COMMIT="$(git rev-parse HEAD)"
log "previous commit: $PREV_COMMIT"

log "fetching origin/$BRANCH…"
git fetch --prune origin || fail "git fetch failed (network or remote down)"

log "resetting to origin/$BRANCH…"
git reset --hard "origin/$BRANCH" || fail "git reset failed"

NEW_COMMIT="$(git rev-parse HEAD)"
if [ "$NEW_COMMIT" = "$PREV_COMMIT" ]; then
  log "already on $NEW_COMMIT — verifying health only, no rebuild"
  if curl -sf -m 5 "$API_HEALTH" >/dev/null 2>&1 && curl -sf -m 5 "$WEB_HEALTH" >/dev/null 2>&1; then
    log "HEALTHY on $NEW_COMMIT — nothing to do"
    exit 0
  fi
  log "up to date but UNHEALTHY — restarting processes once"
  start_processes || fail "restart failed while up to date"
  sleep 15
  if curl -sf -m 5 "$API_HEALTH" >/dev/null 2>&1 && curl -sf -m 5 "$WEB_HEALTH" >/dev/null 2>&1; then
    log "HEALTHY after restart — nothing to do"
    exit 0
  fi
  fail "UNHEALTHY and already on latest — needs a human, not a rebuild"
fi
log "deploying $PREV_COMMIT → $NEW_COMMIT"

rollback() {
  log "health check FAILED — rolling back to $PREV_COMMIT"
  git reset --hard "$PREV_COMMIT"
  pnpm --filter @copinex/api build >/dev/null 2>&1 || true
  pnpm --filter @copinex/web build >/dev/null 2>&1 || true
  start_processes >/dev/null 2>&1 || true
  fail "rolled back to $PREV_COMMIT — inspect the server, then push a fix"
}

log "installing dependencies…"
pnpm install --frozen-lockfile || fail "pnpm install failed"

log "running database migrations…"
pnpm --filter @copinex/database migrate || fail "migrations failed — database untouched by later steps, fix and re-push"

log "building…"
pnpm --filter @copinex/engine build || fail "engine build failed"
pnpm --filter @copinex/database build || fail "database build failed"
pnpm --filter @copinex/api build || fail "api build failed"
pnpm --filter @copinex/web build || fail "web build failed"

log "restarting services (fresh env)…"
start_processes || fail "process start failed"

log "health-checking (up to 60s)…"
healthy=0
i=0
while [ "$i" -lt 12 ]; do
  sleep 5
  i=$((i + 1))
  if curl -sf -m 5 "$API_HEALTH" >/dev/null 2>&1 && curl -sf -m 5 "$WEB_HEALTH" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  log "health attempt $i/12 not ready yet…"
done
if [ "$healthy" -ne 1 ]; then
  rollback
fi

log "DEPLOYED $NEW_COMMIT — api + web healthy"
echo "$NEW_COMMIT $(date -u +%FT%TZ)" >> deploy.log
