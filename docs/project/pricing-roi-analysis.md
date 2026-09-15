# Pricing Comparison & ROI Payback Analysis
## Inspection Automation & Quality Intelligence Platform

**Prepared by:** Skyrn Studio (internal — commercial in confidence)
**For client-facing use:** extract §4 summary table only after deal positioning is decided
**Version:** 1.0
**Date:** September 14, 2026
**Source of record:** `premium-features-roadmap.md` (module prices, package tiers), `project-brief.md` §5 (time savings), `workbook-audit-analysis.md` (risk basis)

---

## 1. Purpose

One working sheet for deal construction: what each module costs à la carte, how the three packages compose, what the bundles are worth, and — with fully stated assumptions — when each package pays for itself. All arithmetic is reproducible from §5.

---

## 2. Module Price List (à la carte)

| # | Module | PRD scope | Indicative price | Notes |
|---|---|---|---|---|
| M1 | Item & Drawing Master | IM-01…06 | — | Core platform; included in every tier |
| M2 | Dimensional Workflow (ST/QC/02) | DIM-01…07 | — | Core of Starter |
| M3 | Dual Digital Sign-off | SO-01…04 | — | Core platform |
| M4 | Offline / PWA Reliability | DIM-07, NFR | — | Core platform |
| M5 | PDF Export (ST/QC/02) | PDF-01, 02, 04 | — | Included in Starter |
| M6 | Coating Workflow core (ST/QC/04) | COAT-01, 02, 04, 07 | — | Unpriced separately; enters at Professional |
| M7 | Psychrometric Dew-Point Watchdog | COAT-03 | ₹20,000 – ₹35,000 | The ISO 12944-7 gate |
| M8 | DFT Statistical Engine (ISO 19840) | COAT-05, 06 | ₹15,000 – ₹25,000 | Replaces 26 shadow cells |
| M9 | Calibration Registry + Audit Recall | EQ-01…04 | — | Included in core; justifies higher base |
| M10 | NCR Auto-Drafter | NCR-01…03 | ₹15,000 – ₹25,000 | |
| M11 | Tolerance Drift / SPC-Lite Dashboard | — | ₹25,000 – ₹40,000 | Scrap prevention (predictive) |
| M12 | AI Drawing Extraction | — | ₹30,000 – ₹50,000 | R&D-scoped milestone |
| M13 | Tablet Shop-Floor Entry Mode | — | ₹25,000 – ₹40,000 | |
| M14 | Customer Dossier Portal | — | ₹20,000 – ₹35,000 | Read-only OEM access |

---

## 3. Package Composition & Bundle Value

| Module | Starter QC | Professional QMS ⭐ | Enterprise Intelligence |
|---|:-:|:-:|:-:|
| M1 Item Master | ✅ | ✅ | ✅ |
| M2 Dimensional workflow | ✅ | ✅ | ✅ |
| M3 Dual sign-off | ✅ | ✅ | ✅ |
| M4 Offline / PWA | ✅ | ✅ | ✅ |
| M5 PDF (ST/QC/02) | ✅ | ✅ | ✅ |
| M6 Coating workflow core | — | ✅ | ✅ |
| M7 Dew-Point Watchdog | — | ✅ | ✅ |
| M8 DFT Engine | — | ✅ | ✅ |
| M9 Calibration Registry | — | ✅ | ✅ |
| M10 NCR Drafter | — | ✅ | ✅ |
| M11 SPC Dashboard | — | — | ✅ |
| M12 AI Extraction | — | — | ✅ |
| M13 Tablet Entry Mode | — | — | ✅ |
| M14 Customer Portal | — | — | ✅ |
| **Package price** | **₹60k – ₹90k** | **₹1.20L – ₹1.80L** | **₹2.20L – ₹3.20L+** |
| **Annual retainer** | ₹8k – ₹15k/mo | ₹8k – ₹15k/mo | ₹8k – ₹15k/mo |

### 3.1 Bundle Discount Reality Check (midpoints)

| Comparison | À la carte sum | Package (mid) | Effective discount |
|---|---|---|---|
| Professional vs Starter + M7+M8+M10 | ₹75k + ₹67.5k = **₹1.43L** (+ M6, M9 unpriced) | ₹1.50L | ≈ **−31% or better** on the priced set |
| Enterprise vs Professional + M11–M14 | ₹1.50L + ₹1.33L = **₹2.83L** | ₹2.70L | ≈ **−4%** on the priced set |

**Deal-construction implications:**

- **Professional is the cleanly discounted bundle** — easy to defend as "30% off buying pieces," on top of the coating core and calibration registry being effectively free. This is the anchor tier.
- **Enterprise is *not* a module-sum discount.** Its price is value-based on M11/M12 (scrap prevention, onboarding speed). Do not sell Enterprise on module arithmetic — sell it on SPC avoiding one scrap run, and portal-driven supplier differentiation.
- **Discount guardrails:** floor prices — Starter ₹55k, Professional ₹1.10L, Enterprise ₹2.00L. Below floor, drop scope (M13 → later phase; M12 → milestone-priced) rather than price. Never discount the retainer below ₹8k/mo — it carries hosting, backups, and audit-prep support at near-cost.

---

## 4. ROI & Payback Model

### 4.1 Assumptions (stated, adjustable per deal)

| Parameter | Conservative | Base | Optimistic | Basis |
|---|---|---|---|---|
| Batches inspected / week | 15 | 17.5 | 20 | Brief §5 ("15–20/week") |
| Entry + checking time saved / batch | 30 min | 35 min | 40 min | Brief §5: 35–45 → 3–5 min (dimensional), 30–40 → 4–6 min (coating) |
| Blended loaded labour rate | ₹150/h | ₹200/h | ₹300/h | Inspector + Quality Head blend, MIDC plant |
| Audit-prep events / year | 12 | 12 | 12 | ISO surveillance + OEM reviews |
| Hours saved per audit prep | 2 h | 3 h | 4 h | Brief §5: 2–4 h → seconds |
| Working weeks / year | 48 | 48 | 48 | — |

### 4.2 Annual Benefit (labour only)

| Component | Conservative | Base | Optimistic |
|---|---|---|---|
| Batch-entry savings (h/yr) | 360 | 490 | 640 |
| Entry savings (₹/yr) | ₹54,000 | ₹98,000 | ₹1,92,000 |
| Audit-prep savings (₹/yr) | ₹3,600 | ₹7,200 | ₹14,400 |
| **Total labour benefit (₹/yr)** | **≈ ₹58,000** | **≈ ₹1,05,000** | **≈ ₹2,06,000** |
| Monthly equivalent | ₹4,800 | ₹8,800 | ₹17,200 |

### 4.3 Payback by Package (months to recover investment)

Two lenses, because the retainer question always comes up:

**(a) Licence-only payback** — one-time fee ÷ monthly labour benefit:

| Package (mid price) | Conservative | Base | Optimistic |
|---|:-:|:-:|:-:|
| Starter — ₹75k | 16 mo | 9 mo | **4 mo** |
| Professional — ₹1.50L | 31 mo | 17 mo | **9 mo** |
| Enterprise — ₹2.70L | 56 mo | 31 mo | **16 mo** |

**(b) Total Year-1 payback** — (licence + 12 months retainer) ÷ monthly labour benefit:

| Package (Year-1 cost, mid) | Conservative | Base | Optimistic |
|---|:-:|:-:|:-:|
| Starter — ₹2.13L | 44 mo | 24 mo | 12 mo |
| Professional — ₹2.88L | 60 mo | 33 mo | 17 mo |
| Enterprise — ₹4.08L | 85 mo | 46 mo | 24 mo |

### 4.4 How to Read This Honestly

1. **Labour savings alone justify Starter at most realistic rates** (4–16 months on licence-only) and Professional in the base-to-optimistic band. This is the quantitative backbone of the Starter/Professional pitch.
2. **The retainer is the swing factor.** At the conservative scenario, retainer (₹8k–15k/mo) roughly consumes the labour benefit. Two legitimate counters: (i) the retainer replaces costs the client carries anyway as they grow (hosting, backups, update labour, onboarding help), and (ii) the sale must therefore be **anchored on compliance risk, not timesheets** — which the audit findings make easy.
3. **The unquantified column dominates.** Not modelled, because the client's own numbers should fill them in during discovery: one avoided OEM batch rejection (a "multi-lakh shipment" per the roadmap), scrap prevented by amber early-warning before a full run goes bad, and the commercial value of *retaining* preferred-supplier status with FLENDER / WINERGY. Any one of these occurring once exceeds the entire Professional licence.

### 4.5 Recommended Deal Framing

- **Lead with Professional.** It is the only tier that eliminates *both* documented audit exposures (dew-point record, zero traceability), it carries the real bundle discount, and its licence-only payback is 9–31 months before counting any risk value.
- **Position Enterprise as the growth path, not the default ask** — SPC/AI/portal are a phase-2 upgrade conversation after the pilot proves the core.
- **If the client resists the retainer**, trade scope, not price: monthly onboarding of new drawings can move into the licence year-1 as a milestone.

---

## 5. One-Line Summary for the Sales Conversation

> *"The licence pays for itself in under a year and a half on saved inspection time alone — and that is before counting the one thing it guarantees: you will never again hand a Flender auditor a painting record where the steel was colder than the dew point."*

---

*Assumption changes (batch volume, labour rate) require regenerating §4; the model is deliberately simple enough to recompute in the room.*
