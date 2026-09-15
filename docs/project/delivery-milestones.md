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

| Phase | Scope | Status |
|---|---|---|
| **0 — Foundation** | Project scaffold, tooling, domain engines, docs | ✅ **Complete (2026-09-14)** |
| **1 — Data Layer** | Supabase schema, migrations, RLS, triggers, RPCs, generated types | ⬜ Next |
| **2 — Identity & Master Data** | Auth, roles, Item Master (IM-01…06), Instrument registry (EQ-01…04) | ⬜ |
| **3 — Dimensional Module** | Batch flow + 5-sample grid (DIM-01…07), submission | ⬜ |
| **4 — Coating Module** | Surface prep, dew-point engine UI, paint log, DFT grid (COAT-01…07) | ⬜ |
| **5 — Sign-off & Review** | QH review, dual sign-off, immutability UX (SO-01…04), Realtime | ⬜ |
| **6 — Reports** | Print-CSS engine for both formats, fidelity sign-off (PDF-01…04) | ⬜ |
| **7 — Offline & PWA Hardening** | Sync queue live, offline E2E, shop-floor pilot | ⬜ |
| **8 — NCR & Intelligence** | NCR auto-drafting, audit recall, dashboards (NCR-01…03, EQ-04) | ⬜ |
| **9 — Audit & Handover** | Client training, UAT with real batches, OEM-audit rehearsal | ⬜ |

Later-phase options (out of v1 scope, from `premium-features-roadmap.md`): ERP/PO integration, Vision AI drawing extraction, Customer portal.

## 3. Exit Criteria per Phase

**Phase 0 — done when:** `npm run verify` green · production build + PWA generate · domain engines unit- and property-tested · app boots in dev with the design system · this documentation set exists. ✅ Met.

**Phase 1 — done when:** migration applies to clean staging · RLS matrix tests pass for every role×table×operation · approved-batch mutation trigger proven · `submit_batch` recomputes dew point + DFT stats server-side · DB types generated and compiled against.

**Phase 2 — done when:** all four roles can authenticate with correct affordances · admin CRUDs items, revisions, dimension templates, instruments · EQ-02 status computation and alerts live.

**Phase 3 — done when:** a real 53-row batch can be keyboard-driven end to end with instant 🟢🟡🔴 feedback · autosave survives reload · submission produces a `SUBMITTED` batch with server-recomputed evaluations.

**Phase 4 — done when:** dew-point lock-out blocks sign-off on violating inputs · 26-point DFT grids compute live ISO 19840 verdicts · paint batch/shelf-life logging complete.

**Phase 5 — done when:** full submit → reject → revise → approve loop with immutable APPROVED state · an inspector cannot approve, proven by test.

**Phase 6 — done when:** both controlled formats pass the golden-file fidelity comparison signed by the client QH (`report-export-spec.md` §6).

**Phase 7 — done when:** one week of shop-floor pilot shows zero data loss across connectivity loss, reboots, and multi-day drafts (`offline-sync-architecture.md` §8).

**Phase 8 — done when:** NCR auto-draft from a failing batch populates every PRD field; instrument audit-recall returns full usage history in one click.

**Phase 9 — done when:** the client's QH runs a mock OEM audit on the platform alone and every PRD acceptance criterion (§7) is demonstrated live.

## 4. Acceptance Traceability

| PRD acceptance criterion | Delivering phase |
|---|---|
| 1. Admin selects/creates Item Master for both workflows | 2 |
| 2. 5-sample grid with instant tolerance feedback | 3 |
| 3. Auto dew point + 3 °C compliance warning | 4 (engine tested in 0) |
| 4. DFT stats + ISO 19840 without helper formulas | 4 (engine tested in 0) |
| 5. Instrument linkage + expiry warnings | 2 + 3 |
| 6. Dual sign-off with immutable timestamps | 5 |
| 7. Both reports print-faithful PDFs | 6 |

## 5. Known Risks to Schedule

| Risk | Phase | Mitigation |
|---|---|---|
| Print fidelity on tablet browsers | 6 | Puppeteer fallback pre-approved in `technology-stack.md` §3.8 |
| Shop-floor Wi-Fi worse than assumed | 7 | Offline capture is already the design; pilot surfaces reality early |
| Client QH availability for fidelity/UAT sign-offs | 6, 9 | Book sign-off sessions at phase start, not end |
| Scope pull-forward from premium roadmap | any | Change requests route through PRD v1.3+, not sideways into phases |

---

*Update the Status column in §2 as phases progress; never delete a completed phase's exit criteria — they are the audit trail of delivery.*
