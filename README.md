# Copinex Platform

Compensation engine + platform for Copinex, an AI-assisted copy-trading ecosystem with a network-marketing compensation layer.

## Stack

- **Engine** — pure TypeScript domain core (`packages/engine`), framework-agnostic, integer-cents money math
- **API** — Node.js + Express + TypeScript (`apps/api`)
- **Frontend** — Next.js + Tailwind (`apps/web`, Phase 2)
- **Database** — PostgreSQL 16 + Drizzle ORM
- **Queue** — Redis (settlement jobs, notifications)
- **Tests** — Vitest (unit), Supertest (API), Playwright (E2E, later)

## Monorepo layout

```
platform/
├── apps/
│   ├── api/          # Express API (auth, routes, jobs)
│   └── web/          # Next.js dashboards (Phase 2)
├── packages/
│   └── engine/       # THE compensation engine — pure TS, no framework deps
├── database/         # Drizzle schema + migrations
├── infrastructure/   # docker-compose, nginx, deploy
└── docs/             # analysis, decisions
```

## Money rule

All monetary values are **integer cents** (`bigint`/`number` cents) end-to-end. Never floats. The spec's reconciliation invariants are enforced as automated tests on every deploy:

- Fee split: `45 + 30 + 10 + 8 + 7 = 100%`
- Profit split: `60 + 10 + 30 = 100%`

## Getting started

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d   # postgres + redis
cp .env.example .env
pnpm dev:api
pnpm test
```

## Source of truth

`docs/project-analysis.md` — full requirements analysis, architecture, DB design, API spec, roadmap, and risks. The calculation logic is extracted from the *Copinex Business Plan & Compensation Plan* (Sections 7, 9–16).