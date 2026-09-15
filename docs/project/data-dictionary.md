# Data Dictionary
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `backend-architecture.md` (tables/constraints), `workbook-audit-analysis.md` (source evidence), `product-requirements.md` (semantics)

---

## 1. Purpose

Field-level definitions and the controlled vocabularies of the platform. When a screen label, DB column, or report field is ambiguous, this document is the arbiter. Physical types live in `backend-architecture.md`; this file records **meaning, units, formats, and provenance**.

---

## 2. Identifier Formats

| Identifier | Grammar | Example | Source |
|---|---|---|---|
| Item Code | client ERP convention, string as-is | `W1G00005572` | Audited workbook |
| Drawing Number | client convention, string as-is | `A5E46224446` | Audited workbook |
| Drawing Revision | client convention | `WY000_9423E` | Audited workbook |
| Batch Number (internal) | `ST-{drawing}-{YYMM}-{seq}` | `ST-A5E46224446-2603-AQ` | PRD §6 |
| Delivery Batch Code | `^\d{4}-\d{2}$` = `YYMM-lot` | `2604-02` | PRD §6 |
| Instrument Code | dept prefix + number | `VC-04`, `MC-02` | Audited workbook |
| Format Numbers | `ST/QC/02 Rev 02`, `ST/QC/04 Rev 01` | — | Controlled QMS documents |

> Note (`workbook-audit-analysis.md`): stage divergence (`2604-02` vs `2605-02` for one component) was a documented defect. The platform unifies stage codes under the batch header — divergence is a validation error, not a data condition.

## 3. Units & Branded Types

| Unit | Brand (`src/domain/measurement.ts`) | Used by |
|---|---|---|
| Millimetre `mm` | `Millimetre` | Dimensional nominals, limits, readings |
| Micron `µm` | `Micron` | Blast profile, WFT, DFT |
| Degree (angle) `°` | `Degree` | Angular dimensions |
| Celsius `°C` | `Celsius` | Ambient, steel, dew point, ΔT |
| Percent RH `%RH` | `PercentRH` | Humidity (valid range 1–100) |
| Seconds `s` | plain | Viscosity (flow cup) |

Mixing units is a compile-time error; persistence stores numbers plus the column's declared unit.

## 4. Field Definitions (selected)

### 4.1 `dimension_rows`

| Field | Meaning | Constraints |
|---|---|---|
| `label` | Parameter text exactly as drawn, incl. symbols | non-empty |
| `nominal` | Numeric nominal after parsing (`(2065)` → `2065`) | finite |
| `tol_plus` / `tol_minus` | Upper/lower tolerance magnitudes | ≥ 0; `min_limit ≤ nominal ≤ max_limit` CHECK |
| `symbol` | `diameter \| angle \| radius \| runout \| null` | controlled list |
| `is_reference` | Bracketed reference dimension (`(2065)`) | bool |
| `serial` | Print/display order | unique per revision |

### 4.2 `batches`

| Field | Meaning | Constraints |
|---|---|---|
| `workflow` | `DIMENSIONAL` or `COATING` | one workflow per batch |
| `status` | `DRAFT → SUBMITTED → APPROVED`; `REJECTED → DRAFT` | state machine (`application-flow.md`) |
| `delivery_batch_code` | See §2 grammar | regex CHECK |
| `lot_qty` | Lot quantity inspected | positive integer |
| `revision_id` | Drawing revision inspected **under** | immutable after first submit (IM-05) |

### 4.3 Psychrometric fields (`coat_logs`)

| Field | Meaning | Notes |
|---|---|---|
| `ambient_c`, `rh_pct`, `steel_c` | Inspector-entered | Zod bounds: −45…60 °C, 1–100 %RH |
| `dew_point_c` | **Computed** Magnus-Tetens | read-only in UI; recomputed server-side |
| `delta_t_c` | `steel_c − dew_point_c` | compliance gate: ≥ 3.0 °C (ISO 12944-7) |
| `compliance_verdict` | `PASS \| LOCKED` at record time | historical truth preserved even if conditions later change |

### 4.4 DFT (`dft_readings`)

| Field | Meaning | Notes |
|---|---|---|
| `side` | `INSIDE` (C4 High) / `OUTSIDE` (C3 High) | controlled |
| `point_no` | 1–26 per side | UNIQUE per batch+side |
| `value_um` | Measured DFT | ISO 19840 evaluated per reading: < 80 % or > 200 % of nominal flags |

### 4.5 `instruments`

| Field | Meaning | Notes |
|---|---|---|
| `last_cal_at` | Last calibration date | date |
| `interval_months` | Calibration interval | 1–60 |
| `next_due_at` | **Generated**: `last_cal_at + interval` | never hand-entered |
| derived status | `ACTIVE` / `DUE_SOON` (≤ 15 days) / `EXPIRED` | computed, never stored (EQ-02) |

### 4.6 `sign_offs`

| Field | Meaning | Notes |
|---|---|---|
| `role` | `INSPECTOR` / `QUALITY_HEAD` | one row per role per batch |
| `decision` | `SUBMIT` / `APPROVE` / `REJECT` | REJECT requires `comments` |
| `signed_at` | Server timestamp | client clocks never trusted |
| `certification` | Free-text credential line | e.g. `K Deshpande, NACE CIP Level 2` |

## 5. Controlled Vocabularies

| Vocabulary | Values |
|---|---|
| Blast cleanliness | `Sa 2`, `Sa 2.5`, `Sa 3` (ISO 8501-1; client standard: Sa 2.5) |
| Grit size | `G-40` (client standard) et al. |
| Profile comparator | `Fine / Medium / Coarse (G)` + µm range (client: Medium 45–75 µm) |
| Weld/edge dressing | ISO 8501-3 `P-1`, `P-2` (client standard: P-2), `P-3` |
| Water break test | `PASS` (clean film) / `FAIL` (beading) — ISO 12944-4 |
| Paint roles | `PRIMER` / `INTERMEDIATE` / `FINISH` |
| Coat systems | `C3 HIGH (180 µm)` outside, `C4 HIGH (240 µm)` inside |
| NCR disposition | `REWORK` / `SCRAP` / `CONCESSION_USE_AS_IS` (NCR-03) |
| Audit actions | `SUBMIT`, `APPROVE`, `REJECT`, `EXPORT`, `ACK_EXPIRED_INSTRUMENT`, … |

## 6. Tolerance Expression Grammar (UI input)

Accepted drawing-cell syntax (parsed by `src/domain/tolerance-parser.ts`):

```
value        := nominal [tolerance]
nominal      := [symbols] number   — symbols: Ø ⌀ φ ° R
tolerance    := "±" t | "+" a "/" "-" b | "+" a "-" b | "-" b "/" "+" a
reference    := "(" value ")"      — bracketed reference dimension
lower-bound  := number "min"
```

Min/Max derivation: `min = nominal − tol_minus`, `max = nominal + tol_plus`; symmetric tolerance sets both. The historical failure mode (`=2065-2` hand formulas, `Nominal 10 → Min 1/Max 3`) is structurally impossible: formulas are parsed, never evaluated.

---

*Additions to vocabularies require a version bump; values are never edited in place — new values append so historical records keep meaning.*
