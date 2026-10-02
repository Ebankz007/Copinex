# Copinex — Launch Status

Running record of the production-readiness drive (started 2026-10-01).
One item at a time, in launch order. Nothing is marked complete without
evidence. Secrets never appear in this file.

| # | Item | Status | Evidence / next action |
|---|---|---|---|
| 1 | SMTP + SPF/DKIM | **BLOCKED — needs Henry** (code complete, untestable without provider) | SMTP_URL scheme validation, EMAIL_REPLY_TO, production boot requirement, boot-time SMTP verify — all implemented. Needs: provider credentials + DNS records (see below). |
| 2 | Live Pay2Crypto key + micro-charge | Not started | Test rail verified live; awaiting live key + explicit charge approval. |
| 3 | Rotate published dev passwords | Not started | Superadmin first, then the other three. |
| 4 | Real broker PAMM links | Not started | Awaiting real URLs from Henry — will not invent. |
| 5 | SYSTEM tasks + boot task | Not started | Needs 15-min elevated session with Henry. |
| 6 | Deployment pipeline | Not started | Needs: server access, domain, trigger method, secrets, aaPanel version. |
| 7 | Phase 2 wipe + rehearsal | Not started | After 1–6. Needs explicit confirmation per step. |
| 8 | Pen test + load test | Not started | Final gate. No destructive prod tests without approval. |

## Item 1 — detail (2026-10-01)

**Implemented (verified by typecheck + suite, commit pending):**
- `SMTP_URL` must start with `smtp://` or `smtps://` (else env parse fails at boot).
- `EMAIL_REPLY_TO` optional sender for member replies.
- Production refuses to boot without `SMTP_URL` (env guard — previously only
  documented, never enforced in code).
- Production verifies the SMTP connection (connect + auth) before accepting
  traffic; failure is a loud crash, not a silent mail black hole.
- `.env.production.example` + `DEPLOYMENT.md` checklist updated.

**External dependencies (Henry):**
1. A mailbox provider account + SMTP credentials (host, port, username,
   password, TLS mode), installed server-side in the production `.env` —
   NOT in chat.
2. DNS records at the sending domain (exact values come from the provider):
   - `TXT` SPF record including the sending host.
   - `TXT` DKIM record (selector + value supplied by the provider).
3. A live delivery test (password-reset to a real mailbox, SPF/DKIM pass in
   headers) once 1–2 are in place.

**Cannot invent:** DKIM selector/value — they are issued by the mail
provider when the domain is added. SPF include hostname likewise.
