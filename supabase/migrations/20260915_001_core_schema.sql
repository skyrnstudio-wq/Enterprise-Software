-- ============================================================================
-- Migration 001 — Core schema (backend-architecture.md §2.1)
-- Simran QC Platform · Phase 1 (execution-plan.md step 2)
--
-- Graph: customers → items → drawing_revisions → (dimension_rows | coating_specs)
--        batches → readings → sign_offs ; batches → coat_logs → dft_readings
--
-- Tables are ordered so every referenced table exists before its referencers
-- (Postgres has no deferred FK creation at DDL time): profiles, customers,
-- items, drawing_revisions, instruments → dimension_rows / coating_specs →
-- batches → readings / coat_logs / dft_readings → sign_offs → audit_log.
-- ============================================================================

-- Profiles (1:1 with auth.users — role lives here, not in JWT claims).
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null,
  role         text not null default 'QC_INSPECTOR'
               check (role in ('ADMIN', 'QC_INSPECTOR', 'NACE_INSPECTOR', 'QUALITY_HEAD')),
  mfa_enforced boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  item_code      text not null unique,
  drawing_number text not null,
  description    text not null,
  customer_id    uuid not null references public.customers (id) on delete restrict,
  created_at     timestamptz not null default now()
);

-- IM-05: revisions are immutable records; rev text (e.g. WY000_9423E).
create table public.drawing_revisions (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  rev         text not null check (rev ~ '^[A-Z0-9_-]+$'),
  released_at date,
  created_at  timestamptz not null default now(),
  unique (item_id, rev)
);

-- Calibration registry (EQ-01). Soft retire only — readings keep FK references
-- (edge case 1.13: never hard-delete an instrument that readings reference).
create table public.instruments (
  id              uuid primary key default gen_random_uuid(),
  instrument_code text not null unique,
  description     text not null,
  make_model      text not null,
  range           text not null,
  last_cal_at     date not null,
  interval_months integer not null check (interval_months between 1 and 120),
  retired_at      date,
  created_at      timestamptz not null default now(),
  next_due_at     date generated always as (last_cal_at + (interval_months || ' months')::interval) stored
);

-- Dimension template rows, ordered per revision (IM-02). Tolerance limits are
-- materialized from the tolerance grammar at insert time (data-dictionary.md);
-- the bracketing CHECK lands in Migration 002 (edge cases 1.1 / 1.2).
create table public.dimension_rows (
  id           uuid primary key default gen_random_uuid(),
  revision_id  uuid not null references public.drawing_revisions (id) on delete cascade,
  serial       integer not null check (serial > 0),
  label        text not null,
  nominal      numeric(12, 4) not null,
  tol_plus     numeric(12, 4) not null,
  tol_minus    numeric(12, 4) not null,
  symbol       text,
  is_reference boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (revision_id, serial)
);

-- Coating spec per revision (IM-04): substrate prep + both DFT systems.
create table public.coating_specs (
  id                     uuid primary key default gen_random_uuid(),
  revision_id            uuid not null references public.drawing_revisions (id) on delete cascade,
  substrate              text not null,
  blast_grade            text not null,
  blast_profile_um_min   numeric(8, 2) not null,
  blast_profile_um_max   numeric(8, 2) not null,
  system_inside          text not null,
  system_outside         text not null,
  dft_nominal_um_inside  numeric(8, 2) not null check (dft_nominal_um_inside > 0),
  dft_nominal_um_outside numeric(8, 2) not null check (dft_nominal_um_outside > 0),
  created_at             timestamptz not null default now(),
  unique (revision_id),
  check (blast_profile_um_min <= blast_profile_um_max)
);

-- One inspection batch. delivery_batch_code grammar ^\d{4}-\d{2}$ (PRD §6) is
-- enforced in Migration 002; statuses per the application-flow.md state machine.
create table public.batches (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references public.items (id) on delete restrict,
  revision_id         uuid not null references public.drawing_revisions (id) on delete restrict,
  created_by          uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  po_number           text not null,
  delivery_batch_code text not null,
  lot_qty             integer not null check (lot_qty > 0),
  inspection_date     date not null,
  status              text not null default 'DRAFT'
                      check (status in ('DRAFT', 'SUBMITTED', 'REJECTED', 'APPROVED')),
  workflow            text not null check (workflow in ('DIMENSIONAL', 'COATING')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 5 samples per dimension row (DIM-03); instrument must be registry-listed.
create table public.readings (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.batches (id) on delete cascade,
  dimension_row_id uuid not null references public.dimension_rows (id) on delete restrict,
  sample_no        integer not null check (sample_no between 1 and 5),
  value_mm         numeric(10, 4) not null,
  instrument_id    uuid not null references public.instruments (id) on delete restrict,
  created_at       timestamptz not null default now(),
  unique (batch_id, dimension_row_id, sample_no)
);

-- Surface prep + psychrometrics + one coat (COAT-01…04). Dew point / ΔT are
-- client-reported for display only; submit_batch recomputes them server-side
-- and never trusts these columns (backend-architecture.md §5.1).
create table public.coat_logs (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.batches (id) on delete cascade,
  coat_no       integer not null check (coat_no between 1 and 99),
  product       text not null,
  ral           text,
  part_a_batch  text not null,
  part_a_mfg    text,
  part_b_batch  text,
  part_b_mfg    text,
  thinner_batch text,
  viscosity_s   numeric(6, 1),
  wft_um        numeric(8, 2),
  ambient_c     numeric(5, 1) not null,
  rh_pct        numeric(5, 1) not null,
  steel_c       numeric(5, 1) not null,
  dew_point_c   numeric(5, 1),
  delta_t_c     numeric(5, 1),
  created_at    timestamptz not null default now(),
  unique (batch_id, coat_no)
);

-- 26-point DFT grid, per side (COAT-05). Missing points are absent rows —
-- never stored as zero (matches dft-stats.ts: empty points are skipped).
create table public.dft_readings (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.batches (id) on delete cascade,
  side       text not null check (side in ('INSIDE', 'OUTSIDE')),
  point_no   integer not null check (point_no between 1 and 26),
  value_um   numeric(8, 2) not null,
  created_at timestamptz not null default now(),
  unique (batch_id, side, point_no)
);

-- Dual sign-off (SO-01…03). Rows inserted only via submit_batch / decide_batch.
create table public.sign_offs (
  id        uuid primary key default gen_random_uuid(),
  batch_id  uuid not null references public.batches (id) on delete cascade,
  role      text not null check (role in ('INSPECTOR', 'QUALITY_HEAD')),
  user_id   uuid not null references public.profiles (id) on delete restrict,
  decision  text not null check (decision in ('SUBMIT', 'APPROVE', 'REJECT')),
  comments  text,
  signed_at timestamptz not null default now(),
  unique (batch_id, role)
);

-- Append-only audit trail (backend-architecture.md §3.2). No UPDATE grant
-- exists at the privilege level (Migration 003); hash-chain hardening is
-- deferred to Phase 8/9.
create table public.audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor     uuid references public.profiles (id) on delete set null,
  entity    text not null,
  entity_id uuid,
  action    text not null,
  payload   jsonb not null default '{}'::jsonb,
  at        timestamptz not null default now()
);

-- §9 Indexing & performance (EXPLAIN ANALYZE before first audit season — §9).
create index idx_readings_batch on public.readings (batch_id);
create index idx_readings_instrument on public.readings (instrument_id);
create index idx_dft_readings_batch_side on public.dft_readings (batch_id, side);
create index idx_coat_logs_batch on public.coat_logs (batch_id);
create index idx_batches_status_creator on public.batches (status, created_by);
create index idx_batches_item_date on public.batches (item_id, inspection_date);
create index idx_dimension_rows_revision on public.dimension_rows (revision_id, serial);
create index idx_sign_offs_batch on public.sign_offs (batch_id);
create index idx_audit_log_entity on public.audit_log (entity, entity_id, at);
