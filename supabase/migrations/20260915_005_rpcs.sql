-- ============================================================================
-- Migration 005 — RPCs (backend-architecture.md §5)
-- Simran QC Platform · Phase 1 (execution-plan.md step 6)
-- Edge cases: 1.3 (on-limit passes — strict breach fails), 1.4 (no self-
-- approval), 1.5 (reject requires comments), 1.7 (idempotent submit), 1.10 /
-- 1.11 (server math mirrors dew-point.ts / dft-stats.ts exactly), 1.15 (all
-- timestamps are DB now()).
-- Error contract (api-integration-conventions.md §5): message class prefix
--   BT_LOCK / BT_STATE / BT_VALID / BT_AUTH
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 submit_batch(batch_id, client_stats) — atomic submission
-- One transaction: recompute (defense-in-depth) → ΔT gate → sign-off →
-- transition → audit (via trigger). Client-claimed statistics are never
-- trusted; they land in audit_log.payload for forensic diffing.
-- REJECTED batches resubmit by transitioning REJECTED → DRAFT → SUBMITTED
-- inside this call (both legal edges of the state machine, audited each).
-- ---------------------------------------------------------------------------

create or replace function public.submit_batch(
  p_batch_id uuid,
  p_client_stats jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch     public.batches%rowtype;
  v_rec       record;
  v_td        double precision;
  v_delta_t   double precision;
  v_stats     jsonb := '{}'::jsonb;
  v_dim_stats jsonb := '[]'::jsonb;
begin
  -- Ownership + state (edge 1.4 separation of duties begins here: the
  -- submitter is always the batch owner by construction of this check).
  select * into v_batch
  from public.batches b
  where b.id = p_batch_id and b.created_by = auth.uid();

  if not found then
    raise exception 'BT_AUTH: batch not found or not owned by caller';
  end if;

  if v_batch.status not in ('DRAFT', 'REJECTED') then
    raise exception 'BT_STATE: batch is %, expected DRAFT or REJECTED (edge 1.7: double-submit blocked)',
      v_batch.status;
  end if;

  -- Revise edge first, so the SUBMITTED transition always starts from DRAFT.
  if v_batch.status = 'REJECTED' then
    update public.batches set status = 'DRAFT', updated_at = now()
    where id = p_batch_id;
  end if;

  -- ---------------- Defense-in-depth recomputation (§5.1 step 2) ----------

  -- Psychrometrics per coat log: Magnus-Tetens with the exact constants of
  -- src/domain/dew-point.ts (A=17.62, B=243.12). RH ≤ 0 or > 100 → invalid
  -- (same null semantics as dewPoint()). Lock-out gate mirrors
  -- src/domain/coating.ts evaluatePsychroGate(): ΔT < 3.0 °C OR RH > 85 %
  -- blocks submission; ΔT = 3.0 and RH = 85 pass (strict inequalities —
  -- edges 1.3 / 4.1 / 4.4, COAT-03 + application-flow.md §4.3).
  if v_batch.workflow = 'COATING' then
    for v_rec in
      select cl.id, cl.ambient_c, cl.rh_pct, cl.steel_c
      from public.coat_logs cl
      where cl.batch_id = p_batch_id
    loop
      if v_rec.rh_pct <= 0 or v_rec.rh_pct > 100
         or v_rec.ambient_c < -45 or v_rec.ambient_c > 60
         or v_rec.steel_c < -45 or v_rec.steel_c > 60 then
        raise exception 'BT_VALID: psychrometric inputs out of physical range on coat log % (edge 1.10)',
          v_rec.id;
      end if;

      v_td := 243.12 * ln((v_rec.rh_pct / 100.0) * exp(17.62 * v_rec.ambient_c / (243.12 + v_rec.ambient_c)))
              / (17.62 - ln((v_rec.rh_pct / 100.0) * exp(17.62 * v_rec.ambient_c / (243.12 + v_rec.ambient_c))));
      v_delta_t := v_rec.steel_c - v_td;

      -- Persist server-computed figures for the report (client values are
      -- display-only; §2.1 coat_logs comment).
      update public.coat_logs
      set dew_point_c = round(v_td::numeric, 1),
          delta_t_c   = round(v_delta_t::numeric, 1)
      where id = v_rec.id;

      v_stats := v_stats || jsonb_build_object(
        'coat_log', v_rec.id, 'dew_point_c', round(v_td::numeric, 2), 'delta_t_c', round(v_delta_t::numeric, 2)
      );

      if v_delta_t < 3.0 then
        raise exception 'BT_LOCK: ΔT %.1 °C < 3.0 °C on coat log % — application prohibited (COAT-03 / ISO 12944-7)',
          v_delta_t, v_rec.id;
      end if;

      -- Edge 4.4: the %RH ceiling is part of the same lock-out gate.
      if v_rec.rh_pct > 85.0 then
        raise exception 'BT_LOCK: RH %.1 %% > 85 %% on coat log % — application prohibited (edge 4.4)',
          v_rec.rh_pct, v_rec.id;
      end if;
    end loop;
  end if;

  -- Dimensional Min/Max re-evaluation per reading (recorded, not gating —
  -- out-of-tolerance readings are the record; NCR flow handles them).
  -- On-limit semantics (edge 1.3): strict breach ⇒ fail ⇒ value == limit passes,
  -- mirroring evaluateTolerance().
  if v_batch.workflow = 'DIMENSIONAL' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'row', r.dimension_row_id, 'sample', r.sample_no,
             'value_mm', r.value_mm,
             'in_tolerance', r.value_mm >= (d.nominal - d.tol_minus)
                        and r.value_mm <= (d.nominal + d.tol_plus)
           )), '[]'::jsonb)
    into v_dim_stats
    from public.readings r
    join public.dimension_rows d on d.id = r.dimension_row_id
    where r.batch_id = p_batch_id;
  end if;

  -- DFT grid stats per side — ISO 19840 verdicts (edge 1.11 / 4.9): below-80
  -- is strict (< 0.8× nominal), above-200 is strict (> 2.0× nominal), matching
  -- computeDftStats(). Any 80/200 breach hard-gates submission (the client
  -- checklist surface 'dft-breach' mirrors this); a thin grid is only a flag.
  if v_batch.workflow = 'COATING' then
    for v_rec in
      select side,
             count(*)::int                     as n,
             min(value_um)                     as min_um,
             max(value_um)                     as max_um,
             avg(value_um)                     as mean_um,
             coalesce(sum(case when value_um < 0.8 * cs.dft_nominal_um_side then 1 else 0 end), 0)::int as below_80,
             coalesce(sum(case when value_um > 2.0 * cs.dft_nominal_um_side then 1 else 0 end), 0)::int as above_200
      from public.dft_readings dr
      join public.batches b on b.id = dr.batch_id
      join lateral (
        select case when dr.side = 'INSIDE'
                    then cs.dft_nominal_um_inside else cs.dft_nominal_um_outside
               end as dft_nominal_um_side
        from public.coating_specs cs
        where cs.revision_id = b.revision_id
      ) cs on true
      where dr.batch_id = p_batch_id
      group by side, cs.dft_nominal_um_side
    loop
      v_stats := v_stats || jsonb_build_object(
        'side', v_rec.side, 'count', v_rec.n, 'min', v_rec.min_um, 'max', v_rec.max_um,
        'mean', round(v_rec.mean_um::numeric, 2), 'below_80', v_rec.below_80, 'above_200', v_rec.above_200
      );

      if v_rec.below_80 > 0 or v_rec.above_200 > 0 then
        raise exception 'BT_LOCK: ISO 19840 80/200 breach on % side of batch % (below-80: %, above-200: %) — coating verdict FAIL',
          v_rec.side, p_batch_id, v_rec.below_80, v_rec.above_200;
      end if;
    end loop;
  end if;

  -- ---------------- Sign-off + transition (§5.1 steps 4–5) ----------------

  -- Idempotent under retry (edge 1.7): UNIQUE (batch_id, role) + upsert keeps
  -- one row per role; the audit trail preserves every round's history.
  insert into public.sign_offs (batch_id, role, user_id, decision, comments)
  values (p_batch_id, 'INSPECTOR', auth.uid(), 'SUBMIT', null)
  on conflict (batch_id, role) do update
    set user_id   = excluded.user_id,
        decision  = excluded.decision,
        signed_at = now();

  update public.batches
  set status = 'SUBMITTED', updated_at = now()
  where id = p_batch_id;

  -- Forensic record: what the client claimed vs what the server computed.
  insert into public.audit_log (actor, entity, entity_id, action, payload)
  values (
    auth.uid(), 'batches', p_batch_id, 'RECOMPUTE',
    jsonb_build_object('client_stats', p_client_stats, 'server_stats', v_stats, 'dimension_eval', v_dim_stats)
  );

  -- Realtime (§6): per-batch channel + QH role channel, fired server-side.
  perform pg_notify('batch:' || p_batch_id::text,
                    json_build_object('status', 'SUBMITTED', 'batch_id', p_batch_id)::text);
  perform pg_notify('role:QUALITY_HEAD',
                    json_build_object('event', 'SUBMITTED', 'batch_id', p_batch_id)::text);

  return p_batch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.2 decide_batch(batch_id, decision, comments) — QH decision
-- Edge cases: 1.4 (signer == submitter raises), 1.5 (reject comments ≥ 10
-- chars per ui-ux §6.8 — non-empty, trimmed), 5.2/5.3 (stale-decision guard:
-- status must be SUBMITTED). APPROVED is terminal — immutability trigger
-- enforces it thereafter, even for service role.
-- ---------------------------------------------------------------------------

create or replace function public.decide_batch(
  p_batch_id uuid,
  p_decision text,
  p_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.batches%rowtype;
begin
  if not public.is_quality_head() then
    raise exception 'BT_AUTH: only a QUALITY_HEAD may decide a batch';
  end if;

  -- Edge 2.14 (Phase 2 deferral landed here): a QH decision is privileged and
  -- irreversible — it requires an MFA-verified session (AAL2), not merely a
  -- valid JWT. The `aal` claim is minted at sign-in and upgraded by the TOTP
  -- challenge; a QH who skipped the challenge holds aal1 and is refused here
  -- (fail-closed via coalesce). The UI answers BT_MFA with a re-challenge
  -- that preserves the pending decision form (edge 5.5).
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'BT_MFA: decision requires an MFA-verified session (AAL2) — re-authenticate with your second factor (edge 2.14)';
  end if;

  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception 'BT_VALID: decision must be APPROVE or REJECT';
  end if;

  select * into v_batch from public.batches b where b.id = p_batch_id;
  if not found then
    raise exception 'BT_STATE: batch % not found', p_batch_id;
  end if;

  -- Stale-decision / race guard (edges 5.2 / 5.3): exactly one decision path.
  if v_batch.status is distinct from 'SUBMITTED' then
    raise exception 'BT_STATE: batch is %, expected SUBMITTED (decision race guarded)',
      v_batch.status;
  end if;

  -- Separation of duties (edge 1.4, security doc §4): the batch author cannot
  -- decide it, even if promoted to QH mid-flight.
  if v_batch.created_by = auth.uid() then
    raise exception 'BT_STATE: self-approval forbidden — signer equals submitter (security-compliance.md §4)';
  end if;

  if p_decision = 'REJECT' then
    if p_comments is null or btrim(p_comments) = '' then
      raise exception 'BT_VALID: rejection requires comments (SO-03)';
    end if;

    insert into public.sign_offs (batch_id, role, user_id, decision, comments)
    values (p_batch_id, 'QUALITY_HEAD', auth.uid(), 'REJECT', btrim(p_comments))
    on conflict (batch_id, role) do update
      set user_id   = excluded.user_id,
          decision  = excluded.decision,
          comments  = excluded.comments,
          signed_at = now();

    update public.batches set status = 'DRAFT', updated_at = now() where id = p_batch_id;
  else
    insert into public.sign_offs (batch_id, role, user_id, decision, comments)
    values (p_batch_id, 'QUALITY_HEAD', auth.uid(), 'APPROVE', null)
    on conflict (batch_id, role) do update
      set user_id   = excluded.user_id,
          decision  = excluded.decision,
          comments  = null,
          signed_at = now();

    update public.batches set status = 'APPROVED', updated_at = now() where id = p_batch_id;
  end if;

  perform pg_notify('batch:' || p_batch_id::text,
                    json_build_object('status', case when p_decision = 'APPROVE' then 'APPROVED' else 'DRAFT' end,
                                      'batch_id', p_batch_id)::text);
  perform pg_notify('user:' || v_batch.created_by::text,
                    json_build_object('event', p_decision, 'batch_id', p_batch_id)::text);

  return p_batch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.3 upsert_batch_draft — offline sync target (offline-sync-architecture §5)
-- Conflict policy resolved here, in one place, not in client code:
--   • server batch not DRAFT (SUBMITTED+ or APPROVED) → server wins; the
--     whole payload is refused and the current server status is returned so
--     the queue can discard its entries for this batch.
--   • server batch DRAFT → local wins: header + child rows merged per-row
--     last-write-wins on the cell values (Phase 7 adds per-row updated_at
--     tie-breaking for the two-devices case; v1 has one inspector per batch).
-- Idempotent: replaying the same payload converges to the same state.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_batch_draft(
  p_batch       jsonb,
  p_readings    jsonb default '[]'::jsonb,
  p_coat_logs   jsonb default '[]'::jsonb,
  p_dft_readings jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid := (p_batch ->> 'id')::uuid;
  v_status   text;
begin
  if v_batch_id is null then
    raise exception 'BT_VALID: payload batch.id is required';
  end if;

  select status into v_status from public.batches where id = v_batch_id;

  if v_status is not null and v_status <> 'DRAFT' then
    -- Server wins (doc §5 row 2).
    return jsonb_build_object('outcome', 'SERVER_WINS', 'status', v_status, 'batch_id', v_batch_id);
  end if;

  if v_status is null then
    -- New draft from an offline device.
    insert into public.batches (
      id, item_id, revision_id, created_by, po_number, delivery_batch_code,
      lot_qty, inspection_date, status, workflow
    ) values (
      v_batch_id,
      (p_batch ->> 'item_id')::uuid,
      (p_batch ->> 'revision_id')::uuid,
      auth.uid(),
      p_batch ->> 'po_number',
      p_batch ->> 'delivery_batch_code',
      (p_batch ->> 'lot_qty')::int,
      (p_batch ->> 'inspection_date')::date,
      'DRAFT',
      p_batch ->> 'workflow'
    );
  else
    -- Local wins on a DRAFT: refresh header fields, keep server identity.
    update public.batches set
      po_number           = coalesce(p_batch ->> 'po_number', po_number),
      delivery_batch_code = coalesce(p_batch ->> 'delivery_batch_code', delivery_batch_code),
      lot_qty             = coalesce((p_batch ->> 'lot_qty')::int, lot_qty),
      inspection_date     = coalesce((p_batch ->> 'inspection_date')::date, inspection_date),
      updated_at          = now()
    where id = v_batch_id;
  end if;

  -- Dimensional samples (DIM-03): one value per (batch, row, sample).
  insert into public.readings (batch_id, dimension_row_id, sample_no, value_mm, instrument_id)
  select v_batch_id,
         (r ->> 'dimension_row_id')::uuid,
         (r ->> 'sample_no')::int,
         (r ->> 'value_mm')::numeric,
         (r ->> 'instrument_id')::uuid
  from jsonb_array_elements(p_readings) as r
  on conflict (batch_id, dimension_row_id, sample_no) do update
    set value_mm      = excluded.value_mm,
        instrument_id = excluded.instrument_id;

  -- Coat logs (COAT-01…04): one per (batch, coat_no).
  insert into public.coat_logs (
    batch_id, coat_no, product, ral, part_a_batch, part_a_mfg, part_b_batch,
    part_b_mfg, thinner_batch, viscosity_s, wft_um, ambient_c, rh_pct, steel_c
  )
  select v_batch_id,
         (c ->> 'coat_no')::int,
         c ->> 'product',
         c ->> 'ral',
         c ->> 'part_a_batch',
         c ->> 'part_a_mfg',
         c ->> 'part_b_batch',
         c ->> 'part_b_mfg',
         c ->> 'thinner_batch',
         (c ->> 'viscosity_s')::numeric,
         (c ->> 'wft_um')::numeric,
         (c ->> 'ambient_c')::numeric,
         (c ->> 'rh_pct')::numeric,
         (c ->> 'steel_c')::numeric
  from jsonb_array_elements(p_coat_logs) as c
  on conflict (batch_id, coat_no) do update
    set product       = excluded.product,
        ral           = excluded.ral,
        part_a_batch  = excluded.part_a_batch,
        part_a_mfg    = excluded.part_a_mfg,
        part_b_batch  = excluded.part_b_batch,
        part_b_mfg    = excluded.part_b_mfg,
        thinner_batch = excluded.thinner_batch,
        viscosity_s   = excluded.viscosity_s,
        wft_um        = excluded.wft_um,
        ambient_c     = excluded.ambient_c,
        rh_pct        = excluded.rh_pct,
        steel_c       = excluded.steel_c;

  -- DFT grid (COAT-05): one value per (batch, side, point); absent points
  -- stay absent — the queue never sends zeros for empty cells.
  insert into public.dft_readings (batch_id, side, point_no, value_um)
  select v_batch_id,
         (d ->> 'side'),
         (d ->> 'point_no')::int,
         (d ->> 'value_um')::numeric
  from jsonb_array_elements(p_dft_readings) as d
  on conflict (batch_id, side, point_no) do update
    set value_um = excluded.value_um;

  return jsonb_build_object('outcome', 'MERGED', 'status', 'DRAFT', 'batch_id', v_batch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.4 log_export — controlled-document export gate (report-export-spec §7,
--    execution-plan Phase 6 step 4; edge 6.9 gate parity).
-- Export of ST/QC-02 / ST/QC-04 PDFs is a QMS act: it only ever happens on
-- an APPROVED batch, and it is itself auditable. The client calls this
-- BEFORE/at print time; the audit_log write is SECURITY DEFINER because
-- audit_log has no client write policy (§3.2).
-- ---------------------------------------------------------------------------
create or replace function public.log_export(
  p_batch_id uuid,
  p_channel  text default 'PRINT',
  p_meta     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.batches%rowtype;
  v_entry uuid;
begin
  -- Edge 6.9: URL-guessed export on a non-approved batch is refused here.
  select * into v_batch from public.batches where id = p_batch_id;
  if not found then
    raise exception 'BT_STATE: batch % not found', p_batch_id;
  end if;
  if v_batch.status is distinct from 'APPROVED' then
    raise exception 'BT_STATE: export is gated on APPROVED — batch is %', v_batch.status;
  end if;

  -- p_channel: 'PRINT' (browser print-to-PDF) or 'EMAIL' (client compose,
  -- step 8; SMTP delivery itself is out of scope for the transaction).
  if p_channel not in ('PRINT', 'EMAIL') then
    raise exception 'BT_VALID: export channel must be PRINT or EMAIL';
  end if;

  insert into public.audit_log (actor, entity, entity_id, action, payload)
  values (
    auth.uid(),
    'batches',
    p_batch_id,
    'EXPORT',
    jsonb_build_object('channel', p_channel, 'meta', p_meta)
  )
  returning id into v_entry;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: RPCs are executable by authenticated users only; RLS + the
-- functions' own role checks are the control plane.
-- ---------------------------------------------------------------------------
revoke execute on function public.submit_batch(uuid, jsonb) from anon, public;
revoke execute on function public.decide_batch(uuid, text, text) from anon, public;
revoke execute on function public.upsert_batch_draft(jsonb, jsonb, jsonb, jsonb) from anon, public;
revoke execute on function public.log_export(uuid, text, jsonb) from anon, public;
grant execute on function public.submit_batch(uuid, jsonb) to authenticated;
grant execute on function public.decide_batch(uuid, text, text) to authenticated;
grant execute on function public.upsert_batch_draft(jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.log_export(uuid, text, jsonb) to authenticated;
