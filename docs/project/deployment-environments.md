# Deployment & Environments
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `technology-stack.md` §3.10, `backend-architecture.md` §7, `security-compliance.md` §9

---

## 1. Topology

| Tier | Service | Notes |
|---|---|---|
| Frontend | **Vercel** (SPA) | Preview deployment per PR; production alias on promote |
| Database / Auth / Realtime | **Supabase — staging project** | CI E2E target |
| Database / Auth / Realtime | **Supabase — production project** | PITR enabled; manual promote only |
| Scheduled jobs | Supabase scheduled functions | Calibration digest, shelf-life sweep (`backend-architecture.md` §8) |

No other infrastructure exists. PDFs are client-rendered; there is no server rendering tier (fallback per `report-export-spec.md` §1 only if fidelity demands).

---

## 2. Environment Matrix

| | Local dev | Staging | Production |
|---|---|---|---|
| Branch | any | `main` (auto) | manual promote from `main` |
| Supabase | local or staging | staging project | production project |
| Data | fixtures | seeded + E2E residue | real QMS data (immutable rules live) |
| `VITE_APP_ENV` | `development` | `staging` | `production` |
| Service worker | enabled | enabled | enabled |
| Error reporting | console | console + source maps | error tracker (on) |

## 3. Environment Variables

Managed per Vercel project + `.env.local` locally (`.env.example` documents them; `.env*` is gitignored).

| Variable | Used for | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | API origin | no |
| `VITE_SUPABASE_ANON_KEY` | Client key (RLS is the control plane) | no |
| `VITE_APP_ENV` | Environment badge + behavior flags | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Scheduled functions **only** — never in the SPA bundle or repo | **secret** |

Rule: the client bundle is audited in CI for any service-role material — the check is trivial (grep) and permanent.

## 4. Deployment Pipeline

1. PR → Vercel preview build; `npm run verify` gate (typecheck + lint + tests) must pass.
2. Merge to `main` → Vercel deploys **staging**; Playwright E2E + data-layer suites run against staging (`testing-quality-plan.md` §5–6).
3. **Promotion to production is a manual, logged action** (Vercel promote + Supabase migration push), performed only after staging sign-off for the release scope.
4. Supabase migrations are applied to staging first, production second — never in reverse order; the frontend is always compatible with a schema *superset*.

### Release checklist (abridged)

- [ ] `npm run verify` green on `main`
- [ ] Staging E2E + RLS suites green
- [ ] New migrations reviewed against `backend-architecture.md`
- [ ] Generated DB types regenerated + committed (compile error check)
- [ ] Version bumped; changelog entry written
- [ ] Rollback path identified (§6)

## 5. Custom Domain & TLS

Vercel-managed certificate; HSTS per `security-compliance.md` §8. Supabase origins whitelisted in CSP. Client accesses via a named subdomain (e.g. `qc.simrantechnocrats.com`) — confirm final domain with client IT before the first production release.

## 6. Rollback & DR

| Failure | Response |
|---|---|
| Bad frontend release | Vercel instant rollback to previous build (seconds) |
| Bad migration | Forward-fix migration preferred; Supabase branch restore as backup — **migrations are never edited after apply** |
| Data incident | PITR restore to staging first, verify, then controlled recovery (`security-compliance.md` §10) |
| Supabase outage | Offline capture continues by design (`offline-sync-architecture.md`); queue drains on recovery |

RPO ≤ 5 min (PITR), RTO ≤ 4 h (documented, tested quarterly).

## 7. Monitoring & Alerts

- Vercel analytics: build + runtime errors, Web Vitals (grid responsiveness is an NFR — watch INP).
- Supabase: API error rates, auth failure spikes (brute-force signal), realtime connection counts.
- Alert routing: Skyrn Studio on-call; client QH notified per `security-compliance.md` §10 for integrity events.
- Calibration-digest job failures alert Admin (a silently missing EQ-02 digest is a compliance gap, not just a bug).

## 8. Access Control to Environments

- Vercel + Supabase dashboard access: Skyrn Studio engineers only, 2FA mandatory.
- Production Supabase SQL editor access is **break-glass**: used for migrations and emergencies, every session noted in the ops log.
- Client receives read-only observability (dashboards), not infrastructure credentials.

---

*Infra changes (new env var, new integration, new scheduled job) require a bump of this file and the Vercel/Supabase dashboards in the same change.*
