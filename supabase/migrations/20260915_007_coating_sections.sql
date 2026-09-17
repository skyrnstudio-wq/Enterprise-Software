-- ============================================================================
-- Migration 007 — Coating batch sections (Phase 4, execution-plan.md steps 2/6)
-- Simran QC Platform · Phase 4 (Coating Module)
-- Edge cases: 4.12 (visual verdicts are per BATCH — one side of one component,
-- matching the paper form), 4.18 (checklist honesty: `checked` + `present`
-- are separate — an unanswered defect is never implicitly "no defect").
-- The psychrometric + coat-log + DFT data live in coat_logs / dft_readings
-- (migration 001); this adds ONLY the missing Section A / Section E states.
-- ============================================================================

-- ------------------------- Section A — surface prep -------------------------
-- One row per batch (the paper form records prep once, before coat 1).
-- Presets (steel grade, blast method/grade, grit) default to the PRD values
-- so the selects render pre-filled; profile is the live 45–75 µm input
-- (COAT-01/02) whose warn/fail band is evaluated client-side and recomputed
-- for the report — the DB stores the reading, not the verdict.
create table public.batch_coating (
  batch_id                   uuid primary key references public.batches (id) on delete cascade,
  steel_grade                text not null default 'MS Sheet Fabrication',
  -- ISO 8501-3 P-2 weld/edge smoothness, ISO 12944-4 solvent clean,
  -- water break test (beading = fail) — COAT-01.
  weld_edge_ok               boolean not null default false,
  solvent_clean_ok           boolean not null default false,
  water_break_pass           boolean not null default false,
  blast_method               text not null default 'Abrasive Blast Cleaning',
  blast_grade                text not null default 'Sa 2.5',
  grit_size                  text not null default 'G-40',
  -- Comparator-G Medium profile; 45–75 µm working band (COAT-02).
  profile_um                 numeric(5, 1) check (profile_um >= 0 and profile_um <= 2000),
  -- Edge 4.12: the profile gauge is a per-batch instrument assignment
  -- (shown on the DFT panels too), not a per-reading field.
  profile_gauge_instrument_id uuid references public.instruments (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- --------------------- Section E — visual checklist (COAT-07) ---------------
-- Five fixed defect rows per batch. `checked` = the operator answered it;
-- `present` = the answer. A defect that is `checked` + `present` should ride
-- with a Draft NCR (edge 4.18) — the wizard makes that path explicit.
create table public.batch_visual_checks (
  batch_id   uuid not null references public.batches (id) on delete cascade,
  defect     text not null check (defect in ('pinholes', 'sagging', 'gloss_loss', 'peel_off', 'blisters')),
  checked    boolean not null default false,
  present    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (batch_id, defect)
);

-- ------------------------------- RLS (§4) -----------------------------------
-- Identical shape to coat_logs / dft_readings: batch owner (or QH/admin)
-- reads; only the owning inspector on a DRAFT batch writes.
alter table public.batch_coating       enable row level security;
alter table public.batch_visual_checks enable row level security;

create policy batch_coating_select on public.batch_coating
  for select using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id
        and (b.created_by = auth.uid() or public.is_quality_head() or public.auth_role() = 'ADMIN')
    )
  );

create policy batch_coating_write_own_draft on public.batch_coating
  for all using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id and b.created_by = auth.uid() and b.status = 'DRAFT'
    )
  )
  with check (
    exists (
      select 1 from public.batches b
      where b.id = batch_id and b.created_by = auth.uid() and b.status = 'DRAFT'
    )
  );

create policy batch_visual_checks_select on public.batch_visual_checks
  for select using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id
        and (b.created_by = auth.uid() or public.is_quality_head() or public.auth_role() = 'ADMIN')
    )
  );

create policy batch_visual_checks_write_own_draft on public.batch_visual_checks
  for all using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id and b.created_by = auth.uid() and b.status = 'DRAFT'
    )
  )
  with check (
    exists (
      select 1 from public.batches b
      where b.id = batch_id and b.created_by = auth.uid() and b.status = 'DRAFT'
    )
  );
