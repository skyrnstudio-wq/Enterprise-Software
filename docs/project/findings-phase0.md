# Phase 0 Findings Report

## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Scope of review:** Full repository audit against the approved `testing-quality-plan.md` and `ui-ux-plan.md`, plus live verification run. **No code was changed as part of this report.**
**Depends on:** `testing-quality-plan.md`, `ui-ux-plan.md`, `delivery-milestones.md`, `technology-stack.md`

---

## 1. Verification Result (executed, not assumed)

The CI gate `npm run verify` was run in this workspace:

| Gate                               | Result                                      |
| ---------------------------------- | ------------------------------------------- |
| `tsc --noEmit` (typecheck, strict) | ✅ Pass                                     |
| ESLint `--max-warnings 0`          | ✅ Pass                                     |
| Vitest unit + property suite       | ✅ Pass — **4 files, 24 tests, 0 failures** |

**Phase 0 exit criteria (`delivery-milestones.md` §3) — assessed met:** verify gate green · PWA assets present (`pwa-192x192.svg`, `pwa-512x512.svg`, manifest wired) · domain engines unit- and property-tested · app boots with the design token layer · documentation set complete and cross-indexed.

---

## 2. What Conforms to the Approved Plans

### 2.1 Domain test inventory — all ✓-marked "cannot regress" items covered

Checked against `testing-quality-plan.md` §3:

| Plan rule                                              | Implementation                                                                                                                                                     | Test evidence                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Parser: `(2065)`, `Ø12`, `100°`, `±0.5`, `+0.2/-0.1` ✓ | `src/domain/tolerance-parser.ts` — all five forms, plus reference-dimension flag and GD&T symbol detection; returns `null` for attribute-check text (`GO / NO-GO`) | 6 example tests + fast-check property                  |
| Parser never yields Min > Max (property)               | `deriveLimits()` guards defensively with a swap                                                                                                                    | `fc.assert` over generated nominals/tolerances ✅      |
| Dew point via Magnus-Tetens; RH bounds ✓               | `src/domain/dew-point.ts` — Sonntag-1990 constants, `null` for RH ≤ 0 / > 100                                                                                      | RH-bound edge tests                                    |
| Dew point monotonic in RH (property)                   | Holds across T ∈ [−10, 45], RH ∈ [5, 95]                                                                                                                           | `fc.assert` ✅                                         |
| ΔT < 3.0 °C ⇒ PROHIBITED ✓                             | `evaluateDeltaT()` with `MIN_DELTA_T_C = 3.0`; distinct `invalid-input` result branch                                                                              | Lock-out example + invalid-input test                  |
| DFT stats, nulls skipped ✓                             | `computeDftStats()` filters `null`/non-finite — never treats empty as zero                                                                                         | Explicit null-skip test                                |
| ISO 19840 80/200 rule + 5-reading minimum ✓            | `evaluateIso19840()` with three failure reasons                                                                                                                    | Below-80, above-200, insufficient-readings tests       |
| Tolerance coloring (pass/warn/fail, 10 % band) ✓       | `evaluateTolerance()` in `src/domain/measurement.ts`; zero-band edge handled                                                                                       | Example tests at exact 10 % boundaries                 |
| Batch code grammar `^\d{4}-\d{2}$`                     | `batchHeaderSchema` in `src/domain/schemas.ts` (Zod)                                                                                                               | Schema present (see §4.3 — no dedicated test file yet) |
| APPROVED immutability (state machine)                  | `batch-state.ts` — `ALLOWED["APPROVED"]` is empty                                                                                                                  | Implemented (see §4.3 — tests pending)                 |

Branded measurement types (`mm`, `µm`, `°C`, `%RH`) are in place per `technology-stack.md` §3.1 — the mm/µm mixing class of error is a compile-time impossibility, as planned.

### 2.2 Architecture & tooling conforms

- **Stack matches the authoritative record:** Vite 7 + React 19 + TS strict, TanStack Router/Table/Query/Virtual, Zod 4, Zustand, Dexie, Supabase JS, Tailwind v4 `@theme` (no default palette ships), Vitest + fast-check + Playwright. `playwright.config.ts` already carries the desktop-Chrome + iPad dual-profile requirement.
- **Offline-first shape:** Dexie `pendingSync` queue table staged; PWA manifest + Workbox precache configured; Supabase API traffic deliberately excluded from the SW (sync-queue owned), matching `offline-sync-architecture.md`.
- **Fail-fast env contract:** both `src/lib/env.ts` and the Supabase client throw at startup on missing vars — matches the README's stated intent.
- **Documentation set:** all 19 project docs + 2 teaching docs present, cross-referenced, and indexed in `docs/README.md` with a declared precedence order.

---

## 3. Findings

Severity scale: 🔴 must resolve before the phase that depends on it · 🟡 resolve during the next relevant phase · 🟢 note for the record.

### 3.1 🔴→✅ F-01 — Accent color contradicts the UI/UX plan — **RESOLVED 2026-09-14**

`ui-ux-plan.md` §4.1 is explicit: the single industrial accent is **safety orange `#E05A00`**, and §1.2 bans "SaaS dashboard" accent colors. The implemented token layer (`src/styles/index.css`) instead defines a **`blueprint` blue ramp** (`#2d6cb5` primary) and the home route uses it as the accent swatch. This is the single largest deviation from an approved design decision and touches every future component (focus rings, primary buttons, active states). Resolve in Phase 2 (first component-heavy phase) — the fix is confined to the token layer plus the two existing routes.

### 3.2 🟡→✅ F-02 — Status token set incomplete vs. the plan's table — **RESOLVED 2026-09-14**

The plan (§4.2) defines five semantic statuses with **bg + fg pairs** (pass, warn, fail, **info**, **locked**). The CSS layer implements solid `status-pass/warn/fail` plus `-bg` variants only: **no `-fg` text tokens and no `info` / `locked` tokens at all.** The `ƒx AUTO-CALC` (info) treatment is central to the automated-UX layer (§7 A2), so these gaps will surface as soon as real components are built. Also near-miss values: canvas `#f5f4f0` vs plan `#F4F4F2`, paper-raised `#ffffff` vs plan `#FCFCFB` — reconcile to the plan's exact hex values when the tokens are corrected.

### 3.3 🟡→✅ F-03 — Radius scale drifts from spec — **RESOLVED 2026-09-14**

Plan §3.2: 2px inputs/cells, 4px cards/buttons/chips, "no pill shapes." CSS defines `--radius-md: 6px`, which is off-spec and unused-but-available; the home route already uses `rounded-md`. Clamp the scale to 2/4px.

### 3.4 🟡→✅ F-04 — Fonts are CDN-loaded, not self-hosted, breaking offline-first — **RESOLVED 2026-09-16**

`index.html` contains the comment _"IBM Plex Sans / Mono self-hosted fonts"_ but actually loads them from `fonts.googleapis.com`. Two problems: (a) the comment is false; (b) a CDN dependency defeats the offline-first PWA goal (`offline-sync-architecture.md`) — on a disconnected shop-floor tablet, first paint after cache falls back to system fonts and, worse, the request can stall cold starts on flaky Wi-Fi. The plan's Workbox `globPatterns` already includes `woff2` in anticipation. Self-hosting was evidently the intent; it should become reality in Phase 2. — **Resolved with Phase 2:** IBM Plex Sans (400/500/600) + Mono (400/500) woff2 self-hosted from `public/fonts/` (source: official `@ibm/plex-*` npm packages), Google Fonts links removed, @font-face declared in the token layer, Workbox precache confirmed (18 entries incl. fonts).

### 3.5 🟡→✅ F-05 — Duplicate environment validation paths — **RESOLVED 2026-09-15**

`src/lib/env.ts` exists as "central environment access" with its own fail-fast, but `src/lib/supabase/client.ts` independently re-reads `import.meta.env` and re-implements the fail-fast. Today both throw the same class of error, but the two messages differ and future config (app env, staging flags) will diverge. Have the client consume `env.ts`. Low effort, prevents drift. — **Resolved with Phase 1:** the client now consumes `env.ts` exclusively; no module reads `VITE_SUPABASE_*` directly anymore.

### 3.6 🟢→✅ F-06 — Two property-test invariants from the plan are not yet written — **RESOLVED 2026-09-16**

`testing-quality-plan.md` §3 lists four fast-check invariants; two are implemented (parser min≤max; dew point RH-monotonic), two are missing from the suite:

1. **`evaluateTolerance` partitions the number line** (no gaps/overlaps across pass/warn/fail) — current coverage is example-based only.
2. **"80/200 verdict matches spec examples"** is covered by unit examples, but note the implemented monotonic property asserts `≥` where the plan says _strictly_ increases — acceptable physically (dew point saturates as RH → 100), but worth a one-line note in the test file when touched. — **Resolved with Phase 2:** the partition property is implemented (`measurement.test.ts`), and the saturation caveat is documented in `dew-point.test.ts`.

Both property invariants from the plan's §3 list now exist in the suite; F-06 is fully closed.

Both are cheap to add and belong to the ✓-marked rows, so schedule them with the next test-writing pass rather than deferring.

### 3.7 🟢→🟡 F-07 — State machine and schema tests are correctly deferred, but tracked — **schema half closed 2026-09-15**

`batch-state.ts` transitions (all legal + illegal edges, APPROVED immutability) and the schema tests (batch-code grammar, GD&T Min ≤ Nom ≤ Max DB parity) are listed in the plan §3 inventory **without** the Phase 0 ✓ mark, and are indeed untested. This is plan-conformant, but they must land with Phases 3 and 1 respectively — noting here so the deferral is a decision, not an oversight. — **Updated with Phase 1:** the schema half landed as `src/domain/__tests__/schema-parity.test.ts` (25 tests statically asserting migration ↔ domain parity: tables, uniques, CHECKs, legal state edges vs `batch-state.ts`, Magnus-Tetens constants, ΔT `< 3.0`, ISO strict thresholds, BT_* contract). The state-machine behavioural suite remains a Phase 3 deliverable.

### 3.8 🟢 F-08 — Print engine is a stub (expected)

`@media print` currently only forces a white body. Per `report-export-spec.md` and the milestone plan, real fidelity work is Phase 6. No action now; recorded so the stub isn't mistaken for coverage.

### 3.9 🟢 F-09 — Supabase types are declared placeholders (expected)

`database.types.ts` is hand-written with an empty `Tables` map and only the `batch_status` enum, clearly marked for regeneration after the first migration (`supabase/README.md` documents the command). `batch-state.ts` already imports `BatchStatus` from it, so the first migration must regenerate this file before the data-layer phase compiles anything real. Expected sequencing; no action now.

---

## 4. Consolidated Action List

| #    | Finding                                                                               | Severity | Owner phase                 | Effort |
| ---- | ------------------------------------------------------------------------------------- | -------- | --------------------------- | ------ |
| F-01 | Replace `blueprint` accent with safety orange `#E05A00` per ui-ux-plan §4.1           | 🔴→✅    | ~~Phase 2~~ **Done**        | S      |
| F-02 | Complete status token set (fg pairs, info + locked) and reconcile hex values          | 🟡→✅    | ~~Phase 2~~ **Done**        | S      |
| F-03 | Clamp radii to 2/4px, remove `--radius-md: 6px`                                       | 🟡→✅    | ~~Phase 2~~ **Done**        | XS     |     | F-04 | Self-host IBM Plex woff2, drop Google Fonts CDN                                      | 🟡→✅ | ~~Phase 2~~ **Done**              | S   |
| F-05 | Make `supabase/client.ts` consume `lib/env.ts`                                        | 🟡→✅    | ~~Phase 1~~ **Done**        | XS     |
| F-06 | Add number-line-partition property for `evaluateTolerance`; note RH-saturation caveat | 🟢→✅    | ~~Next test pass~~ **Done** | XS     |     | F-07 | Land state-machine + schema tests with Phases 3 / 1 (schema done, machine = Phase 3) | 🟢→🟡 | 2 ✅ / 3 (staging matrix remains) | M   |
| F-08 | Print engine stub — by design                                                         | 🟢       | Phase 6                     | —      |
| F-09 | Regenerate DB types after first migration                                             | 🟢       | Phase 1                     | XS     |

**Bottom line:** Phase 0 is genuinely done — the verify gate is green, the four critical domain engines behave per the PRD, and the offline/PWA/docs foundations are real, not decorative. The only red-level finding is cosmetic-but-systemic: the implemented accent color contradicts the approved design language, and it is cheapest to correct before any component code exists on top of it.

---

_This report documents state as of 2026-09-14 against plans v1.0. Findings F-01…F-05 should be re-verified and this file closed out after the Phase 2 token-layer work._
