# Copinex Platform

Compensation engine + platform for Copinex, an AI-assisted copy-trading ecosystem with a network-marketing compensation layer.

## Stack

- **Engine** — pure TypeScript domain core (`packages/engine`), framework-agnostic, integer-cents money math
- **API** — Node.js + Express + TypeScript (`apps/api`)
- **Frontend** — Next.js + Tailwind (`apps/web`)
- **Database** — PostgreSQL 16 + Drizzle ORM
- **Queue** — Redis (settlement jobs, notifications)
- **Tests** — Vitest (unit), Supertest (API), Playwright (E2E, later)

## Monorepo layout

```
platform/
├── apps/
│   ├── api/          # Express API (auth, wallets, investments, admin, jobs)
│   └── web/          # Next.js dashboards (dashboard, invest, connect, login, register)
├── packages/
│   └── engine/       # THE compensation engine — pure TS, no framework deps
├── database/         # Drizzle schema + migrations
├── infrastructure/   # docker-compose, nginx, deploy
└── docs/             # analysis, decisions, reports
```

## Money rule

All monetary values are **integer cents** (`bigint`/`number` cents) end-to-end. Never floats. The spec's reconciliation invariants are enforced as automated tests on every deploy:

- Fee split: `45 + 30 + 10 + 8 + 7 = 100%`
- Profit split: `60 + 10 + 30 = 100%`

Money can never go negative: wallets, pools, and share columns are guarded by DB `CHECK` constraints (migration 0002), and every movement writes an append-only ledger entry with `balance_after`.

## Money rails (Phase 1)

No payment provider is wired yet. The interim rails are:

- **Deposit** — `POST /api/admin/wallets/deposit` (admin credits a member's COPINEX wallet; ledger `DEPOSIT`)
- **Withdrawal** — `POST /api/wallets/withdraw` (member requests; funds are **held immediately**, request enters `PENDING`)
- **Review** — `POST /api/admin/wallets/withdrawals/:id/approve` (payout done) or `/reject` (funds refunded, ledger `WITHDRAWAL_REFUND`)

## Auth

- Register/login return a JWT (7d, `JWT_SECRET` required — the API **fails fast** if missing, no fallback).
- Rate limiting: 300 req/15min global, 20 req/15min on `/api/auth` (skipped in test env).
- Web: `/login` and `/register` pages store the token in `localStorage` (`copinex_token`). No token → clearly-badged demo mode.

## Getting started

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d   # postgres + redis
cp .env.example .env
# generate a JWT secret: openssl rand -base64 48  →  JWT_SECRET in .env
pnpm dev:api
pnpm test
```

## Source of truth

`docs/project-analysis.md` — full requirements analysis, architecture, DB design, API spec, roadmap, and risks. The calculation logic is extracted from the *Copinex Business Plan & Compensation Plan* (Sections 7, 9–16).

## Reports

- `docs/project-audit.md` — full audit, gap analysis, scorecard, and the phased production-readiness roadmap
- `docs/investment-package.md` — the 90-Day Investment Package (engine → DB → API → web → E2E)
- `docs/phase1-foundation.md` — Phase 1 (security + money rails + auth UI) implementation notes