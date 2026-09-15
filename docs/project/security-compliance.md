# Security & Compliance
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `backend-architecture.md` (mechanisms), `technology-stack.md` (stack), `product-requirements.md` (requirements)

---

## 1. Scope

This document defines the security posture and the compliance-mapping story the client can present during **ISO 9001 surveillance audits** and **FLENDER / WINERGY OEM audits**. It covers authentication, authorization, data integrity, accountability, and operational security. Mechanisms live in `backend-architecture.md`; this document states the guarantees and their evidence.

---

## 2. Threat Model (abridged)

| Threat | Vector | Countermeasure |
|---|---|---|
| Fabricated or backdated inspection records | UI manipulation, direct API calls | RLS + server-side RPCs + append-only `audit_log` |
| Tampering with approved batches | Any actor, including Admin | DB trigger raises on mutation of `APPROVED` data (SO-04) |
| Cross-inspector data leakage | Draft snooping on shared shop-floor tablets | RLS: drafts visible only to their creator |
| Unauthorized sign-off | Non-QH user approving | `sign_offs` insert denied by RLS; approval only via `decide_batch` RPC with role check |
| Session hijack on shared device | Left-open browser | Short access-token lifetime, inactivity auto-logout, no shared-account policy |
| Dew-point falsification | Typing a manual dew point | Field is computed, read-only, and re-computed server-side on submit |
| Client-claimed statistics | Modified client bundle | RPC recomputation; client values stored only as forensic evidence |

---

## 3. Authentication

- **Supabase Auth** with email + password; MFA (TOTP) **required** for `QUALITY_HEAD` and `ADMIN` roles (sign-off accountability, SO-01…04).
- Session: JWT access token (default 1 h) + refresh rotation; `autoRefreshToken` on the client (`src/lib/supabase/client.ts`).
- Inactivity timeout: 30 minutes of no interaction on shop-floor devices — the Inspector role re-authenticates; drafts survive (offline store), the session does not.
- Password policy: minimum 12 characters, breach-list check enabled.
- No password reset links over unencrypted channels; SMTP with TLS, expiring single-use tokens.

## 4. Authorization (RBAC)

- Roles: `ADMIN`, `QC_INSPECTOR`, `NACE_INSPECTOR`, `QUALITY_HEAD` (`backend-architecture.md` §4).
- Enforcement is **database-first** (Postgres RLS). The UI mirrors the matrix for affordances only — hiding a button is cosmetic, never a control.
- Privilege escalation is structurally impossible from the client: role changes happen in `profiles`, which only a service-role migration (not an RPC callable by users) may modify.
- Separation of duties: the author of a batch **cannot** approve it, even if promoted to QH mid-flight — `decide_batch` rejects `signer = submitter`.

## 5. Data Integrity

| Guarantee | Mechanism | PRD |
|---|---|---|
| Min ≤ Nominal ≤ Max | CHECK constraints at insert (IM-03) | DIM data quality |
| Dew point is physics, not opinion | Computed Magnus-Tetens client + server; read-only field | COAT-03 |
| Coating sign-off blocked when ΔT < 3 °C | Submission RPC raises | COAT-03 / ISO 12944-7 |
| DFT statistics trustworthy | Recomputed in RPC from raw readings | COAT-06 |
| Approved = immutable | DB trigger, applies to all roles | SO-04 |
| One value per sample/point | UNIQUE constraints | DIM-03 / COAT-05 |

## 6. Auditability & Accountability

- Every status transition and sign-off writes an append-only `audit_log` row: actor, entity, action, timestamp, payload. No UPDATE grant exists for any role.
- Sign-off rows store `user_id` + server `now()` — timestamps come from the database, never the client clock.
- **Instrument traceability (EQ-04):** every reading row carries `instrument_id`; the audit-recall query returns every report a gauge touched. Expired-instrument acknowledgements are logged with the acknowledging QH's identity (EQ-03).
- Audit-log retention: years, aligned with OEM audit cycles; PITR-backed (`backend-architecture.md` §10).

## 7. Compliance Mapping

| Standard / Clause | Platform evidence |
|---|---|
| **ISO 9001 — 7.5 Documented information** | Controlled formats `ST/QC/02` / `ST/QC/04` rendered pixel-identically; format no. + rev + issue date in report footers (PDF-04) |
| **ISO 9001 — 8.5.2 Identification & traceability** | Unified batch headers; item → drawing revision → batch → readings chain; instrument registry |
| **ISO 9001 — 8.7 Nonconforming outputs** | Auto-drafted NCRs with disposition + CAPA (NCR-01…03) |
| **ISO 12944-7** | Dew-point engine + 3 °C application lock |
| **ISO 8501-1 / -3** | Blast grade (Sa 2.5) and P-2 weld/edge dressing logged per batch |
| **ISO 19840** | 80/200 rule evaluation computed from raw DFT readings |
| **NACE CIP Level 2** | Coating sign-off records certifier identity and certification claim |
| **Customer audit (FLENDER/WINERGY)** | Audit trail export, instrument recall query, immutable approved records |

## 8. Application-Layer Security

- **No secrets in the SPA.** Only the Supabase anon key ships to the browser; it is safe because RLS — not secrecy — is the control plane.
- **Dependency hygiene:** lockfile committed; `npm audit` in CI; Renovate-style monthly dependency review; zero runtime dependencies with install scripts beyond the audited set.
- **Headers (Vercel):** `Strict-Transport-Security` (2 y, preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, permissive-but-real CSP (self + Supabase origins; `frame-ancestors 'none'`).
- **Input validation:** every mutation passes Zod schemas (`src/domain/schemas.ts`) client-side and Postgres constraints server-side — one source of truth, three enforcement points (`technology-stack.md` §3.3).
- **Print/exfiltration surface:** report PDFs render client-side; no report bytes transit third-party services. Watermarking per-batch for controlled-copy tracking if the client requests it.

## 9. Operational Security

- Environment separation: staging (CI E2E) vs production; separate Supabase projects; no shared credentials.
- Service-role key exists **only** in scheduled-function/edge contexts — never in the SPA bundle, never in the repo.
- Access reviews quarterly: who holds QH/Admin in `profiles`, matched against the client's HR list.
- Backup restores are tested quarterly (`backend-architecture.md` §10); restore drills are logged as audit evidence.

## 10. Incident Response (runbook summary)

1. **Detect:** Supabase logs + Vercel monitors + QH-reported anomaly.
2. **Contain:** revoke sessions (`auth.admin.signOut` scope), rotate exposed keys.
3. **Assess integrity:** diff `audit_log` against `batches`/`sign_offs` state; tampering post-approval is impossible by trigger, pre-approval is fully replayable from the log.
4. **Notify:** client QH within 24 h for any confirmed data-integrity event.
5. **Post-mortem:** written, with corrective action tracked as a CAPA item — eat our own dog food.

---

*Security-relevant changes to schema, RLS, or auth flow require a version bump here and a matching migration review.*
