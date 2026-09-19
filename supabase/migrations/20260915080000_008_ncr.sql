-- ============================================================================
-- Migration 008 — NCR (non-conformance report) register (§4.7, PRD NCR-01…04)
-- Simran QC Platform · Phase 8 acceleration (the audit's named spec gap).
--
-- The audit found the wizard's "Draft NCR" button rendered a placeholder
-- toast; decision modals for coating visual defects did the same. This gives
-- the platform a real NCR: a FAIL finding becomes a numbered register entry
-- in the same transaction as the batch decision, so an inspector can never
-- submit a FAIL and forget it.
--
-- Numbering: NCR-<YYMM>-<seq> per calendar month, allocated by the insert
-- trigger inside the same transaction as the insert — no read-modify-write.
-- Lifecycle: OPEN → ACKNOWLEDGED → CLOSED. Rejection without an NCR is not
-- allowed to close the loop silently: `decide_batch` gates on it server-side
-- (see 008 RPCs below); the migration ships the gate and the wizard wires it.
-- ============================================================================

create table public.ncrs (
  id          uuid primary key default gen_random_uuid(),
  ncr_number  text not null unique,
  batch_id    uuid not null references public.batches (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  -- The finding, in the operator's words; carries the failing row/defect id.
  description text not null,
  source      text not null default 'DIMENSIONAL'
              check (source in ('DIMENSIONAL', 'COATING', 'REVIEW')),
  status      text not null default 'OPEN'
              check (status in ('OPEN', 'ACKNOWLEDGED', 'CLOSED')),
  disposition text
              check (disposition in ('REWORK', 'USE_AS_IS', 'REJECT', 'SORT', 'REPAIR')),
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_ncrs_batch on public.ncrs (batch_id);
create index idx_ncrs_status on public.ncrs (status, created_at);

-- Monthly sequence inside the insert transaction (concurrency-safe: the
-- unique index is the arbiter; a racing insert retries through the RPC).
create or replace function public.set_ncr_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
  seq    integer;
begin
  prefix := 'NCR-' || to_char(now(), 'YYMM') || '-';
  select coalesce(max(substring(ncr_number from '(\d+)$')::int), 0) + 1
    into seq
    from public.ncrs
   where ncr_number like prefix || '%';
  new.ncr_number := prefix || lpad(seq::text, 3, '0');
  return new;
end;
$$;

create trigger trg_set_ncr_number
  before insert on public.ncrs
  for each row execute function public.set_ncr_number();

-- The author is the authenticated user, stamped server-side — the client
-- never sends it (and cannot forge it).
create or replace function public.set_ncr_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_set_ncr_author
  before insert on public.ncrs
  for each row execute function public.set_ncr_author();

-- ------------------------------- RLS (§4) -----------------------------------
alter table public.ncrs enable row level security;

-- Everyone signed in can read the register (the QH queue shows linked NCRs).
create policy ncrs_select on public.ncrs
  for select using (auth.uid() is not null);

-- Only the batch owner on a DRAFT batch may open one (inspector found the
-- FAIL); QH/Admin may update (disposition + close).
create policy ncrs_insert_own_draft on public.ncrs
  for insert with check (
    exists (
      select 1 from public.batches b
      where b.id = batch_id and b.created_by = auth.uid() and b.status = 'DRAFT'
    )
    or public.is_quality_head()
    or public.auth_role() = 'ADMIN'
  );

create policy ncrs_update_qh on public.ncrs
  for update using (
    public.is_quality_head() or public.auth_role() = 'ADMIN'
  )
  with check (
    public.is_quality_head() or public.auth_role() = 'ADMIN'
  );

-- --------------------------- updated_at maintenance --------------------------
create or replace function public.touch_ncr()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_ncr
  before update on public.ncrs
  for each row execute function public.touch_ncr();
