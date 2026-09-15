# Backend Architecture
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `technology-stack.md` (authoritative stack), `product-requirements.md` (requirements), `application-flow.md` (flows)

---

## 1. Purpose

This document is the implementation contract for the Supabase backend: every table, constraint, trigger, function, and policy required by the PRD. It complements — and must not contradict — `technology-stack.md` §3.7. Where this document is more detailed, this document wins within the backend domain.

---

## 2. Schema Overview

```
customers ──► items ──► drawing_revisions ──┬──► dimension_rows
                                            └──► coating_specs
batches ──► readings ──► sign_offs
batches ──► coat_logs ──► dft_readings
instruments (registry)          audit_log (append-only)
```

Two parallel measurement families hang off a batch:

- **Dimensional workflow** (`ST/QC/02`): `batches → readings` (5 samples per dimension row)
- **Coating workflow** (`ST/QC/04`): `batches → coat_logs` (paint batches, psychrometrics) and `batches → dft_readings` (26 points × inside/outside)

### 2.1 Entity Definitions

| Table | Purpose | Key columns |
|---|---|---|
| `customers` | OEM customers (FLENDER / WINERGY) | `id`, `name` (unique) |
| `items` | Item Master (IM-01) | `id`, `item_code` (unique), `drawing_number`, `description`, `customer_id` |
| `drawing_revisions` | Immutable revision records (IM-05) | `id`, `item_id`, `rev` (e.g. `WY000_9423E`), `released_at` |
| `dimension_rows` | Ordered dimension template (IM-02) | `revision_id`, `serial`, `label`, `nominal`, `tol_plus`, `tol_minus`, `symbol`, `is_reference` |
| `coating_specs` | Per-item coating spec (IM-04) | `revision_id`, `substrate`, `blast_grade`, `blast_profile_um_min/max`, `system_inside`, `system_outside`, `dft_nominal_um_*` |
| `batches` | One inspection batch | `id`, `item_id`, `revision_id`, `po_number`, `delivery_batch_code`, `lot_qty`, `inspection_date`, `status`, `workflow` (`DIMENSIONAL \| COATING`) |
| `readings` | Dimensional sample values (DIM-03) | `batch_id`, `dimension_row_id`, `sample_no` (1–5), `value_mm`, `instrument_id` |
| `coat_logs` | Surface prep + psychrometrics + paint coats (COAT-01…04) | `batch_id`, `coat_no`, `product`, `ral`, `part_a_batch`, `part_a_mfg`, `part_b_batch`, `part_b_mfg`, `thinner_batch`, `viscosity_s`, `wft_um`, `ambient_c`, `rh_pct`, `steel_c`, `dew_point_c`, `delta_t_c` |
| `dft_readings` | 26-point grid (COAT-05) | `batch_id`, `side` (`INSIDE`/`OUTSIDE`), `point_no` (1–26), `value_um` |
| `sign_offs` | Dual sign-off (SO-01…03) | `batch_id`, `role` (`INSPECTOR`/`QUALITY_HEAD`), `user_id`, `signed_at`, `decision`, `comments` |
| `instruments` | Calibration registry (EQ-01) | `id`, `instrument_code` (unique, e.g. `VC-04`), `description`, `make_model`, `range`, `last_cal_at`, `interval_months`, `next_due_at` (generated) |
| `audit_log` | Append-only trail | `id`, `actor`, `entity`, `entity_id`, `action`, `payload jsonb`, `at` |

### 2.2 Constraints That Enforce the PRD

| Constraint | Enforces |
|---|---|
| `dimension_rows`: `min_limit ≤ nominal ≤ max_limit` via CHECK derived at insert | IM-03 invariant |
| `readings`: UNIQUE (`batch_id`, `dimension_row_id`, `sample_no`) | One value per sample cell |
| `dft_readings`: UNIQUE (`batch_id`, `side`, `point_no`) | One reading per grid point |
| `batches.delivery_batch_code`: regex `^\d{4}-\d{2}$` | PRD §6 batch grammar (e.g. `2604-02`) |
| `sign_offs`: UNIQUE (`batch_id`, `role`) | One sign-off per role |
| `batches.status`: enum `DRAFT, SUBMITTED, REJECTED, APPROVED` | State machine (`application-flow.md`) |

---

## 3. Database Triggers

### 3.1 Approved-Batch Immutability (SO-04)

```sql
CREATE OR REPLACE FUNCTION forbid_approved_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM batches b
             WHERE b.id = COALESCE(NEW.batch_id, OLD.batch_id)
               AND b.status = 'APPROVED') THEN
    RAISE EXCEPTION 'Batch % is APPROVED and immutable (PRD SO-04)', COALESCE(NEW.batch_id, OLD.batch_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER readings_immutable      BEFORE UPDATE OR DELETE ON readings     FOR EACH ROW EXECUTE FUNCTION forbid_approved_mutation();
CREATE TRIGGER dft_readings_immutable  BEFORE UPDATE OR DELETE ON dft_readings FOR EACH ROW EXECUTE FUNCTION forbid_approved_mutation();
CREATE TRIGGER coat_logs_immutable     BEFORE UPDATE OR DELETE ON coat_logs    FOR EACH ROW EXECUTE FUNCTION forbid_approved_mutation();
CREATE TRIGGER batches_immutable       BEFORE UPDATE ON batches                FOR EACH ROW
  EXECUTE FUNCTION forbid_approved_mutation();
-- The batches trigger additionally rejects any status change FROM 'APPROVED'.
```

No UI layer can bypass this. Admins included.

### 3.2 Audit Trail

Every state transition on `batches` (submit / approve / reject) and every sign-off inserts one append-only `audit_log` row via trigger. **No `UPDATE` grant exists on `audit_log` for any role** — the table is write-once at the privilege level, not by convention.

---

## 4. Row-Level Security (RLS)

RLS is **enabled on every table**; the anon key can do nothing until authenticated, and policies are role-scoped.

### 4.1 Role Model

Roles live in `public.profiles` (1:1 with `auth.users`): `role IN ('ADMIN', 'QC_INSPECTOR', 'NACE_INSPECTOR', 'QUALITY_HEAD')`.

### 4.2 Policy Matrix (summary)

| Table | QC/NACE Inspector | Quality Head | Admin |
|---|---|---|---|
| `items`, `drawing_revisions`, `dimension_rows`, `coating_specs` | read | read | all |
| `batches` (DRAFT) | own drafts only (`created_by = auth.uid()`) | read all | all |
| `batches` (SUBMITTED+) | read own | read all, `UPDATE` status | read |
| `readings` / `dft_readings` / `coat_logs` | insert/update own DRAFT batch | read | none (immutability) |
| `sign_offs` | **no insert** (SO-01: only their submission row via RPC) | insert via RPC only | **no insert** |
| `instruments` | read | read | all |
| `audit_log` | read | read | read |

The critical guarantee: **an Inspector literally cannot read another inspector's draft** and **cannot write a `sign_offs` row** — enforced by the database, not by hiding buttons (`technology-stack.md` §3.7).

---

## 5. Remote Procedure Calls (RPCs)

### 5.1 `submit_batch(batch_id uuid)` — Atomic Submission

Wraps the entire submission in **one transaction** (`technology-stack.md` §3.7):

1. Verify caller owns the batch and it is `DRAFT`/`REJECTED`.
2. Recompute defense-in-depth: dew point (Magnus-Tetens), ΔT margin, ISO 19840 stats, Min/Max evaluations. **Client-claimed statistics are never trusted** — the client's figures are stored only in `audit_log.payload` for forensic diffing.
3. If ΔT < 3.0 °C on any coat log → raise, blocking submission (COAT-03 gate).
4. Insert the inspector `sign_offs` row with `auth.uid()` and `now()`.
5. Transition status → `SUBMITTED`; write `audit_log`.

### 5.2 `decide_batch(batch_id uuid, decision text, comments text)` — QH Decision

- `decision = 'APPROVE'`: validates QH role, records sign-off, transitions to `APPROVED`. Immutable thereafter.
- `decision = 'REJECT'`: **requires non-empty `comments`** (SO-03), transitions to `DRAFT`.
- Emits Realtime events on both paths (§6).

### 5.3 `upsert_batch_draft(...)` — Offline Sync Target

Idempotent draft upsert used by the offline sync queue (`offline-sync-architecture.md`). Server wins for `SUBMITTED+`, local wins for `DRAFT` — resolved here in one place.

---

## 6. Realtime

- Channel `batch:{id}` — per-batch status changes.
- Channel `role:QUALITY_HEAD` — QH dashboards receive `submit_batch` notifications instantly.
- Channel `user:{id}` — inspectors receive approval/rejection without refresh.

Realtime broadcasts are fired from the RPCs above (via `pg_notify` → Supabase Realtime), never from the client.

---

## 7. Migrations & Type Generation

- All schema changes are committed SQL files in `supabase/migrations/`, applied with `supabase db push`. No dashboard-only changes, ever.
- After every migration: `npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/database.types.ts`. A schema change becomes a **compile error** in the frontend (`technology-stack.md` §3.1).
- Staging project receives migrations first; production pushes are manual, reviewed, and PITR-backed.

---

## 8. Scheduled Functions

| Job | Schedule | Requirement |
|---|---|---|
| Calibration due digest | daily 06:00 IST | EQ-02: Due-Soon (15-day window) and Expired alerts to Admin + QH |
| Shelf-life sweep | daily | COAT-04 support: flag paint products past shelf life in open drafts |

---

## 9. Indexing & Performance

- `readings(batch_id)`, `dft_readings(batch_id, side)`, `batches(status, created_by)`, `batches(item_id, inspection_date)`.
- Instrument audit-recall query (EQ-04) is covered by `readings(instrument_id)` and `coat_logs(batch_id)` join paths; verify with `EXPLAIN ANALYZE` before the first audit season.
- Target: dashboard and grid-hydration queries < 200 ms p95 on staging data volumes (53 rows × 5 samples ≈ 265 reading rows per batch).

---

## 10. Backups & Retention

- Production: PITR enabled; audit data retention measured in **years** (OEM surveillance audits).
- Quarterly restore drill: restore staging from a production backup and verify an `audit_log` hash chain sample.

---

*Changes to this document require a version bump and cross-check against `technology-stack.md` §3.7.*
