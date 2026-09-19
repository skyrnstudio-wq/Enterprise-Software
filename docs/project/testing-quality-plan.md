# Testing & Quality Plan
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `technology-stack.md` §3.9 (tooling), `product-requirements.md` (acceptance criteria), `report-export-spec.md` §6 (fidelity regression)

---

## 1. Quality Philosophy

This platform replaces an audited manual QMS process. A wrong dew point once caused a documented ISO 12944 non-conformance (`product-requirements.md` §6); a broken formula once made Nominal 10 evaluate to Min 1 / Max 3 (`workbook-audit-analysis.md`). The test suite exists to make those specific failure classes **impossible to reintroduce**.

Every domain rule named in the PRD has at least one test that fails loudly if the rule regresses. Coverage percentage is a side effect, not the goal — but the *critical path* coverage is non-negotiable.

---

## 2. Test Pyramid

| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Unit | Vitest | Pure domain functions | ms |
| Property | Vitest + fast-check | Invariants over generated inputs | ms |
| Component | Vitest + Testing Library | Grid cells, forms, status chips | 10s of ms |
| E2E | Playwright | Full journeys, desktop + tablet profile | s |
| Print regression | Playwright (print emulation) + visual diff | Report layouts | s |
| Data layer | Vitest against staging Supabase | RLS policies, triggers, RPCs | s |

---

## 3. Domain Test Inventory (the "cannot regress" list)

| Domain rule | Tests (live in Phase 0 where marked ✓) |
|---|---|
| Parser handles `(2065)`, `Ø12`, `100°`, `±0.5`, `+0.2/-0.1` | ✓ unit + fast-check (never Min > Max) |
| Dew point via Magnus-Tetens; RH bounds | ✓ unit + monotonic-in-RH property |
| ΔT < 3.0 °C ⇒ PROHIBITED verdict | ✓ unit (ISO 12944-7 gate) |
| DFT stats (min/max/mean/σ), nulls skipped | ✓ unit |
| ISO 19840 80/200 rule + 5-reading minimum | ✓ unit |
| Tolerance coloring (pass/warn/fail, 10 % band) | ✓ unit |
| Batch state machine transitions | unit: all legal + illegal edges incl. APPROVED immutability |
| GD&T Min/Max derivation bound to `Min ≤ Nom ≤ Max` | schema test (Zod + DB constraint parity) |
| Instrument expiry status (Active/Due-Soon/Expired) | unit: 15-day amber boundary, exact-date edges |
| Shelf-life validation | unit: mfg date + interval window |
| Delivery batch code grammar `^\d{4}-\d{2}$` | schema test |

**Property-test invariants (fast-check):** parser never yields Min > Max; dew point strictly increases with RH at fixed T; 80/200 verdict matches spec examples; `evaluateTolerance` partitions the number line with no gaps/overlaps.

---

## 4. Component & Interaction Tests

- **Grid keyboard model (DIM-03):** Tab moves horizontally, Enter vertically; focus is never lost; assert on a 100-row virtualized grid.
- **Real-time color highlighting (DIM-04):** typing an out-of-limit value flips exactly that cell's chip; sibling cells do not re-render (assert via render counts — protects the sub-100 ms NFR).
- **Copy to all 5 / Fill Nominal (DIM-05):** shortcut semantics.
- **Dew-point lock-out UI (COAT-03):** entering steel temp within 3 °C of computed dew point disables coating sign-off; message text matches PRD wording.
- **Form validation:** Zod error messages surface verbatim; no silent coercion.

## 5. E2E Journeys (Playwright)

1. **Inspector → QH → PDF (golden path):** admin seeds item → inspector fills dimensional batch → submits → QH approves → export prints `ST/QC/02`.
2. **Rejection loop:** submit → QH rejects with comments → batch returns to DRAFT → revise → resubmit → approve.
3. **Coating lock-out:** enter psychrometrics violating ΔT ≥ 3 °C → submission blocked → fix conditions → submit succeeds.
4. **Keyboard-only grid:** complete a batch with zero mouse events.
5. **Offline survival:** fill grid offline, reload, go online, assert drain (`offline-sync-architecture.md` §8).
6. **Instrument expiry gate:** expired gauge selected → mandatory acknowledgement → QH sees flag.
7. **Immutability:** approved batch exposes no edit affordance; direct API mutation attempt fails (defense-in-depth proof).

### 5.1 Runnable path (implemented)

The suite lives in `e2e/` and runs with `npm run test:e2e` against
`E2E_BASE_URL` (default `http://localhost:5173`). Two layers:

| Spec | Coverage | Needs DB? |
|---|---|---|
| `smoke.spec.ts` | app boot + auth guard routes to `/login` · the `/signup` gate explains the admin-provisioned access model | no |
| `print.spec.ts` | ST/QC/02 + ST/QC/04 print layout baselines · **printed-artifact pagination + `@page` running footer** | no |
| `journeys.spec.ts` | J1 autosave-survives-reload · J2 QH queue + decision bar **and the author's read-only view (separation of duties)** · J3 approved report · J4 offline entry persists | yes (seeded) |

The journey layer is **credential-gated**: it skips unless the demo account
env vars are exported (see `README.md` → End-to-end journeys), so a bare
checkout keeps `npm run test:e2e` green. Full manual walkthrough runs against
the hosted project (the local Docker stack was removed — hosted is the single
backend), then:

```bash
export E2E_INSPECTOR_EMAIL=inspector1@simran.local E2E_INSPECTOR_PASSWORD='Simran#2026'
export E2E_QH_EMAIL=qh@simran.local          E2E_QH_PASSWORD='Simran#2026'
export E2E_QH_TOTP_SECRET=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
npm run test:e2e
```

Journeys 1, 2, 3, 6, 7 of the list above are additionally proven at the
component/domain layer. The QH **approval** (2/7) is now fully automated:
`supabase/seed.sql` plants a **verified TOTP factor** (fixed, public test
secret) on the demo Quality Head, so J2 signs in through the real
challenge → verify → AAL2 flow, builds and submits a fresh batch as the
inspector, then approves it through the TOTP-gated decision modal — the batch
lands APPROVED **by the test**, not by fixture. The separation-of-duties rule
is pinned in the same suite: the real author is driven into the same record to
prove the read-only view and that **no decision control is offered to the
author**.

The seeded fixtures (`supabase/seed.sql`) are idempotent — re-applied with
the Supabase MCP onto the hosted project: **B1** is SUBMITTED (review queue)
and **B2** APPROVED (dashboard report link), both authored by the seeded QC
Inspector and carrying a warn row and a fail row so the review flag column is
not trivial.

**Printed-artifact assertions.** Pagination and the `@page` running footer live
outside the DOM, so `print.spec.ts` prints the fixture headlessly
(`page.pdf`) and reads the result back with `e2e/pdf-text.ts` — a dependency-free
PDF text extractor (inflate the content streams, decode them through each
font's `/ToUnicode` CMap). It asserts **both controlled formats appear in the
stream, the document is genuinely paginated, and every page carries
`Page n of m` with `m` equal to the true page count** (D37). The screenshot
baselines (`*-snapshots/`) are rendering- and platform-specific: generate them
once on the target runner and commit them, or the baseline tests fail by design.

Profiles: desktop Chrome + iPad (shop-floor tablet) — configured in `playwright.config.ts`.

## 6. Data-Layer Tests (staging Supabase)

- **RLS matrix:** for each role × table × operation in `backend-architecture.md` §4 — assert allow/deny. A policy change without a matching test change fails review.
- **Triggers:** mutation of `APPROVED` batch raises; `audit_log` has no UPDATE grant.
- **RPC recomputation:** submit with deliberately wrong client-claimed stats → server values stored, client values only in audit payload.
- These run in CI nightly and before release, against staging with seeded fixtures.

## 7. Performance Verification

| NFR | Method |
|---|---|
| Sub-100 ms keystroke response (100-row grid) | Component test with render-count assertions + manual profiler capture on staging tablet hardware; re-check per release |
| Dashboard hydration < 200 ms p95 | Query timing logged in staging; `EXPLAIN ANALYZE` for new queries |
| Cold start offline | Playwright with SW active, airplane-mode profile |

## 8. CI Gate & Definition of Done

`npm run verify` = `tsc --noEmit` + ESLint (0 warnings) + Vitest. This gate runs on every PR — no exceptions, no "temporary" skips. The E2E + data-layer suites run on staging deployments.

A feature is **done** when: domain rules tested · journeys E2E-covered · RLS tested · docs touched (`docs/README.md` sync rules) · acceptance criterion it serves demonstrably passes.

## 9. Fixtures & Test Data

- Fixtures are **generated from the Zod schemas** (`technology-stack.md` §3.3) — one source of truth; stale fixtures are a compile error away.
- Seed set mirrors the audited workbooks: the Spiral Air Duct Cap item (`A5E46224446 / WY000_9423E`, `W1G00005572`, FLENDER), its ~53 dimensions, and the C3/C4 coating spec with nominal 240/180 µm DFT — so tests read like the client's real work.

---

*New PRD requirement ⇒ new row in §3 before implementation starts. Test-first is the default; exceptions need a written note in the PR.*
