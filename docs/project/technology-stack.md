# Technology Stack Decision Record
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 2.0 — Supersedes the stack in `project-brief.md` §6
**Date:** September 14, 2026
**Status:** ✅ Adopted

---

## 1. Why This Document Exists

The original stack proposal (Vite + React SPA, pure Vanilla CSS with glassmorphism, localStorage autosave) is directionally correct but has four structural weaknesses the UI/UX plan (`ui-ux-plan.md`, same folder) depends on solving:

1. **Pure Vanilla CSS will drift.** A 21-screen app with print fidelity requirements needs a token-driven styling architecture, not hand-rolled stylesheets.
2. **Grid performance is the product.** 100-row dimensional grids and 52-point DFT grids with real-time color validation demand purpose-built table and virtualization primitives.
3. **localStorage is not an offline strategy.** Shop floors have spotty Wi-Fi; a single `localStorage` quota error or Safari ITP purge destroys a 45-minute inspection session.
4. **"Immutable approved records" must be enforced by the database**, not by hoping the UI hides the edit button.

This document locks the final decisions. Each choice lists what it replaces, why, and what was rejected.

---

## 2. The Stack at a Glance

| Layer | Decision | Replaces (from v1 docs) |
|---|---|---|
| Language | **TypeScript 5.x, strict mode** | Implicit — no `any` anywhere |
| Frontend framework | **Vite + React 19 (SPA)** | Kept |
| Routing | **TanStack Router** (type-safe) | Ad-hoc routing |
| Data grids | **TanStack Table + TanStack Virtual** | Hand-rolled HTML tables |
| Forms & validation | **React Hook Form + Zod** | Uncontrolled inputs + manual checks |
| Server state | **TanStack Query v5** | Ad-hoc fetch calls |
| Client state | **Zustand** | Ad-hoc context/useState sprawl |
| Styling | **Tailwind CSS v4 + custom design tokens + Radix primitives** | Pure Vanilla CSS + glassmorphism |
| Typography | **IBM Plex Sans + IBM Plex Mono** (self-hosted) | Inter/Outfit |
| Backend / DB | **Supabase (PostgreSQL 15+)** | Kept |
| Auth & RBAC | **Supabase Auth + Postgres RLS** | Supabase Auth alone |
| Offline | **PWA service worker + Dexie (IndexedDB) + sync queue** | localStorage autosave |
| Realtime | **Supabase Realtime** (QH review notifications) | — |
| PDF | **Dedicated `@media print` CSS engine** | Kept |
| Hosting | **Vercel (frontend) + Supabase (data/auth)** | Kept |
| Testing | **Vitest + Playwright + fast-check** | — |
| Tooling | **ESLint + Prettier + `tsc --noEmit` in CI** | — |

---

## 3. Layer-by-Layer Decisions

### 3.1 Language & Frontend Framework — Vite + React 19 + TypeScript (strict)

- **SPA, not SSR.** The app is behind a login, has zero SEO requirements, and needs an aggressive offline/PWA story. Next.js/RSC complexity buys nothing here.
- **React 19** for concurrent rendering on large grids and native `useOptimistic` for the submission queue.
- **Strict TypeScript** everywhere. Domain types mirror the Supabase schema via generated types (`supabase gen types`), so a schema change is a compile error, not a runtime 500.
- Measurement values are a dedicated `Measurement` branded type (`number & { __brand: 'mm' | 'µm' | 'deg' }`) — mixing an OD in mm with a DFT in µm becomes a compile-time impossibility.

### 3.2 Data Grids — TanStack Table + TanStack Virtual

This is the highest-stakes decision in the document. The dimensional grid (~53–100 rows × 5 samples) and the DFT grid (2 × 26 points) must hit **sub-100ms keyboard response** (PRD §5) while running real-time tolerance validation per keystroke.

- **TanStack Table** gives headless row/column models, keyboard cell navigation, and controlled editing — we own all rendering, which is what print fidelity requires.
- **TanStack Virtual** keeps only visible rows in the DOM. 100 rows × 8 columns of validated inputs stays at 60fps even on a 2018-vintage shop-floor tablet.
- Tolerance evaluation (green/amber/red) runs inside the table cell renderer as a pure function of `(value, min, max)` — no component state, no re-render cascades.

### 3.3 Forms & Validation — React Hook Form + Zod

- Every domain rule lives in a **Zod schema, in one place**: GD&T parsing (`(2065)` → `2065`), Min/Max derivation, the Magnus-Tetens dew point transform, ISO 19840 (80/200 rule) evaluation, and shelf-life date checks.
- The same schemas validate client-side input, server-side via Postgres constraints + edge validation, and generate the Playwright test fixtures. One source of truth, three enforcement points.
- **React Hook Form** for uncontrolled-input performance: the grid does not re-render the world on every keystroke; only the edited cell and its status chip update.

### 3.4 State Management

- **Server state → TanStack Query.** Item master, batch lists, instrument registry, sign-off status. Cache invalidation keyed by batch ID; QH approvals appear in inspector dashboards without refresh.
- **Client/entry state → Zustand.** The in-flight inspection batch (draft readings, instrument assignments, autosave cursor) is a single store with a Dexie persistence adapter — the store hydrates from IndexedDB on app start.

### 3.5 Styling — Tailwind CSS v4 + Custom Tokens + Radix Primitives

- **Tailwind v4** configured with a **100% custom token layer** (colors, spacing, type scale, radii) defined in `@theme` — the exact token table in `ui-ux-plan.md` §4. No default Tailwind palette ships to production; the design system palette is the only palette.
- **No shadcn/ui defaults, no gradient banners, no glassmorphism.** Those are precisely the "AI slop" look this project is rejecting (see `ui-ux-plan.md` §3).
- **Radix primitives** (Dialog, Select, Popover, Tooltip, Toast) for the accessibility-critical widgets — focus trapping, ARIA wiring, and keyboard behavior come free and battle-tested. Restyled to the design system, never used stock.
- CSS remains deterministic and audit-friendly: utilities for layout, a thin component layer for the ~12 repeated patterns (data cell, status chip, form row, section card).

### 3.6 Offline & Reliability — PWA + Dexie + Sync Queue

This replaces the localStorage autosave requirement (PRD DIM-07, NFR "Reliability") with a real offline architecture:

```
Inspector fills grid ──► Zustand store ──► Dexie (IndexedDB), every keystroke-batch
                                              │
Service worker caches app shell + Item Master data
                                              │
        [Offline?] ── no ──► Sync queue drains ──► Supabase (transactional insert)
              │                                            │
              └── yes: draft persists locally, ────────────┘
                  syncs automatically on reconnect;
                  conflict policy: server wins for
                  SUBMITTED+ states, local wins for DRAFT
```

- **Draft persistence survives** browser crash, tab closure, tablet reboot, and multi-day offline use.
- localStorage remains only as a belt-and-braces mirror of the active draft (a few KB), not the primary store.

### 3.7 Backend — Supabase (PostgreSQL)

The relational shape in the original report is correct and retained:

`customers → items → drawing_revisions → (dimension_rows | coating_specs) → batches → readings → sign-offs`

Hardening added in v2:

| Concern | Mechanism |
|---|---|
| Role security | **RLS policies per role** — a QC Inspector literally cannot read another inspector's draft or write a `sign_offs` row |
| Immutability of approved batches | **Database trigger**: any `UPDATE`/`DELETE` on `readings`/`batches` where status = `APPROVED` raises an exception (PRD SO-04) |
| Audit trail | **Append-only `audit_log`** table, written by trigger on every state transition; no UPDATE grant exists |
| Atomic submissions | Batch + readings + sign-off submission wrapped in a single Postgres function (RPC) — no half-submitted batches ever |
| Review notifications | **Supabase Realtime** channel per role — QH sees new submissions, inspectors see approvals/rejections instantly |
| Calculation defense-in-depth | Dew point, ΔT margin, and ISO 19840 stats re-computed in the RPC on submit; client-claimed statistics are never trusted |

### 3.8 PDF Generation — Print-CSS Engine (kept)

`@media print` stylesheets remain the right call: the formats `ST/QC/02` and `ST/QC/04` are **controlled QMS documents** that must pixel-match the audited layouts. Print CSS renders from the same React components as the screen (with print-only branches), guaranteeing the reviewed record and the printed record can never diverge. Puppeteer-based rendering on Vercel is documented as the fallback if client-side print fidelity proves insufficient on tablet browsers.

### 3.9 Testing & Tooling

| Tool | Purpose |
|---|---|
| **Vitest** | Unit tests: GD&T parser, Magnus-Tetens dew point, ISO 19840 engine, Min/Max derivation |
| **fast-check** | Property tests: parser never yields Min > Max; dew point monotonically tracks RH; 80/200 rule matches spec examples |
| **Playwright** | E2E: full inspector → QH → PDF journeys; keyboard-only grid navigation; the dew-point lock-out gate |
| **ESLint + Prettier + `tsc --noEmit`** | CI gate on every PR |

### 3.10 Deployment

- **Vercel** — SPA hosting, preview deployments per PR, edge caching of the static shell.
- **Supabase** — Postgres, Auth, Realtime, scheduled function for calibration-due-date email/digest jobs (EQ-02 alerts).
- Environment separation: `staging` Supabase project for CI E2E, `production` with PITR backups enabled (audit data retention measured in years).

---

## 4. Considered & Rejected

| Option | Verdict | Reason |
|---|---|---|
| **Next.js / RSC** | Rejected | No SEO, public pages, or server-rendering need; complicates PWA/offline; heavier deploy model |
| **Native mobile (iOS/Android)** | Rejected (for now) | Tablet browser + PWA covers shop-floor use at a fraction of the cost; revisit only if camera/barcode scanning is demanded |
| **ElectricSQL / CRDT sync** | Deferred | Real offline-write conflicts here are rare (one inspector per batch); the simple queue covers v1. Re-evaluate for the Customer Portal phase |
| **shadcn/ui stock components** | Rejected | Default aesthetics are exactly the generic look the design direction rejects; we use the underlying Radix primitives with bespoke styling |
| **Client-side jsPDF / pdfmake** | Rejected | Cannot match controlled-document print fidelity; print-CSS from the live components is more maintainable and always in sync |
| **Monorepo (Turborepo)** | Deferred | Single-app scope today; revisit when the Customer Portal phase begins |

---

## 5. Stack ↔ Requirement Traceability

| PRD Requirement | Stack element enforcing it |
|---|---|
| DIM-03/04 (grid + real-time colors) | TanStack Table + Virtual, pure tolerance function |
| DIM-07 (autosave, zero data loss) | Zustand + Dexie persistence, every keystroke batch |
| COAT-03 (dew point engine + lock) | Zod transform (client) + Postgres RPC recomputation (server) |
| COAT-06 (ISO 19840 stats) | Pure statistical module, property-tested |
| EQ-02/03 (calibration status) | Scheduled Supabase function + RLS-aware registry queries |
| SO-03/04 (immutable sign-off) | DB trigger + append-only audit_log |
| PDF-02/03 (pixel-matched reports) | Print-CSS engine from live components |
| NFR Performance (sub-100ms) | Virtualized rows, uncontrolled inputs, memoized status chips |
| NFR Reliability (shop floor) | PWA + Dexie + sync queue |

---

*This decision record is authoritative for all implementation. Changes require a version bump and a written rationale appended to §4.*
