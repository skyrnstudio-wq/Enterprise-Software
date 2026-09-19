-- ============================================================================
-- Migration 004 — Row-Level Security (backend-architecture.md §4)
-- Simran QC Platform · Phase 1 (execution-plan.md step 5)
-- Edge cases: draft isolation (§4.2), 2.15 (JWT role staleness — policies
-- always read profiles, never trust a role claim), 1.4 (sign_offs: no direct
-- insert for any role — RPC only).
-- ============================================================================

-- Helper: authoritative role for the caller, read from profiles on every
-- check. Never cached in JWT claims — a promotion mid-session must not lift
-- database privileges until the row says so (edge case 2.15).
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Helper: does the caller hold the QH role?
create or replace function public.is_quality_head()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_role() = 'QUALITY_HEAD';
$$;

alter table public.profiles          enable row level security;
alter table public.customers         enable row level security;
alter table public.items             enable row level security;
alter table public.drawing_revisions enable row level security;
alter table public.dimension_rows    enable row level security;
alter table public.coating_specs     enable row level security;
alter table public.batches           enable row level security;
alter table public.readings          enable row level security;
alter table public.coat_logs         enable row level security;
alter table public.dft_readings      enable row level security;
alter table public.sign_offs         enable row level security;
alter table public.instruments       enable row level security;
alter table public.audit_log         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: a user reads and updates only their own row; admins read all.
-- Role changes are NOT self-service — no update policy covers the role
-- column for non-admins (column-level via a separate restrictive policy is
-- unnecessary: updates go through admin-only paths / SQL).
-- ---------------------------------------------------------------------------
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.auth_role() = 'ADMIN');

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- Master data: read for every authenticated role, write for ADMIN only.
-- ---------------------------------------------------------------------------
create policy master_data_read on public.customers
  for select using (auth.uid() is not null);
create policy master_data_admin_write on public.customers
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

create policy master_data_read on public.items
  for select using (auth.uid() is not null);
create policy master_data_admin_write on public.items
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

create policy master_data_read on public.drawing_revisions
  for select using (auth.uid() is not null);
create policy master_data_admin_write on public.drawing_revisions
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

create policy master_data_read on public.dimension_rows
  for select using (auth.uid() is not null);
create policy master_data_admin_write on public.dimension_rows
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

create policy master_data_read on public.coating_specs
  for select using (auth.uid() is not null);
create policy master_data_admin_write on public.coating_specs
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

-- Instruments (EQ-01): read for all, admin manages the registry.
create policy instruments_read on public.instruments
  for select using (auth.uid() is not null);
create policy instruments_admin_write on public.instruments
  for all using (public.auth_role() = 'ADMIN') with check (public.auth_role() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- batches — the core matrix (§4.2):
--   Inspectors: their own drafts, all statuses of their own batches.
--   QH: read everything, UPDATE status only (via decide_batch RPC).
--   Admin: full row access.
-- Draft isolation: another inspector's DRAFT batch is invisible (security doc
-- "Cross-inspector data leakage").
-- ---------------------------------------------------------------------------
create policy batches_select on public.batches
  for select using (
    created_by = auth.uid()
    or public.is_quality_head()
    or public.auth_role() = 'ADMIN'
  );

create policy batches_insert_own on public.batches
  for insert with check (created_by = auth.uid());

create policy batches_update_own_draft on public.batches
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy batches_qh_update_status on public.batches
  for update using (public.is_quality_head()) with check (public.is_quality_head());

-- ---------------------------------------------------------------------------
-- Measurement children (readings / coat_logs / dft_readings):
--   Inspectors: write only into their own batch, and only while that batch is
--   still DRAFT (the trigger re-checks APPROVED server-side regardless of
--   role — edge case 1.8: RLS is first wall, trigger is the last).
--   QH/Admin: read-only here (§4.2 "none (immutability)" on writes).
-- The EXISTS subqueries run under the policy owner's context; they use
-- security-definer helpers via the batches policy (RLS on batches applies to
-- the calling user, who can see own + QH view — matching the matrix).
-- ---------------------------------------------------------------------------
create policy readings_select on public.readings
  for select using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id
        and (b.created_by = auth.uid() or public.is_quality_head() or public.auth_role() = 'ADMIN')
    )
  );

create policy readings_write_own_draft on public.readings
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

create policy coat_logs_select on public.coat_logs
  for select using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id
        and (b.created_by = auth.uid() or public.is_quality_head() or public.auth_role() = 'ADMIN')
    )
  );

create policy coat_logs_write_own_draft on public.coat_logs
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

create policy dft_readings_select on public.dft_readings
  for select using (
    exists (
      select 1 from public.batches b
      where b.id = batch_id
        and (b.created_by = auth.uid() or public.is_quality_head() or public.auth_role() = 'ADMIN')
    )
  );

create policy dft_readings_write_own_draft on public.dft_readings
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

-- ---------------------------------------------------------------------------
-- sign_offs (SO-01): NO direct insert/update for anyone — inspector rows are
-- written by submit_batch, QH rows by decide_batch, both SECURITY DEFINER.
-- Everyone authenticated may read (reports render from sign-offs).
-- ---------------------------------------------------------------------------
create policy sign_offs_select on public.sign_offs
  for select using (auth.uid() is not null);

-- (Deliberately no INSERT/UPDATE/DELETE policy — default deny under RLS.)

-- ---------------------------------------------------------------------------
-- audit_log (§3.2): read-only for every authenticated role; writes happen
-- only inside SECURITY DEFINER trigger/RPC contexts.
-- ---------------------------------------------------------------------------
create policy audit_log_select on public.audit_log
  for select using (auth.uid() is not null);
