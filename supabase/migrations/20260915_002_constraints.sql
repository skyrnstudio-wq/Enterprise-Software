-- ============================================================================
-- Migration 002 — Constraints (backend-architecture.md §2.2)
-- Simran QC Platform · Phase 1 (execution-plan.md step 3)
-- Edge cases: 1.1 (zero-band tolerance OK), 1.2 (magnitudes ≥ 0; no negative
-- input), 1.12 (grammar is the contract — no semantic month check).
-- ============================================================================

-- IM-03 invariant (§2.2, literal form): min_limit ≤ nominal ≤ max_limit where
-- min_limit = nominal - tol_minus, max_limit = nominal + tol_plus.
-- Equality is ACCEPTED (edge case 1.1: zero-band GO/NO-GO rows are legal).
-- Given the non-negative magnitude CHECK below this is implied, but it is
-- written out as the contract so a future signed-tolerance change trips it.
alter table public.dimension_rows
  add constraint dimension_rows_limits_bracket_nominal
  check (nominal - tol_minus <= nominal and nominal <= nominal + tol_plus);

-- tol_plus/tol_minus are magnitudes: ≥ 0 (edge case 1.2).
alter table public.dimension_rows
  add constraint dimension_rows_tol_magnitudes_nonneg
  check (tol_plus >= 0 and tol_minus >= 0);

-- Delivery batch code grammar — PRD §6 (e.g. 2604-02). Semantic oddities such
-- as 0000-00 or 9912-99 stay legal: grammar is the contract (edge case 1.12).
alter table public.batches
  add constraint batches_delivery_code_grammar
  check (delivery_batch_code ~ '^\d{4}-\d{2}$');
