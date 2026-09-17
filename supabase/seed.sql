-- ============================================================================
-- Seed — audited fixture data (execution-plan.md Phase 1, step 9)
-- Simran QC Platform
--
-- Fixture item: Spiral Air Duct Cap (W1G00005572, rev A) with the audited
-- 53-row dimension template, the C3/C4 HIGH coating spec (C3 180 µm outside,
-- C4 240 µm inside per data-dictionary.md §5), and the shop-floor instrument
-- set (VC-04, MC-02, DG-01, HG-01, PG-01).
-- Idempotent: safe to re-run (ON CONFLICT no-ops on every natural key).
-- Profiles are NOT seeded — they are provisioned on first login (Phase 2).
-- Run: supabase db reset / supabase db push, or psql against staging once.
-- ============================================================================

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
