# Copinex Member App — UI Implementation Report

**Scope:** Rebuild the four reference screens (`copinex001–004.jpeg`) as a real, component-based
Next.js app — no static images, no screenshots embedded. Visual fidelity to the reference
screenshots, wired into the existing monorepo architecture.

**Stack:** Next.js 15 (App Router, static prerender) + React 19 + Tailwind CSS v4.
Lives in `apps/web` as planned in the Phase-2 roadmap (`README.md`).

---

## Implemented

### Routes (mobile-first, `max-w-md` app shell on the dark canvas)

| Route | Source screen | Content |
|---|---|---|
| `/` | copinex001 | Member **Dashboard**: greeting + rank (Forex GrandMaster) + ID badge (TP682923), TOTAL BALANCE (USDT) $15.50, "No earnings yet today", Deposit / Withdraw buttons, ACCOUNT STATUS card (Active + "full access"), Copy Trade CTA, 3×2 feature tiles (Rewards, Explore Copinex, Pools, Brokers, Network, Performance), COPINEX footer |
| `/connect` | copinex002 | **How to Connect**: 4-step numbered flow (choose broker → register/verify/deposit $50+ → link to Master Trader → pay $1 fee), fee card (Available Balance $0.00 / $1 Processing Fee / Required for Connection), Partner Brokers — PUPRIME + DERIV cards |
| `/connect/steps` | copinex003 | **Onboarding Guide**: STEP 1 Register with Broker (OPEN REGISTRATION PAGE), STEP 2 Setup as FOLLOWER (video link), STEP 3 LINK MY ACCOUNT |
| `/connect/account` | copinex004 | **Connect Account**: $1 fee notice, Full Legal Name + Amount Deposited with Broker fields, live fee summary (Available $0.00 / Fee $1.00 / After Fee $0.00), CONNECT NOW |

### Flow wiring (real navigation, not static mockups)
- Dashboard **Copy Trade** → `/connect` → broker card → `/connect/steps` → **Link My Account** → `/connect/account`.
- Back buttons on every sub-screen (chevron header).

### Design system
- **Tokens** (`globals.css` `@theme`) derived from the reference palettes + cloned site brand:
  `night #010b1a`, `night-2 #040f1e`, `navy #071c36`, `navy-2 #0a2748`, `green #66d313`,
  `teal #478970`, `teal-2 #569666`, `blue #2a557f`, `mist #8aa0b5`, `muted #566b80`, `soft #f4f9ef`.
- Inter via `next/font` (matches site's font stack), subtle brand glow behind the shell.
- 16 hand-drawn inline stroke icons (`components/icons.tsx`) — no icon library dependency.
- Client component (`components/connect-form.tsx`) with controlled inputs and live fee math
  (clamped at $0.00 to match the reference).

## Assets
- None external. All icons are inline SVG components. Fonts served by `next/font` (self-hosted at build).

## Dependencies
- `next@15.5`, `react@19`, `tailwindcss@4`, `@tailwindcss/postcss` — workspace-installed via pnpm.
- Fix applied: pnpm 11 requires `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`
  (the old `onlyBuiltDependencies` field is ignored; the previous half-written `allowBuilds`
  artifact was removed).

## Testing
- `pnpm --filter @copinex/web build` — **passes**, all 7 pages prerendered static, ~106 kB first load.
- `next start` on :3000 — all four routes return **200**.
- HTML content audit — every copy string from the four screenshots present in rendered output
  (greeting, rank, ID, $15.50, fee copy, PUPRIME/DERIV, step titles, form labels, summary rows).

## Remaining Differences (honest list)
1. **No live data** — balance ($15.50), rank, ID, and wallet balance ($0.00) are hardcoded demo
   values. Real values come from `apps/api` once auth + ledger endpoints exist (Phase 3).
2. **Tiles are inert** — Rewards/Pools/Network/Performance screens don't exist yet; Deposit and
   Withdraw are placeholders (`href="#"`). Only the Copy Trade onboarding flow is navigable.
3. **Broker links** — OPEN REGISTRATION PAGE and the follower-setup video link are `#` placeholders;
   real PUPRIME/DERIV partner URLs and the video link go in config.
4. **Form is client-only** — CONNECT NOW validates nothing and submits nowhere; it must call
   `POST /api/broker-connections` (pending API) and deduct the $1 fee via the engine.
5. **No auth / session** — the app renders without login; the dashboard is keyed to a single demo user.
6. **Desktop layout** — screens are mobile-first by design (screenshots are phone aspect); a desktop
   shell (sidebar + wider balance grid) is a follow-up.
7. **Pixel-level fidelity** — exact gradient stops, shadows, and tile iconography were inferred from
   OCR + palette extraction (the model cannot view images); verified by copy audit, not by eye.