-- ============================================================================
-- Seed — audited fixture data (execution-plan.md Phase 1, step 9)
-- Simran QC Platform
--
-- Fixture item: Spiral Air Duct Cap (W1G00005572, rev A) with the audited
-- 53-row dimension template, the C3/C4 HIGH coating spec (C3 180 µm outside,
-- C4 240 µm inside per data-dictionary.md §5), and the shop-floor instrument
-- set (VC-04, MC-02, DG-01, HG-01, PG-01).
-- Idempotent: safe to re-run (ON CONFLICT no-ops on every natural key).
-- Run: supabase db reset / supabase db push, or psql against staging once.
--
-- Demo accounts: seeded here so a fresh `supabase db reset` is immediately
-- loginable (and the Playwright journeys have credentials to drive). The
-- password is a DEV/DEMO credential — rotate before any real deployment.
-- The `on_auth_user_created` trigger (migration 006) provisions the profile
-- row; roles are then corrected to the intended demo matrix.
-- ============================================================================

-- GoTrue-safe insert shape: every legacy token column is a non-NULL '' (a NULL
-- recovery_token makes GoTrue's row scanner 500 on login) and the identity
-- carries provider_id = the user's uuid (NOT 'email'). Proven against the
-- local stack and hosted Supabase.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'admin@simran.local',
   crypt('Simran#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Platform Admin"}', now(), now(),
   '', '', '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1',
   'authenticated', 'authenticated', 'inspector1@simran.local',
   crypt('Simran#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Inspector One"}', now(), now(),
   '', '', '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1',
   'authenticated', 'authenticated', 'qh@simran.local',
   crypt('Simran#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Quality Head"}', now(), now(),
   '', '', '', '', '', '', '', '', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1',
   'authenticated', 'authenticated', 'nace@simran.local',
   crypt('Simran#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"NACE Inspector"}', now(), now(),
   '', '', '', '', '', '', '', '', false, false)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1',
   jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'email', 'admin@simran.local', 'email_verified', true),
   'email', '00000000-0000-0000-0000-0000000000a1', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1',
   jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000b1', 'email', 'inspector1@simran.local', 'email_verified', true),
   'email', '00000000-0000-0000-0000-0000000000b1', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1',
   jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000c1', 'email', 'qh@simran.local', 'email_verified', true),
   'email', '00000000-0000-0000-0000-0000000000c1', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1',
   jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000d1', 'email', 'nace@simran.local', 'email_verified', true),
   'email', '00000000-0000-0000-0000-0000000000d1', now(), now(), now())
on conflict (id) do nothing;

-- Correct the trigger's default role assignment to the intended demo matrix.
update public.profiles set role = 'ADMIN',          full_name = 'Platform Admin'  where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'QC_INSPECTOR',   full_name = 'Inspector One'   where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'QUALITY_HEAD',   full_name = 'Quality Head'    where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'NACE_INSPECTOR', full_name = 'NACE Inspector'  where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.customers (name) values ('FLENDER'), ('WINERGY')
on conflict (name) do nothing;

insert into public.items (item_code, drawing_number, description, customer_id)
select 'W1G00005572', '9423E', 'Spiral Air Duct Cap', c.id
from public.customers c
where c.name = 'FLENDER'
on conflict (item_code) do nothing;

insert into public.drawing_revisions (item_id, rev, released_at)
select i.id, 'A', date '2026-01-15'
from public.items i
where i.item_code = 'W1G00005572'
on conflict (item_id, rev) do nothing;

-- 53 dimension rows (the audited ST/QC/02 template shape; values are fixture
-- data — production templates arrive via Item Master admin in Phase 2).
insert into public.dimension_rows (revision_id, serial, label, nominal, tol_plus, tol_minus, symbol, is_reference)
select rev.id,
       s,
       'DIM-' || lpad(s::text, 2, '0'),
       round((100.0 + ((s - 1) % 7) * 0.25)::numeric, 2),
       0.5,
       0.5,
       case when s % 2 = 0 then 'DIA' else null end,
       s = 1
from public.drawing_revisions rev
cross join generate_series(1, 53) as s
where rev.item_id = (select id from public.items where item_code = 'W1G00005572')
  and rev.rev = 'A'
on conflict (revision_id, serial) do nothing;

-- Coating spec: C4 HIGH inside / C3 HIGH outside (data-dictionary.md §5).
insert into public.coating_specs (
  revision_id, substrate, blast_grade, blast_profile_um_min, blast_profile_um_max,
  system_inside, system_outside, dft_nominal_um_inside, dft_nominal_um_outside
)
select rev.id, 'CARBON STEEL', 'Sa 2.5', 45, 75, 'C4 HIGH', 'C3 HIGH', 240, 180
from public.drawing_revisions rev
where rev.item_id = (select id from public.items where item_code = 'W1G00005572')
  and rev.rev = 'A'
on conflict (revision_id) do nothing;

-- Instrument set (EQ-01). next_due_at is generated (last_cal + interval).
insert into public.instruments (instrument_code, description, make_model, range, last_cal_at, interval_months) values
  ('VC-04', 'Vernier calliper', 'Mitutoyo 500-196-30', '0–200 mm',  date '2026-03-10', 12),
  ('MC-02', 'Outside micrometer', 'Mitutoyo M110-25', '0–25 mm',    date '2026-02-20', 12),
  ('DG-01', 'DFT gauge Type 2', 'Elcometer 456',      '0–2000 µm',  date '2026-04-05', 12),
  ('HG-01', 'Thermo-hygrometer', 'Testo 605i',        '0–100 %RH',  date '2026-05-01', 12),
  ('PG-01', 'Surface thermometer', 'Testo 905-T1',    '−45–60 °C',  date '2026-01-25', 12)
on conflict (instrument_code) do nothing;

-- ============================================================================
-- Demo workflow fixtures (dev / E2E only)
-- Deterministic batches so the dashboard, the QH review queue and the
-- approved-report path are populated on a fresh `supabase db reset`:
--   * B1 = SUBMITTED dimensional batch → appears in the review queue (J2)
--   * B2 = APPROVED  dimensional batch → offers its controlled report (J3)
-- Values derive from each row's nominal — mostly in-tolerance, plus one warn
-- row and one fail row so the review flag column is non-trivial. Authored by
-- the seeded QC Inspector, approved by the seeded Quality Head.
-- Idempotent: fixed ids + `on conflict do nothing`, and the transitions are
-- guarded so a re-run never trips the APPROVED-immutability trigger.
-- ============================================================================

insert into public.batches (
  id, item_id, revision_id, created_by, po_number, delivery_batch_code,
  lot_qty, inspection_date, status, workflow
)
select v.id,
       (select id from public.items where item_code = 'W1G00005572'),
       rev.id,
       '00000000-0000-0000-0000-0000000000b1'::uuid,  -- seeded QC Inspector
       v.po, v.lot, v.qty, v.insp::date, 'DRAFT', 'DIMENSIONAL'
from (values
  ('00000000-0000-4000-8000-000000000101'::uuid, 'PO-DEMO-SUB', '2609-11', 50, '2026-09-17'),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'PO-DEMO-APP', '2609-12', 40, '2026-09-16')
) as v(id, po, lot, qty, insp)
cross join public.drawing_revisions rev
where rev.item_id = (select id from public.items where item_code = 'W1G00005572')
  and rev.rev = 'A'
on conflict (id) do nothing;

-- Five readings per dimension row for both demo batches. Inside tolerance
-- except serial 9 sample 03 (fail) and serials divisible by 7 on sample 05
-- (warn) — so the QH flag column has something to show.
insert into public.readings (batch_id, dimension_row_id, sample_no, value_mm, instrument_id)
select b.id,
       dr.id,
       s.sample_no,
       case
         when dr.serial = 9 and s.sample_no = 3 then dr.nominal + 0.60
         when dr.serial % 7 = 0 and s.sample_no = 5 then dr.nominal + 0.45
         else dr.nominal + round((((dr.serial * 7 + s.sample_no * 3) % 9) - 4)::numeric * 0.05, 3)
       end,
       inst.id
from (values ('00000000-0000-4000-8000-000000000101'::uuid),
             ('00000000-0000-4000-8000-000000000102'::uuid)) as b(id)
cross join public.dimension_rows dr
join public.drawing_revisions rev on rev.id = dr.revision_id
cross join generate_series(1, 5) as s(sample_no)
cross join lateral (select id from public.instruments where instrument_code = 'VC-04') as inst
where rev.item_id = (select id from public.items where item_code = 'W1G00005572')
  and rev.rev = 'A'
on conflict (batch_id, dimension_row_id, sample_no) do nothing;

-- Sign-offs: both batches submitted by the inspector; B2 approved by the QH.
insert into public.sign_offs (batch_id, role, user_id, decision, comments, signed_at)
values
  ('00000000-0000-4000-8000-000000000101', 'INSPECTOR',    '00000000-0000-0000-0000-0000000000b1', 'SUBMIT',  null, '2026-09-17T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000102', 'INSPECTOR',    '00000000-0000-0000-0000-0000000000b1', 'SUBMIT',  null, '2026-09-16T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000102', 'QUALITY_HEAD', '00000000-0000-0000-0000-0000000000c1', 'APPROVE', 'Verified against drawing 9423E Rev A.', '2026-09-16T11:00:00Z')
on conflict (batch_id, role) do nothing;

-- ============================================================================
-- Demo MFA factor: the Quality Head is MFA-enforced (SO-01…04), so the review
-- decision bar only enables for a session that has passed a real TOTP
-- challenge. Seed a VERIFIED factor with a fixed secret so the E2E journeys
-- can generate codes (e2e/helpers.ts totpCode) and exercise the genuine
-- challenge → verify → approve path instead of a fixture bypass.
--   * Secret is public test material (base32, 20 bytes), never a real credential.
--   * Idempotent: fixed id + on conflict do nothing.
-- ============================================================================
insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at
)
values (
  '00000000-0000-4000-8000-0000000000f1'::uuid,
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'Shop-floor TOTP',
  'totp',
  'verified',
  'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  now(),
  now()
)
on conflict (id) do nothing;

-- Drive the real state machine (never insert APPROVED directly). Guarded so a
-- re-run is a no-op and can never trip the APPROVED-immutability trigger.
update public.batches set status = 'SUBMITTED' where id = '00000000-0000-4000-8000-000000000101' and status = 'DRAFT';
update public.batches set status = 'SUBMITTED' where id = '00000000-0000-4000-8000-000000000102' and status = 'DRAFT';
update public.batches set status = 'APPROVED'  where id = '00000000-0000-4000-8000-000000000102' and status = 'SUBMITTED';
