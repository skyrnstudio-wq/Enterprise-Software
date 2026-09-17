-- ============================================================================
-- Migration 003 — Triggers & privileges (backend-architecture.md §3)
-- Simran QC Platform · Phase 1 (execution-plan.md step 4)
-- Edge cases: 1.8 (guard is table-level — fires even for service role),
-- 1.9 (illegal transitions rejected), 1.14 (revision lock after first submit).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Approved-batch immutability (SO-04)
-- Fires BEFORE UPDATE/DELETE per row: statement-level short-circuiting does
-- not apply to BEFORE row triggers, and table-level triggers fire regardless
-- of role — including service role and the SQL console (edge case 1.8).
-- ---------------------------------------------------------------------------

create or replace function public.forbid_approved_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.batches b
    where b.id = coalesce(new.batch_id, old.batch_id)
      and b.status = 'APPROVED'
  ) then
    raise exception 'Batch % is APPROVED and immutable (PRD SO-04)',
      coalesce(new.batch_id, old.batch_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger readings_immutable
  before update or delete on public.readings
  for each row execute function public.forbid_approved_mutation();

create trigger dft_readings_immutable
  before update or delete on public.dft_readings
  for each row execute function public.forbid_approved_mutation();

create trigger coat_logs_immutable
  before update or delete on public.coat_logs
  for each row execute function public.forbid_approved_mutation();


returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SO-04: no mutation of an APPROVED batch, not even status changes.
  if old.status = 'APPROVED' then
    raise exception 'Batch % is APPROVED and immutable (PRD SO-04)', old.id;
  end if;

  -- §4.2: while the batch sits in QH review (SUBMITTED) the header is frozen
  -- — only the status (and updated_at) may change. A REJECTED batch is back
  -- in the inspector's court: measurements and header are editable again,
  -- but the revision stays locked below (IM-05) — rework never re-targets
  -- the batch onto a different drawing revision.
  if old.status = 'SUBMITTED' then
    if new.item_id is distinct from old.item_id
      or new.revision_id is distinct from old.revision_id
      or new.created_by is distinct from old.created_by
      or new.po_number is distinct from old.po_number
      or new.delivery_batch_code is distinct from old.delivery_batch_code
      or new.lot_qty is distinct from old.lot_qty
      or new.inspection_date is distinct from old.inspection_date
      or new.workflow is distinct from old.workflow then
      raise exception 'Batch header is frozen after submission (backend-architecture.md §4.2)';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'DRAFT'     and new.status = 'SUBMITTED') or
      (old.status = 'SUBMITTED' and new.status = 'DRAFT')     or
      (old.status = 'SUBMITTED' and new.status = 'APPROVED')  or
      (old.status = 'REJECTED'  and new.status = 'DRAFT')
    ) then
      raise exception 'Illegal batch transition % -> % (application-flow.md state machine)',
        old.status, new.status;
    end if;
    -- IM-05 / edge 1.14: once the batch has left DRAFT for the first time
    -- (old.status <> 'DRAFT' on a status change), the revision is locked for
    -- the remainder of the batch's life — a revision change requires a new
    -- batch. The header-freeze check above already blocks SUBMITTED.
    if old.status <> 'DRAFT' and new.revision_id is distinct from old.revision_id then
      raise exception 'revision_id is locked after first submit (IM-05)';
    end if;
  end if;

  return new;
end;
$$;

-- Batches trigger: immutability guard + state machine + IM-05 revision lock.
create trigger batches_immutable
  before update on public.batches
  for each row execute function public.guard_batches_mutation();

-- ---------------------------------------------------------------------------
-- 3.2 Audit trail: one append-only audit_log row per batch state transition
-- and per sign-off insert. Written by trigger, never by client code.
-- ---------------------------------------------------------------------------

create or replace function public.write_batch_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_log (actor, entity, entity_id, action, payload)
    values (
      auth.uid(),
      'batches',
      new.id,
      new.status,
      jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'delivery_batch_code', old.delivery_batch_code
      )
    );
  end if;
  return new;
end;
$$;

create trigger batches_audit
  after update on public.batches
  for each row execute function public.write_batch_audit();

create or replace function public.write_sign_off_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, entity, entity_id, action, payload)
  values (
    new.user_id,
    'sign_offs',
    new.batch_id,
    new.decision,
    jsonb_build_object('role', new.role, 'comments', new.comments)
  );
  return new;
end;
$$;

create trigger sign_offs_audit
  after insert on public.sign_offs
  for each row execute function public.write_sign_off_audit();

-- ---------------------------------------------------------------------------
-- Append-only at the privilege level: revoke UPDATE (and DELETE for safety)
-- on audit_log from every role. Triggers are SECURITY DEFINER owned by
-- postgres and keep their insert path.
-- ---------------------------------------------------------------------------
revoke update, delete on public.audit_log from anon, authenticated, service_role;
grant insert (actor, entity, entity_id, action, payload) on public.audit_log to service_role;
