# PAMM Service

*Decision (2026-09-26): the Copier service is replaced by a **PAMM Service**.*

PAMM (Percentage Allocation Management Module) — the client selects a partner
broker, submits a connection request, and the system redirects them to the
broker's **private PAMM link**. The investment happens **broker-side**; Copinex
never holds the client's PAMM funds and never executes trades. The old
copy-trading engine (trade mirroring, MT5/broker API) is **out of scope** —
the platform is a referral + compensation layer over broker-hosted PAMM.

## Flow

```
/connect (broker cards, live from DB)
  → client selects a broker
  → POST /api/pamm/connections { brokerId }
  → 201 { connection: { status: 'REQUESTED' }, redirectUrl: <broker.pamm_link> }
  → browser redirects to the broker's private PAMM link
  → client invests with the broker (off-platform)
```

Free — the old $1 processing fee is dropped (decision 2026-09-26).

## Data model (migration 0003)

- **`brokers`** — id, name, code (unique), `pamm_link` (CHECK non-empty),
  `is_active`. Admin-managed directory.
- **`pamm_connections`** — id, user_id, broker_id, status
  (`REQUESTED` | `LINKED`), created_at. Status stays `REQUESTED` after the
  redirect; `LINKED` is reserved for when broker-side confirmation exists.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/brokers` | public | Active broker directory (private link NOT exposed) |
| POST | `/api/pamm/connections` | member | Submit connection request → `{ connection, redirectUrl }` |
| GET | `/api/pamm/connections` | member | My requests |
| GET | `/api/admin/brokers` | admin | All brokers incl. removed |
| POST | `/api/admin/brokers` | admin | Add broker (`BROKER_EXISTS` 409, `INVALID_PAMM_LINK` 400) |
| DELETE | `/api/admin/brokers/:id` | admin | Remove from client list — **soft deactivate** (`is_active=false`), history preserved |
| GET | `/api/admin/pamm/connections` | admin | All connection requests |

## Web

- `/connect` — live broker cards; select → request → redirect (client-side
  `window.location.href`). 401 → prompts login; `BROKER_INACTIVE` → friendly error.
- `/admin/brokers` — admin page: add broker (name/code/PAMM link), remove
  (soft), see all connection requests. Gated on `role === 'ADMIN'`.
- Old copy-trading pages removed: `/connect/steps`, `/connect/account`,
  `connect-form.tsx` (dead code from the old flow).

## Tests

`tests/pamm.integration.test.ts` — 11 tests: public list, admin CRUD
(duplicate 409, invalid link 400, non-admin 403, soft-remove), connection
request (201 + redirectUrl + REQUESTED), 401/404/BROKER_INACTIVE guards,
client-vs-admin scoping. Full API suite: **56/56 green**.

## Open items

- Real broker PAMM links must replace the seeded placeholders
  (`https://pamm.puprime.com/private/copinex` etc.) via the admin UI.
- `LINKED` status + broker-side confirmation (webhook/manual) — future work.
- §7 trading settlement data source: the PAMM profit feed still doesn't
  exist; settlements run on the admin endpoint until the broker integration.