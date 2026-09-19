# Delivery Phases & Milestones

## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current — Phase 0 complete
**Depends on:** `product-requirements.md` §7 (acceptance criteria), `technology-stack.md`, all engineering docs in this folder

---

## 1. Purpose

The build order, each phase's exit criteria, and the traceability from phases to PRD acceptance. Status is maintained here; this is the one document that changes most often.

---

## 2. Phase Plan

| Phase                           | Scope                                                               | Status                       |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| **0 — Foundation**              | Project scaffold, tooling, domain engines, docs                     | ✅ **Complete (2026-09-14)** |
| **1 — Data Layer**              | Supabase schema, migrations, RLS, triggers, RPCs, generated types   | ⬜ Next                      |
| **2 — Identity & Master Data**  | Auth, roles, Item Master (IM-01…06), Instrument registry (EQ-01…04) | ⬜                           |
| **3 — Dimensional Module**      | Batch flow + 5-sample grid (DIM-01…07), submission                  | ⬜                           |
| **4 — Coating Module**          | Surface prep, dew-point engine UI, paint log, DFT grid (COAT-01…07) | ⬜                           |
| **5 — Sign-off & Review**       | QH review, dual sign-off, immutability UX (SO-01…04), Realtime      | ⬜                           |
| **6 — Reports**                 | Print-CSS engine for both formats, fidelity sign-off (PDF-01…04)    | ⬜                           |
| **7 — Offline & PWA Hardening** | Sync queue live, offline E2E, shop-floor pilot                      | ⬜                           |
| **8 — NCR & Intelligence**      | NCR auto-drafting, audit recall, dashboards (NCR-01…03, EQ-04)      | ⬜                           |
| **9 — Audit & Handover**        | Client training, UAT with real batches, OEM-audit rehearsal         | ⬜                           |

Later-phase options (out of v1 scope, from `premium-features-roadmap.md`): ERP/PO integration, Vision AI drawing extraction, Customer portal.

## 3. Exit Criteria per Phase

**Phase 0 — done when:** `npm run verify` green · production build + PWA generate · domain engines unit- and property-tested · app boots in dev with the design system · this documentation set exists. ✅ Met.

**Phase 1 — done when:** migration applies to clean staging · RLS matrix tests pass for every role×table×operation · approved-batch mutation trigger proven · `submit_batch` recomputes dew point + DFT stats server-side · DB types generated and compiled against. — **Code complete 2026-09-15** (migrations 001–005, seed, static schema↔domain parity suite, F-05 closed); staging application, behavioural RLS/trigger matrix and `db:types` regeneration remain open — they need Docker/psql or a provisioned staging project (none on this workstation).

**Phase 2 — done when:** all four roles can authenticate with correct affordances · admin CRUDs items, revisions, dimension templates, instruments · EQ-02 status computation and alerts live. — **Code complete 2026-09-16** (email/password + TOTP MFA auth, 30-min inactivity timeout, RBAC route guard reading role from `profiles`, 12-pattern design system on the token layer with component tests, Equipment Registry + Item Master incl. Excel paste-import, migration 006 profiles bootstrap, F-02 residual / F-04 / F-06 closed; verify gate 87/87). Open: the four-role × affordance matrix and MFA challenge against live Supabase staging — QH/NACE-affordance screens land with Phases 3–5, and server-side MFA enforcement at `decide_batch` is part of the Phase 5 RPC (edge 2.14).

**Phase 3 — done when:** a real 53-row batch can be keyboard-driven end to end with instant 🟢🟡🔴 feedback · autosave survives reload · submission produces a `SUBMITTED` batch with server-recomputed evaluations. — **Code complete 2026-09-16** (Dexie v2 drafts + Zustand debounced write-through with tab-conflict guard and cursor resume; pure grid model — mask, row status, checklist, keyboard nav — 24 tests incl. the F-06a property; virtualized DimensionGrid with render-count test; RPC submission with offline queue + drainSync; new-batch / grid / dashboard routes with A4 strip and rejected pinning; **typecheck gate fixed** — was a no-op, now `tsc -b` and all latent strict errors cleared; verify gate 131/131). Open: live 53-row keyboard session and submit against staging Supabase; E2E journeys 1/2/4/5 (Playwright suite pending); revision-drift flag (edge 3.14) surfaces at drain but review-UI display lands with Phase 5.

**Phase 4 — done when:** dew-point lock-out blocks sign-off on violating inputs · 26-point DFT grids compute live ISO 19840 verdicts · paint batch/shelf-life logging complete. — **Code complete 2026-09-16** (coating verdict layer: psychro gate `ΔT < 3.0 °C` OR `RH > 85 %` with boundary pins 4.1/4.4, shelf-life engine, 0.8×/2.0× strict 80/200 verdicts via the existing DFT engine, decimal-comma mask; migration 007 `batch_coating`/`batch_visual_checks` + RLS + RPC RH-lock-out amendment; Dexie v3 `coatingDrafts` + wizard store with tab claim; coating API over `upsert_batch_draft` + Section A/E direct upserts with offline queue; PsychrometricPanel lock-out, dual 26-point DftPanel with live Min/Max/Avg/σ, shelf-life chip; /coating/new with `ƒx inherited` linked header, 5-step wizard with per-section gated Continue, dashboard workflow badges; journey #3 pinned at the component layer; verify gate 189/189). Open: staging verification of the RPC lock-outs (needs provisioned Supabase — same gap as Phases 1–3); full E2E #3 in the Playwright suite (Phase 6).

**Phase 5 — done when:** full submit → reject → revise → approve loop with immutable APPROVED state · an inspector cannot approve, proven by test. — **Code complete 2026-09-16** (decide_batch hardened with AAL2/MFA enforcement — the Phase 2 deferral landed: `BT_MFA` fail-closed on aal1 sessions, parity-tested; review API with domain-engine flag computation (▲ warns / ✕ fails / expired instruments), read-only detail fetches, decideBatch wrapper translating the BT_* contract, canDecide edge-5.9 mirror; realtime module over `role:QUALITY_HEAD` / `user:{id}` / `batch:{id}` with injected transport port and event classification; /review queue table with flags column + live invalidation; /review/$batchId read-only S16/S17 render with flag anchors, expired-instrument ack block (EQ-03), pinned action bar, extracted ApproveModal (5.1 flags ack + SO-04 immutable statement) and RejectModal (min-10-chars SO-03, show-where); inspector dashboard shows QH rejection comments on REJECTED pins and receives approve/reject toasts without refresh; verify gate 216/216). Open: behavioural loop against staging Supabase (same provisioning gap as Phases 1–4); full loop E2E + inspector-cannot-approve security E2E land with the Phase 6 Playwright suite; edge 5.2's stale-decision version pin remains server-side only (status guard already implemented).

**Phase 6 — done when:** both controlled formats pass the golden-file fidelity comparison signed by the client QH (`report-export-spec.md` §6). — **Code complete 2026-09-18** (`getReportData` single contract over the review rows — printed record can never diverge from the reviewed record; ST/QC/02 and ST/QC/04 renderers with instrument codes, Section A/per-coat psychrometrics, DFT grids, sign-offs, QH comments; `log_export` RPC writes the EXPORT audit entry and refuses non-APPROVED batches; print baselines locked by `e2e/print.spec.ts`). Open: the golden-file fidelity comparison against the audited Excel printouts, signed by the client QH — a manual, on-paper step.

**Phase 7 — done when:** one week of shop-floor pilot shows zero data loss across connectivity loss, reboots, and multi-day drafts (`offline-sync-architecture.md` §8).

**Phase 8 — done when:** NCR auto-draft from a failing batch populates every PRD field; instrument audit-recall returns full usage history in one click. — **Code complete 2026-09-18** (migration 008 `ncrs` table + RPCs + RLS; `NcrDraftDialog` opened from the dimensional FAIL checklist and the coating visual panel, writing straight to the register with DB-allocated numbering `NCR-YYMM-NNN`; `/ncr` register route replacing the placeholder toasts; instrument detail drawer with calibration info + usage recall + CSV export, backed by the usage API). Open: nothing outstanding at the code layer.

**Phase 9 — done when:** the client's QH runs a mock OEM audit on the platform alone and every PRD acceptance criterion (§7) is demonstrated live.

## 4. Acceptance Traceability

| PRD acceptance criterion                                | Delivering phase       |
| ------------------------------------------------------- | ---------------------- |
| 1. Admin selects/creates Item Master for both workflows | 2                      |
| 2. 5-sample grid with instant tolerance feedback        | 3                      |
| 3. Auto dew point + 3 °C compliance warning             | 4 (engine tested in 0) |
| 4. DFT stats + ISO 19840 without helper formulas        | 4 (engine tested in 0) |
| 5. Instrument linkage + expiry warnings                 | 2 + 3                  |
| 6. Dual sign-off with immutable timestamps              | 5                      |
| 7. Both reports print-faithful PDFs                     | 6                      |

## 5. Known Risks to Schedule

| Risk                                              | Phase | Mitigation                                                          |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------- |
| Print fidelity on tablet browsers                 | 6     | Puppeteer fallback pre-approved in `technology-stack.md` §3.8       |
| Shop-floor Wi-Fi worse than assumed               | 7     | Offline capture is already the design; pilot surfaces reality early |
| Client QH availability for fidelity/UAT sign-offs | 6, 9  | Book sign-off sessions at phase start, not end                      |
| Scope pull-forward from premium roadmap           | any   | Change requests route through PRD v1.3+, not sideways into phases   |

---

_Update the Status column in §2 as phases progress; never delete a completed phase's exit criteria — they are the audit trail of delivery._
