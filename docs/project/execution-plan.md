# Execution Plan — Phased Build Order & Edge-Case Register

## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current — operational plan derived from the approved document set
**Depends on:** `product-requirements.md` (requirements), `technology-stack.md` (authoritative stack), `application-flow.md` (flows/state machine), `ui-ux-plan.md` (design system), `backend-architecture.md` (DB contract), `offline-sync-architecture.md` (sync/conflict rules), `report-export-spec.md` (print fidelity), `security-compliance.md` (auth/RBAC), `testing-quality-plan.md` (test inventory), `delivery-milestones.md` (exit criteria), `findings-phase0.md` (open findings)

---

## 0. How to Use This Document

This is the **operational layer** between the milestone plan (what/when) and the engineering docs (how). For every phase it lists:

1. **Steps** — an ordered, checkable build sequence with the PRD traceability IDs.
2. **Edge-case register** — concrete boundary conditions that must be designed for in that phase, each with the phase where it is _handled_ (a deferred edge case is still owned; it is never orphaned).
3. **Definition of done** — the phase's exit gate, aligned with `delivery-milestones.md` §3 and the `npm run verify` CI gate.

Rules of engagement (inherited, restated here so they bind this plan):

- Every PRD requirement lands with its `testing-quality-plan.md` §3 test row before the phase exits.
- `npm run verify` (typecheck + ESLint 0 warnings + Vitest) is green on every PR, no exceptions.
- Docs sync rules (`docs/README.md`) apply to every change that touches a documented decision.
- Open findings from `findings-phase0.md` are burned down inside the phase that owns them (§11 below).

---

## Phase 1 — Data Layer (Supabase: schema, RLS, triggers, RPCs)

**Goal:** the database enforces the PRD by itself, before any UI exists.

### Steps

1. **Bootstrap Supabase projects** — staging + production; set env vars; wire `supabase/config.toml`. _(F-09 owner)_
2. **Migration 001 — core schema:** `customers`, `items`, `drawing_revisions`, `dimension_rows`, `coating_specs`, `batches`, `readings`, `coat_logs`, `dft_readings`, `sign_offs`, `instruments`, `audit_log`, `profiles` — per `backend-architecture.md` §2.1.
3. **Migration 002 — constraints** (§2.2): `min ≤ nominal ≤ max` CHECK, UNIQUE `(batch, row, sample)`, UNIQUE `(batch, side, point)`, delivery-code regex, `sign_offs` UNIQUE `(batch, role)`, `batch_status` enum.
4. **Migration 003 — triggers:** `forbid_approved_mutation()` on all four tables incl. the batches status-change guard; audit-log trigger on every transition; append-only grants (no UPDATE grant on `audit_log`).
5. **Migration 004 — RLS:** enable on all tables; policies per `backend-architecture.md` §4.2 matrix; helper function `auth_role()` reading `profiles`.
6. **RPCs:** `submit_batch` (atomic, recomputes dew point/ΔT/ISO 19840 server-side, enforces ΔT ≥ 3.0 °C, inserts inspector sign-off), `decide_batch` (role-checked; REJECT requires comments; approve → immutable), `upsert_batch_draft` (idempotent, conflict policy §5 of offline doc).
7. **Generated types:** `supabase gen types` → `src/lib/supabase/database.types.ts`; refactor `batch-state.ts` import if the shape changed. _(F-09 closure)_
8. **Wire `src/lib/supabase/client.ts` to `src/lib/env.ts`.** _(F-05 closure)_
9. **Seed script:** the audited fixture item — Spiral Air Duct Cap (`W1G00005572`, rev A), 53 dimension rows, C3/C4 coating spec, instrument set (`VC-04`, `MC-02`, `DG-01`, `HG-01`, `PG-01`).
10. **Tests:** state-machine tests (all legal + illegal edges incl. APPROVED immutability — plan §3 row), schema tests (batch-code grammar; Zod ↔ DB constraint parity), RLS matrix tests (role × table × operation), RPC tests (wrong-client-stats, ΔT block, reject-without-comments, immutability). _(F-07 partial closure)_

### Edge cases

| #    | Edge case                                                                                                                                                                               | Handled by                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1.1  | Dimension row with zero-band tolerance (`min == max`, e.g. a GO/NO-GO nominal) — CHECK must accept equality                                                                             | Migration 002 CHECK               |
| 1.2  | Tolerance magnitudes of 0 on both sides; negative tolerance input rejected                                                                                                              | Migration 002 + Zod parity        |
| 1.3  | Reading value exactly on Min or Max — is "on-limit" pass or fail? Decide once (PRD DIM-04 says strict breach ⇒ fail ⇒ on-limit = pass), encode in RPC recompute and `evaluateTolerance` | RPC + domain function             |
| 1.4  | `decide_batch` where signer == submitter (self-approval) — must raise (security doc §4 separation of duties)                                                                            | RPC check                         |
| 1.5  | Reject with empty/whitespace-only comments — raise, not silently accepted                                                                                                               | RPC check                         |
| 1.6  | Concurrent submit from two devices (same draft, both offline-captured) — `upsert_batch_draft` idempotency + `updated_at` row winner                                                     | RPC + sync doc §5                 |
| 1.7  | Submit while batch already SUBMITTED (double-tap / retry after timeout) — idempotent, no duplicate sign-off rows (UNIQUE `(batch, role)`)                                               | RPC + constraint                  |
| 1.8  | Attempted UPDATE/DELETE on APPROVED batch via service role / SQL console — trigger still fires (it is table-level, not role-level)                                                      | Migration 003                     |
| 1.9  | Status transition REJECTED → SUBMITTED (skipping DRAFT) — illegal edge, trigger rejects                                                                                                 | State machine parity test         |
| 1.10 | `dew_point` inputs at RH = 100 and RH → 0⁺; ambient at −45/60 °C bounds — server formula must match client NaN/null semantics exactly                                                   | RPC parity test vs `dew-point.ts` |
| 1.11 | ISO 19840 with exactly 5 readings, and a reading exactly at 0.8× or 2.0× nominal (boundary: `<` vs `≤`) — match `dft-stats.ts` semantics (`< 0.8×` flags, `> 2×` flags)                 | RPC parity test                   |
| 1.12 | Delivery batch code `0000-00` and `9912-99` — regex-legal but semantically odd; accept (grammar is the contract, not semantics) but add a Zod refine warning                            | Zod schema                        |
| 1.13 | Instrument deleted (or retired) that readings still reference — never hard-delete; add `retired_at` soft-state instead                                                                  | Schema design                     |
| 1.14 | `revision_id` change after first submit (IM-05) — trigger must reject                                                                                                                   | Migration 003 trigger             |
| 1.15 | Clock skew: client timestamps in payloads — all `signed_at`/`at` values are `now()` from the DB                                                                                         | RPC design                        |

### Definition of done

Migration applies to clean staging · RLS matrix tests green for every role×table×operation · approved-mutation trigger proven by test (including service-role attempt) · `submit_batch` recomputation proven · types generated and compiled against · verify gate green.

---

## Phase 2 — Identity, Master Data & Design-System Components

**Goal:** users, roles, Item Master, Equipment Registry — and the component vocabulary every later screen reuses.

### Steps

1. **Auth:** Supabase email/password login, session persistence/refresh (client exists), inactivity timeout (30 min, per security doc §3), role routing post-login (no role picker — ui-ux plan §6.1).
2. **MFA (TOTP) enforcement for QH + Admin** — enrollment flow + login challenge.
3. **Profiles + RBAC context:** auth context in router (`router.ts` already threads `context: { auth }`); role affordance helpers.
4. **Design-token burn-down:** align `--color-paper` → `#F4F4F2`, `--color-paper-raised` → `#FCFCFB` (findings F-02 residual).
5. **Self-host IBM Plex woff2** (Sans 400/500/600, Mono 400/500); remove Google Fonts links; verify Workbox precache picks them up. _(F-04 closure)_
6. **Component layer (~12 patterns, ui-ux plan §5):** Measurement Cell, Status Chip, Compliance Panel, Section Card, Form Row, Data Table (TanStack Table + sticky header/first col), Wizard Rail, Toast, Empty State, Sign-off Block, `ƒx` tag. Radix primitives restyled to tokens — never stock.
7. **Item Master admin UI:** list (search across item code/drawing no./customer/description — IM-06), 4-step editor wizard, **spreadsheet-like dimension-row editor with live parser feedback** (IM-02/03), Excel paste-import path (the migration accelerant), coating-spec step from the validated product library (IM-04), revision creation (IM-05).
8. **Equipment Registry UI:** instrument CRUD, generated `next_due_at` display, status chips (Active/Due-Soon/Expired — EQ-02), calibration timeline drawer.
9. **Instrument status engine:** pure function `instrumentStatus(now, nextDue)` + the 15-day amber boundary; unit tests incl. exact-date edges (plan §3 row). _(EQ-02)_
10. **Tests:** parser UI round-trip (paste `Ø25±0.2` → filled Min/Max, locked), component tests for chip/cell/panel, instrument boundary tests.

### Edge cases

| #    | Edge case                                                                                                                                                                                                 | Handled by             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 2.1  | Parser receives `10 min` (lower-bound-only) — grammar in data-dictionary §6 lists it; parser currently returns null → decide: support or explicitly reject with a validation chip ("unrecognized format") | Parser + editor chip   |
| 2.2  | Parser receives `R5` vs plain `5` (radius ambiguity); `φ` vs `Ø` variants; `⌀` U+2300 — symbol table must match all, tests pin each                                                                       | Parser tests           |
| 2.3  | Thousands separators in European format (`2.065,0`) vs US (`2,065.0`) — ambiguous with decimal commas; **decide: reject with chip** (drawings use plain digits)                                           | Editor validation      |
| 2.4  | Nominal with more decimals than the tolerance (e.g. `25.005 ±0.1`) — keep full precision; grid displays rounded, stores exact                                                                             | Display rule           |
| 2.5  | Dimension template with >100 rows — editor must virtualize (TanStack Virtual from day one)                                                                                                                | Editor                 |
| 2.6  | Duplicate serial numbers in a pasted set; gaps in serials — normalize on import, show diff summary                                                                                                        | Import flow            |
| 2.7  | Excel paste with merged cells / multi-line labels — flatten, flag rows that failed to parse                                                                                                               | Import flow            |
| 2.8  | Item edited while a batch is in flight against an older revision — batches pin `revision_id`; editor warns on publish                                                                                     | IM-05 invariant        |
| 2.9  | Two admins editing the same item concurrently — last-write-wins with a stale-write warning banner (no CRDTs; scope is small)                                                                              | Editor policy          |
| 2.10 | Instrument calibrated early (next_due before last_cal) or interval 0 — validation rejects                                                                                                                 | Registry form + Zod    |
| 2.11 | Instrument expiring _today_ — boundary: `next_due == today` is Expired or Due-Soon? Decide: Expired at 00:00 IST of due date; pin with test                                                               | Status engine          |
| 2.12 | 15-day window crossing a month/year boundary (e.g. due 2027-01-02, today 2026-12-25) — pure date math, property-tested                                                                                    | Status engine          |
| 2.13 | Inactivity logout mid-grid-entry — draft already in Dexie; on re-login, restore with cursor                                                                                                               | Auth + store hydration |
| 2.14 | MFA enrollment skipped by QH — blocked from QH affordances until enrolled; enforced again at `decide_batch` (server)                                                                                      | Auth + RPC             |
| 2.15 | Role change while user logged in (promoted to QH) — JWT carries old role until refresh; server RLS is the control plane, UI affordances refresh on token refresh                                          | RBAC context           |
| 2.16 | Self-hosted fonts fail to load (corrupt cache) — system-font fallback stack declared; `.measurement` keeps tabular-nums                                                                                   | CSS fallback           |

### Definition of done

All four roles authenticate with correct affordances · admin CRUDs items, revisions, dimension templates, instruments · EQ-02 status computation + alerts live · token findings closed · verify gate green · component tests green.

---

## Phase 3 — Dimensional Module (the 5-Sample Grid)

**Goal:** Critical Journey #1 — the 53-row grid, keyboard-first, real-time tolerance feedback, autosave.

> **Status (2026-09-16): DONE in code** — grid model + F-06a partition property, Zustand↔Dexie autosave with tab-claim, offline queue + drain, keyboard model (Tab→/Enter↓/F2/double-tap, clamp navigation), virtualized 53×5 grid, `/batch/new`, `/batch/$batchId` with live checklist + submit, dashboard rebuild. F-07 state-machine tests landed. Open: staging verification (provisioned Supabase), E2E #1/#2/#4/#5 (Phase 6).

### Steps

1. **New-batch flow:** item picker (recent items first — ui-ux §6.5), header form (PO, delivery code, date, lot qty — Zod `batchHeaderSchema`), `Load Inspection Grid`.
2. **Grid engine:** TanStack Table + Virtual; uncontrolled Measurement Cells; Tab→right / Enter→down navigation; F2/double-tap edit; focus never lost (DIM-03).
3. **Real-time tolerance feedback:** `evaluateTolerance` in the cell renderer; amber = 10 % band; row status = worst of samples with Sr.# chip (DIM-04, ui-ux §6.6).
4. **Property test F-06a:** `evaluateTolerance` partitions the number line — no gaps/overlaps across pass/warn/fail. _(F-06 closure)_
5. **Quick-fill:** Copy-01→05, Fill Nominal (DIM-05); sticky action bar (tablet thumb zone).
6. **Instrument assignment:** per-row select pre-filtered to calibrated; bulk "apply to all linear rows"; expired selection blocks submission, not entry (EQ-03 + ui-ux §6.6).
7. **Autosave:** Zustand ↔ Dexie write-through (debounced ~300 ms), header "saved 12s ago" indicator, resume-on-load with cursor restore (DIM-07, offline doc §2).
8. **Submission:** client checklist (A5 gate: `✕ 2 rows missing instrument · ▲ 1 row near limit`), then `submit_batch` RPC.
9. **Rejection loop UI:** rejected batches pinned on dashboard, QH comments inline, revise → resubmit (application-flow §3).
10. **NCR trigger affordance:** "Draft NCR" appears on fail readings with pre-populated fields (NCR-01/02; full NCR UI lands Phase 8).
11. **Offline capture:** offline draft entry end-to-end; queue drain on reconnect (offline doc §3).
12. **Tests:** keyboard-model component tests (100-row virtualized grid), render-count assertion for the sub-100 ms NFR, E2E journeys 1/2/4 (golden path, rejection loop, keyboard-only), offline survival E2E #5.

### Edge cases

| #    | Edge case                                                                                                                                                                                                 | Handled by          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 3.1  | Value entered in wrong unit scale (e.g. 2.065 m typed as mm intent) — no auto-conversion (physics honesty); out-of-tolerance coloring + warn is the only signal. Decide explicitly, document in grid help | Cell validation     |
| 3.2  | Scientific notation / `1e3` typed into a cell — reject non-decimal input at the mask level                                                                                                                | Input mask          |
| 3.3  | Leading/trailing zeros and decimal comma (`24,8`) — comma maps to dot (tablet keypads send both); property-test the normalization                                                                         | Input mask          |
| 3.4  | Negative values where physically impossible (thickness −1) — schema allows, tolerance coloring flags; no silent clamping                                                                                  | Pass-through policy |
| 3.5  | Extremely precise input (`24.8050000001`) — store full precision, display per column format                                                                                                               | Display rule        |
| 3.6  | Copy-01→05 when sample 01 is empty — disabled with tooltip; when 01 is warn/fail — allowed (copied status follows)                                                                                        | Quick-fill logic    |
| 3.7  | Fill Nominal on a reference dimension — allowed (it is a real reading); row still evaluated                                                                                                               | Quick-fill logic    |
| 3.8  | Paste of 5 values into a row (from a notebook column) — split on whitespace/comma, fill samples 01–05                                                                                                     | Input handling      |
| 3.9  | Keyboard focus trapped by Radix dialog opened from grid (instrument picker) — restore focus to the originating cell on close                                                                              | Focus management    |
| 3.10 | Scroll during keyboard nav (Enter past viewport bottom) — virtualizer auto-scrolls the focused row into view                                                                                              | Grid + Virtual      |
| 3.11 | Autosave race: draft write in flight while user reloads — Dexie writes are atomic per row batch; last completed write wins; cursor ≥ last completed row                                                   | Store hydration     |
| 3.12 | Two tabs open on the same draft (shared tablet) — `BroadcastChannel` sync between tabs or last-tab-wins with warning; decide in implementation, pin with test                                             | Store policy        |
| 3.13 | Draft > 24 h abandoned — dashboard strip (A4 rule); batch remains resumable                                                                                                                               | A4 automation       |
| 3.14 | Grid loaded while offline with a _newer_ revision published server-side — capture against cached revision; warn at drain if revision changed; QH sees revision flag at review                             | Sync + review flag  |
| 3.15 | Instrument expired _between_ entry and submit — status computed at submit time; expired ⇒ gate, not retrospective invalidation                                                                            | Submit checklist    |
| 3.16 | All 5 samples identical on a ±0.001 tolerance row (suspicious uniformity) — warn chip `▲ possible fill error`, not a block (QH decides)                                                                   | A3 warning          |
| 3.17 | Row where a sample is a legitimate `0` — zero is a value, not "empty"; null handling must distinguish                                                                                                     | Cell model          |
| 3.18 | Tablet keyboard missing Enter (on-screen) — double-tap = move-down alternative; test both paths                                                                                                           | Navigation model    |
| 3.19 | Device clock skew on "saved 12s ago" — use monotonic local delta for display, server timestamps for records                                                                                               | Display rule        |

### Definition of done

A real 53-row batch is keyboard-driven end-to-end with instant 🟢🟡🔴 feedback · autosave survives reload/crash/reboot · submission produces a server-recomputed SUBMITTED batch · E2E journeys 1/2/4/5 green · verify gate green.

---

## Phase 4 — Coating Module (Sections A–E + the Lock-Out Gate)

**Goal:** Critical Journeys #2/#3 — psychrometric compliance gate, paint log, 26-point DFT grid.

### Steps

1. **Coating batch creation:** link to dimensional batch → header inherits read-only `ƒx inherited` fields (divergence structurally impossible — the audit defect fix); standalone path for parts without dimensional batches.
2. **Section A — surface prep:** preset selects (Sa 2.5 / G-40 / P-2), profile µm input with live 45–75 warn/fail (COAT-01/02), profile gauge assignment.
3. **Section B — psychrometric Compliance Panel:** three inputs, Magnus-Tetens live compute, ΔT verdict, the `✕ APPLICATION PROHIBITED` locked Continue state, live re-evaluation as conditions change (COAT-03).
4. **Section C — paint log:** coat cards (Primer → Intermediate → Finish), product selects from item's validated library, shelf-life status chips on date entry (COAT-04).
5. **Section D — DFT grids:** two 26-cell touch grids (Inside C4 240 µm / Outside C3 180 µm), live Min/Max/Avg/σ + ISO 19840 verdict per panel, `inputmode="decimal"` (COAT-05/06).
6. **Section E — visual checklist:** five required rows, count-gated Continue (COAT-07).
7. **Shelf-life engine:** pure function `shelfLifeStatus(mfgDate, interval)` + amber boundary; unit tests (plan §3 row).
8. **Wizard rail:** section completion state, back-free navigation, forward gated per section.
9. **Tests:** dew-point lock-out E2E #3, DFT live-stats component tests, ISO 19840 boundary unit tests, coating golden-path E2E.

### Edge cases

| #    | Edge case                                                                                                                                                                                                                | Handled by            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 4.1  | ΔT exactly 3.0 °C — compliant (gate is `< 3.0` blocks); pin with test                                                                                                                                                    | Gate parity           |
| 4.2  | ΔT = 2.99 °C — blocked; message states the actual margin ("0.01 °C below required")                                                                                                                                      | Panel copy            |
| 4.3  | Steel temp colder than ambient with RH near 100 — dew point ≈ ambient; ΔT negative; panel states condensation _present_, not just margin                                                                                 | Panel copy            |
| 4.4  | RH exactly 85 % (the %RH check boundary from application-flow §4.3: `> 85 %` blocks) — 85.0 passes, 85.1 blocks; pin with test                                                                                           | Gate parity           |
| 4.5  | Inputs at Zod bounds (−45 °C, 60 °C, RH 1/100) — schema accepts, physics computes; RH 100 with T below dew → negative ΔT handled                                                                                         | Schema + engine       |
| 4.6  | Frozen conditions: ambient below 0 °C — Magnus-Tetens valid to −45; panel still evaluates (blasting/painting at −10 °C is a real condition worth gating)                                                                 | Engine validity range |
| 4.7  | Conditions change mid-shift (steel warms in sun) — panel updates live; verdict at **submit** is what's recorded; historical truth per coat event preserved (`compliance_verdict` at record time, data-dictionary §4.3)   | Recording rule        |
| 4.8  | Dew point computed for a coat log whose inputs were later edited in a REJECTED cycle — recompute on resubmit; audit_log keeps the old payload                                                                            | Audit semantics       |
| 4.9  | DFT reading exactly at 0.8× nominal (192 µm on C4) — compliant (`< 0.8` flags); exactly 2.0× (480 µm) — compliant (`> 2` flags); pin both                                                                                | Boundary tests        |
| 4.10 | DFT value 0 (uncoated spot) or negative — 0 flags below-80; negative rejected by input mask as impossible                                                                                                                | Mask + engine         |
| 4.11 | Partial DFT grid at submit (e.g. 20/26) — ISO 19840 needs ≥ 5 per area; submission checklist warns on incomplete grid but allows submit only if ≥ 5 and the operator acknowledges; QH sees the incompleteness flag       | Gate + flags          |
| 4.12 | Both sides of one component use the same gauge — one instrument field per grid panel vs per batch: decide per-batch (matches paper), shown on both panels                                                                | Data model            |
| 4.13 | Paint part B mfg date _after_ part A (data-entry transposition) — validation warning, not block (transposed batch numbers are a real typo class)                                                                         | Date validation       |
| 4.14 | Shelf-life boundary: product expiring _today_ — `▲ expires today`; expired ⇒ hard block on coat log entry (COAT-04)                                                                                                      | Shelf-life engine     |
| 4.15 | WFT entered in µm but gauge reads mils (1 mil = 25.4 µm) — no unit conversion (physics honesty); out-of-range warn `▲ outside 80–100 µm` is the signal; note in help                                                     | Input policy          |
| 4.16 | Viscosity seconds with comma decimals — same normalization as 3.3                                                                                                                                                        | Input mask            |
| 4.17 | Coat log added _after_ psychrometrics measured (conditions changed between coats) — Section B allows re-measuring per coat event; each event stores its own psychrometric row (schema supports per-coat values)          | Data model            |
| 4.18 | Section E checklist: an item arrives genuinely defective (pinholes) — checklist stays unchecked, inspector uses **Draft NCR** instead of faking compliance; the wizard must make the NCR path obvious, never adversarial | UX + NCR hook         |

### Definition of done

Dew-point lock-out blocks sign-off on violating inputs (proven by E2E) · 26-point DFT grids compute live ISO 19840 verdicts · paint batch/shelf-life logging complete · verify gate green. — **Code complete 2026-09-16:** coating verdict layer + wizard + migration 007 + RPC RH/80-200 lock-out amendments landed; lock-out journey pinned at the component layer (12 tests), full E2E moves to the Phase 6 Playwright suite; staging RPC verification remains open (no provisioned Supabase).

---

## Phase 5 — Sign-off, Review Workflow & Realtime

**Goal:** the full submit → reject → revise → approve loop with immutable locks and live notifications.

### Steps

1. **QH review queue:** table (not cards) with flags column `▲2 ✕1 · 1 expired instrument` anchoring to offending rows (ui-ux §6.8).
2. **Review screens (S16/S17):** read-only render of the exact record the inspector saw; input cells → text; flag strip; pinned action bar.
3. **Approve path:** confirmation modal with immutable-lock statement; Sign-off Block pre-rendered; `decide_batch('APPROVE')`.
4. **Reject path:** mandatory comments (min 10 chars, per ui-ux §6.8), show where the inspector will see them; `decide_batch('REJECT')`.
5. **Immutability UX:** APPROVED batches render read-only with `LOCKED` chip; no edit affordances anywhere; direct API mutation attempt fails server-side (defense-in-depth E2E #7).
6. **Realtime:** channels `role:QUALITY_HEAD`, `user:{id}`, `batch:{id}`; submission toast for QH; approval/rejection toast for inspector (no refresh).
7. **Expired-instrument acknowledgement flow:** expired instrument in a submitted batch → QH mandatory acknowledgement with logged identity (EQ-03).
8. **Tests:** full loop E2E, "inspector cannot approve" security E2E, self-approval rejection test (edge 1.4 end-to-end), realtime notification tests.

### Edge cases

| #    | Edge case                                                                                                                                               | Handled by       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 5.1  | QH approves a batch whose flags they haven't scrolled to — approval modal re-states the flag summary; QH must acknowledge flags count before Confirm    | Modal contract   |
| 5.2  | Submit happens while QH has the record open (mid-review) — Realtime refreshes the view; stale-decision guard in `decide_batch` (version check)          | Realtime + RPC   |
| 5.3  | QH rejects a batch that was just approved (race) — `decide_batch` validates status == SUBMITTED; second decision raises                                 | RPC guard        |
| 5.4  | Inspector resubmits while QH is typing rejection comments — decision applies to the version QH opened; comment payload pins the batch version           | Audit semantics  |
| 5.5  | QH MFA session expired mid-review — re-challenge before decision; decision never lost (form state preserved)                                            | Auth UX          |
| 5.6  | Approval while offline — blocked by design (sign-off integrity requires server timestamps, offline doc §3); queue holds nothing for decisions           | Offline stance   |
| 5.7  | Notification arrives while app is backgrounded/closed — QH dashboard catches up on focus via query invalidation; no push-notification dependency for v1 | Query strategy   |
| 5.8  | Rejection comments with newlines/emoji/long text — rendering and PDF-safe truncation rules defined (comments print on the report per client preference) | Render rule      |
| 5.9  | A user promoted to QH tries approving their own submission (edge 1.4 reprise at UI layer) — server rejects; UI never offers the button                  | UI + RPC         |
| 5.10 | Batch deleted/retired between queue fetch and open — graceful "record no longer available" state                                                        | Queue resilience |

### Definition of done

Full submit → reject → revise → approve loop with immutable APPROVED state · an inspector cannot approve, proven by test · realtime notifications live · verify gate green. — **Code complete 2026-09-16:** review queue + S16/S17 screens + decision modals + realtime channels landed; AAL2 enforcement added to decide_batch (BT_MFA, edge 2.14 closed at the RPC); separation of duties pinned by canDecide tests + parity suite; loop E2E and live-server behaviour move to Phase 6 tooling / staging.

---

## Phase 6 — Reports (Print Engine & Fidelity Sign-off)

**Goal:** both controlled documents print pixel-true from the same components.

### Steps

1. **Print-CSS foundation:** `@page` A4 + measured margins; `break-inside: avoid` on rows/sign-off/stat blocks; `data-print` component variant (inputs → text spans, virtualization off).
2. **ST/QC/02 renderer:** letterhead, header fields, measurement grid, status chips (grayscale-safe glyphs ✓/!/✗), dual sign-off blocks, footer with format/rev/issue date + page n of m (PDF-02/04).
3. **ST/QC/04 renderer:** surface prep, psychrometric records with recorded verdict, paint batch log, DFT grids + statistics block, visual checklist, NACE sign-off (PDF-03).
4. **Export gate:** export action only on APPROVED; audit_log EXPORT entry with actor (report-export-spec §7).
5. **File naming:** `STQC02_{item_code}_{delivery_batch}_{YYYYMMDD}.pdf` convention, confirmed with client QMS.
6. **Golden-file fidelity pass:** print-to-PDF at 100 %, overlay vs audited Excel printouts, deviation list, **client QH sign-off** — schedule this session at phase start (risk table, milestones §5).
7. **Print regression tests:** Playwright print-emulation screenshots, visual diff in CI (report-export-spec §6).
8. **Email-to-client action** (application-flow §7): attachment compose, logged as EXPORT.

### Edge cases

| #    | Edge case                                                                                                                                                                                            | Handled by       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 6.1  | 100-row grid pagination — where does the grid break? Repeat header row on every page; serial column continuity visible; no row ever split (`break-inside: avoid`)                                    | Pagination rules |
| 6.2  | Long parameter labels wrapping mid-symbol (e.g. `Ø25±0.2 / 100°`) — label column wraps between tokens, never inside a symbol+value pair                                                              | Typography rule  |
| 6.3  | Multi-page sign-off orphaned on its own page with empty grid — sign-off block must follow the last grid page or sit on a closing page with section context                                           | Break rules      |
| 6.4  | DFT statistics block split across pages — forbidden (audit defect class); explicit keep-together                                                                                                     | Break rules      |
| 6.5  | Grayscale/B-W printing — status glyphs survive (✓/!/✗); light amber fills print as visible-but-light — verify on physical B/W printer, not simulator                                                 | Contrast check   |
| 6.6  | Tablet browser print pipeline producing scaled output (shrink-to-fit) — `@page size` + print dialog verification on iPad Safari; Puppeteer fallback pre-approved if it fails (milestones risk table) | Fallback plan    |
| 6.7  | Very long batch histories in the footer `page n of m` (report > 10 pages) — footer continues correctly, TOC not required by format                                                                   | Footer rule      |
| 6.8  | Special characters in labels (°, Ø, ±, µ) in the print pipeline — verify font glyph coverage in the self-hosted Plex subset; extend the woff2 subset if glyphs are missing                           | Font subsetting  |
| 6.9  | Export attempted on a REJECTED batch (URL-guessed route) — server gate raises; UI shows the gate state                                                                                               | Gate parity      |
| 6.10 | Email export to a client address fails (SMTP bounce) — action logged, user notified, retry allowed; report bytes never touch a third-party API                                                       | Export path      |

### Definition of done

Both controlled formats pass the golden-file comparison **signed by the client QH** · print regression test in CI · verify gate green.

---

## Phase 7 — Offline & PWA Hardening (Shop-Floor Pilot)

**Goal:** zero data loss across connectivity loss, reboots, and multi-day drafts — proven in the field.

### Steps

1. **Sync queue hardening:** exponential backoff + jitter, attempts cap 10 → quarantine + "Sync problems" badge (never silent drop) (offline doc §4).
2. **Heartbeat-based online detection** beyond `navigator.onLine` (offline doc §4).
3. **Item Master offline cache:** bounded fetch-to-Dexie on login; cold-start in airplane mode.
4. **SW update flow:** "Refresh to update" toast — never a silent mid-inspection reload (offline doc §6).
5. **localStorage mirror:** active-draft mirror + emergency JSON export on quota/Dexie corruption (offline doc §7).
6. **Conflict resolution UI:** "your draft was already submitted from another device" flow; re-hydration after drain (offline doc §5).
7. **Queue drain unit tests** (order, backoff, conflict rules) + fake-indexeddb integration tests (write → reload → hydrate parity).
8. **Shop-floor pilot:** one week on real tablets with real Wi-Fi; daily check-ins; the reliability NFR sign-off gate.

### Edge cases

| #    | Edge case                                                                                                                                                                  | Handled by           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 7.1  | Offline for days, then server-side item/revision changed — drain warns, batch pins old revision, QH review flag (mirrors 3.14)                                             | Drain policy         |
| 7.2  | IndexedDB quota exceeded mid-session (large draft set) — localStorage mirror + JSON export offer; error surfaced immediately, never at submit (offline doc §7)             | Storage fallback     |
| 7.3  | Dexie corruption (partial write/power loss) — mirror recovers the active draft; corruption event surfaced with export path; queue survives if intact                       | Recovery matrix      |
| 7.4  | SW update pending while a draft is open — toast defers until the draft is submitted or explicitly dismissed; autoUpdate never reloads a dirty form                         | Update flow          |
| 7.5  | Tablet in airplane mode with a _stale_ SW (old shell) — app must still boot and hydrate from Dexie; version mismatch banner                                                | Cold-start rule      |
| 7.6  | Queue entry for a batch the user can no longer access (role changed) — quarantined with explanation, not retried forever                                                   | Quarantine UX        |
| 7.7  | Heartbeat says online but Supabase returns 5xx — treat as offline for drain purposes; backoff continues                                                                    | Detection logic      |
| 7.8  | Clock changes (manual/DST/NTP) during offline use — local timestamps never trusted; display deltas monotonic; server re-stamps at drain                                    | Timestamp policy     |
| 7.9  | Same batch edited on two tablets during the same outage (assigned inspector borrowed a colleague's device) — conflict policy §5 applies deterministically; both re-hydrate | Conflict parity test |
| 7.10 | Pilot device lost/stolen mid-pilot — drafts are RLS-scoped to the inspector; report device, revoke session; data exposure limited to that inspector's drafts               | Incident runbook     |

### Definition of done

One week of shop-floor pilot shows **zero data loss** across connectivity loss, reboots, and multi-day drafts · sync failure path demonstrably surfaces (never silently drops) · verify gate green.

---

## Phase 8 — NCR & Quality Intelligence

**Goal:** NCR auto-drafting, audit recall, dashboards — the "Quality Intelligence" in the platform's name.

### Steps

1. **NCR drafter (S18):** auto-populated from failing batch (batch ref, component, drawing rev, failing param, limits, actual, instrument + its calibration validity, operator — NCR-02); `ƒx` tags on computed fields.
2. **Disposition + CAPA:** three radio cards (Rework / Scrap / Concession with OEM-approval annotation), CAPA fields labeled exactly as the paper NCR (NCR-03).
3. **NCR ↔ batch linkage:** NCR references pinned to the exact reading rows; NCR register view for QH.
4. **Instrument audit recall (EQ-04):** instrument → usage history query, one-click PDF of the trail (S20).
5. **Dashboards:** inspector (drafts/pending/rejected), QH (queue + history), admin (config entry + calibration due-soon strip); history/search screen with filters + CSV/PDF export (S21).
6. **Tests:** NCR auto-population correctness from a failing batch E2E; recall query returns full history (EXPLAIN ANALYZE it — backend doc §9); dashboard hydration < 200 ms p95 check.

### Edge cases

| #    | Edge case                                                                                                                                                                     | Handled by         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 8.1  | Multiple failing readings across multiple rows → one NCR per batch or per reading? Decide: one NCR drafts with all failing rows listed, QH can split later (paper convention) | Draft rule         |
| 8.2  | NCR drafted on a REJECTED batch, then batch gets resubmitted and approved — NCR remains linked and open; disposition flow continues independently                             | Lifecycle rule     |
| 8.3  | Concession disposition selected without OEM approval reference — require an approval reference field before close (NCR-03 annotation)                                         | Form validation    |
| 8.4  | Instrument recall on an instrument used in batches from multiple revisions — history shows revision per row; export includes it                                               | Recall output      |
| 8.5  | Instrument recall query on an instrument with zero usage — empty state with operational copy, not an error                                                                    | Recall UX          |
| 8.6  | CAPA text with long free-form content — PDF-safe wrapping/truncation decided with the client's paper format                                                                   | Print rule         |
| 8.7  | Dashboard for a QH with zero pending reviews — operational empty state ("No batches pending review…", ui-ux §1.2)                                                             | Empty states       |
| 8.8  | History export of a huge filter (all batches ever) — export is streamed/paginated; row cap warning with narrower-filter suggestion                                            | Export path        |
| 8.9  | NCR on a batch whose instrument later expired — the NCR records the instrument's validity **at inspection time** (audit defense data), not current status                     | Snapshot semantics |
| 8.10 | Deleting (retiring) an instrument referenced by an NCR — soft-retire only (edge 1.13); NCR joins survive                                                                      | Referential rule   |

### Definition of done

NCR auto-draft from a failing batch populates every PRD field · instrument audit-recall returns full usage history in one click · verify gate green.

---

## Phase 9 — Audit & Handover

**Goal:** the client's QH runs a mock OEM audit on the platform alone.

### Steps

1. **UAT with real batches:** live dimensional + coating batches end-to-end; findings triaged through the PR (no sideways scope).
2. **Mock OEM audit rehearsal:** QH alone demonstrates every acceptance criterion (PRD §7) live — traceability chain, instrument recall, immutable records, NCR, PDFs.
3. **Training:** role-based sessions (inspector, NACE inspector, QH, admin); keyboard-model training for the grid; offline behavior walkthrough.
4. **Runbook handover:** deployment, backup/restore drill evidence, incident response (security doc §10), environment matrix.
5. **Documentation close-out:** all docs version-bumped to as-built state; findings report closed; this execution plan archived with the delivery record.
6. **Warranty-period monitoring:** error tracking, performance budgets (grid < 100 ms, dashboard < 200 ms p95), calibration digest job health.

### Edge cases

| #   | Edge case                                                                                                                                                     | Handled by         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 9.1 | Client requests scope change during UAT ("can it also…") — routed through PRD v1.3+ change process, never absorbed silently (milestones §5 risk table)        | Change control     |
| 9.2 | QH unavailable for the mock audit (the known schedule risk) — booked at phase start, not end; fallback deputy QH trained                                      | Scheduling risk    |
| 9.3 | Audit reveals a fidelity deviation accepted informally earlier — golden-file re-run, formal sign-off before handover                                          | Fidelity gate      |
| 9.4 | Pilot data migration from the legacy Excel files — one-time import script validated row-by-row against the workbooks; imported batches marked with provenance | Migration path     |
| 9.5 | Handover while a staging-only bug is known/open — recorded in the delivery record with severity and fix window, never hidden                                  | Delivery integrity |

### Definition of done

The client's QH runs the mock OEM audit on the platform alone and every PRD acceptance criterion (§7) is demonstrated live · training delivered · runbooks handed over · delivery record complete.

---

## 10. Cross-Phase Test-Inventory Checkpoints

From `testing-quality-plan.md` §3 — where each "cannot regress" row lands:

| Plan §3 row                             | Tests land in     |
| --------------------------------------- | ----------------- |
| Parser forms + Min ≤ Max property       | ✅ Phase 0 (done) |
| Dew point + monotonic property          | ✅ Phase 0 (done) |
| ΔT gate                                 | ✅ Phase 0 (done) |
| DFT stats + nulls                       | ✅ Phase 0 (done) |
| ISO 19840 + 5-reading minimum           | ✅ Phase 0 (done) |
| Tolerance coloring 10 % band            | ✅ Phase 0 (done) |
| Number-line partition property (F-06)   | Phase 3 step 4    |
| Batch state machine edges               | Phase 1 step 10   |
| GD&T schema/DB parity                   | Phase 1 step 10   |
| Instrument expiry status (15-day amber) | Phase 2 step 9    |
| Shelf-life validation                   | Phase 4 step 7    |
| Batch-code grammar                      | Phase 1 step 10   |

E2E journeys (plan §5): #1 golden path and #2 rejection loop → Phase 3 (completed in Phase 6 when the PDF step becomes real) · #4 keyboard-only and #5 offline survival → Phase 3 · #3 dew-point lock-out → Phase 4 · #6 instrument expiry gate → Phase 3 (selection ack) + Phase 5 (QH flag) · #7 immutability → Phase 5. Print regression → Phase 6. Data-layer suite runs nightly in CI from Phase 1 onward.

---

## 11. Open-Findings Burn-Down (from `findings-phase0.md`)

| Finding                         | Resolved in                                       |
| ------------------------------- | ------------------------------------------------- |
| F-01 accent color               | ✅ Resolved                                       |
| F-02 status tokens              | ✅ Resolved (paper hexes reconciled to plan §4.1) |
| F-03 radii                      | ✅ Resolved                                       |
| F-04 self-hosted fonts          | ✅ Resolved (Phase 2: `public/fonts/` + precache) |
| F-05 env dedup                  | ✅ Resolved (Phase 1)                             |
| F-06 missing property tests     | ✅ Resolved (partition property + RH caveat note) |
| F-07 state-machine/schema tests | Phase 1 step 10                                   |
| F-08 print stub                 | Phase 6 (by design)                               |
| F-09 DB types                   | Phase 1 step 7                                    |

---

## 12. Standing Risks (carried from `delivery-milestones.md` §5)

| Risk                                    | Phase(s) | Mitigation                                                                                        |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Print fidelity on tablet browsers       | 6        | Puppeteer fallback pre-approved (`technology-stack.md` §3.8); iPad print-dialog verification step |
| Shop-floor Wi-Fi worse than assumed     | 7        | Offline-first is already the architecture; pilot surfaces reality early                           |
| Client QH availability for sign-offs    | 6, 9     | Book sign-off sessions at phase start, never at the end                                           |
| Scope pull-forward from premium roadmap | any      | PRD v1.3+ change process only                                                                     |

---

_Living document. Update steps/checkboxes as phases progress; edge cases are never deleted — mark them resolved with the phase and test that pinned them. Any conflict with an authoritative doc resolves upward per `docs/README.md` sync rules._
