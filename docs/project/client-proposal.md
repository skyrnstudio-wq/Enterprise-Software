# Software Proposal & Business Case
## Inspection Automation & Quality Intelligence Platform

**Prepared for:** Management, Simran Technocrats (I) Pvt. Ltd., Dombivali MIDC
**Prepared by:** Skyrn Studio
**Date:** September 14, 2026
**Reference documents:** Project Brief, Workbook Audit Analysis, Product Requirements v1.2
**Status:** For management review

---

## 1. Executive Summary

Simran Technocrats runs its entire quality system on Excel. Our forensic audit of the two controlled formats — the **Dimensional Inspection Report (ST/QC/02, Rev 02)** and the **Surface Preparation & Protective Coating Report (ST/QC/04, Rev 01)** — found that the spreadsheets are not just slow. They are carrying **compliance risks that could fail a FLENDER / WINERGY audit tomorrow**:

- A recorded dew point of **29.2 °C against steel at 28.8 °C** — on paper, painting was performed on steel colder than its dew point, an automatic batch rejection under ISO 12944-7. The real calculated dew point was 24.1 °C; the margin was fine. One transcription typo put it on the record.
- A dimension template with **Nominal 10, Min 1, Max 3** — a broken hand-typed formula that has lived undetected in a live ISO 9001 document.
- An **Equipment ID column that is 100% blank** across all 53 rows — meaning zero instrument traceability, which under ISO 9001 can invalidate every report an expired gauge ever touched.

We propose a purpose-built **enterprise web application** that digitizes both workflows on top of your existing audited formats — same layouts, same format numbers, same sign-off blocks — while making these failure classes **physically impossible**. Inspection time drops from 35–45 minutes to **3–5 minutes per batch**, and audit preparation drops from hours to seconds.

---

## 2. What We Found in Your Workbooks

| # | Finding | Consequence today |
|---|---|---|
| 1 | Dew point hand-typed as 29.2 °C while steel was 28.8 °C (`Painting report.xlsx`) | Documented ISO 12944-7 non-conformance — a batch-rejecting finding in any OEM audit |
| 2 | Nominal `10` with Min `1` / Max `3` in the dimensional template | Undetected acceptance of impossible limits; math done by hand in cells |
| 3 | Brackets and symbols (`(2065)`, `Ø12`) break Excel formulas, forcing `=2065-2` style hardcoding | Every template edit risks new silent arithmetic errors |
| 4 | 26 hidden "shadow cells" (`AK24:BJ27`) computing DFT statistics | Any inserted row/column breaks the statistics silently |
| 5 | Delivery batch code changes between stages (`2604-02` vs `2605-02` for the same piece) | Broken traceability from surface prep to final inspection |
| 6 | Equipment ID column blank on every row; calibration untracked | No ISO 9001 measurement traceability; expired gauge = invalidated reports |
| 7 | `Checked by` sign-off block left blank | Sign-off accountability not evidenced |

These are systemic to manual spreadsheets — they are not mistakes of any individual. That is exactly why the fix must be structural.

---

## 3. The Proposed Platform

A single web application, usable on shop-floor tablets and office PCs alike, that preserves your audited QMS documents pixel-for-pixel while automating everything that is currently hand-done.

| Capability | What it does for your team |
|---|---|
| **Unified Item & Drawing Master** | Each drawing's ~53 dimensions, tolerances, and coating specifications are stored once. New batches auto-populate — no more copying workbooks per revision. |
| **Automated GD&T Limit Engine** | Reads `(2065)`, `Ø12`, `100°` correctly and derives exact Min/Max. Arithmetic errors become impossible; limits are locked. |
| **Fast 5-Sample Entry Grid** | Keyboard-driven (`Tab`/`Enter`), "Copy to all 5" for identical readings, and instant 🟢🟡🔴 tolerance colouring on every keystroke — including an "approaching limit" amber warning that catches tool wear early. |
| **Dew Point Compliance Watchdog (ISO 12944-7)** | The system computes the true dew point (Magnus-Tetens) from ambient temp and humidity — inspectors can never type it. If steel is less than 3 °C above dew point, painting sign-off is **blocked** with an explicit warning. |
| **DFT Statistical Engine (ISO 19840)** | All 26 points per side evaluated live: Min, Max, Average, Standard Deviation, and 80/200-rule compliance — no shadow cells, ever. |
| **Instrument Calibration Registry** | Every reading is linked to a calibrated instrument. Alerts 15 days before expiry; one-click recall of every report a gauge ever touched — full ISO surveillance-audit defence in seconds. |
| **Two-Person Digital Sign-Off** | Inspector (or NACE CIP Level 2) + Quality Head, with immutable timestamps. Once approved, a record **cannot be altered by anyone** — enforced in the database, not by hiding buttons. |
| **Audit-Ready PDF Reports** | One click prints reports indistinguishable from your controlled formats — format number, revision, and issue date in every footer, as your QMS requires. |
| **1-Click NCR Auto-Drafting** | The moment a reading or environmental condition fails, a Non-Conformance Report is 80% written — parameter, limits, actual values, equipment, operator. Your Quality Head adds disposition and root cause. |
| **Offline-First Reliability** | Readings save continuously even with no Wi-Fi; nothing is lost to a dropped connection, a crash, or a reboot. Data syncs when connectivity returns. |

**What stays the same:** your format numbers, your layouts, your ISO 9001 QMS structure, and your existing reference Excel files (which remain untouched as controlled baselines).

---

## 4. Quantified Impact

| Metric | Today (Excel) | With the Platform | Improvement |
|---|---|---|---|
| Time per dimensional batch | 35–45 min | **3–5 min** | ~90% faster |
| Time per coating inspection | 30–40 min | **4–6 min** | ~85% faster |
| Calculation errors | Recurring (found in audit) | **Zero — all computed** | Eliminated |
| ISO 12944 dew-point risk | Demonstrated in your files | **Structurally impossible** | Eliminated |
| Audit preparation | 2–4 hours searching workbooks | **Seconds** | ~98% faster |
| Instrument traceability | 0% (blank column) | **100% per reading** | Full audit defence |

Across a plant running 15–20 inspection batches per week, the platform recovers **20+ engineering hours weekly** — and, more importantly, removes the specific documented risks that could jeopardize your FLENDER / WINERGY standing.

---

## 5. Delivery Approach

We build and deliver in verifiable phases. Each phase ends with something you can see and test with your own team:

| Phase | Delivered | Outcome for you |
|---|---|---|
| **0 — Foundation** ✅ | Core architecture and calculation engines (built & tested) | The compliance math is proven correct before any screen exists |
| 1 — Data Layer | Secure database with role permissions and tamper-proofing | Approved records become permanently immutable |
| 2 — Master Data | User accounts, Item Master, instrument registry | Your admin controls the catalogue; calibration alerts go live |
| 3 — Dimensional Module | The ST/QC/02 workflow | Your team inspects a real batch on-screen in minutes |
| 4 — Coating Module | The ST/QC/04 workflow with dew-point lock | The ISO 12944-7 gate is active on your line |
| 5 — Sign-off & Review | Digital dual sign-off, rejection loop | Full accountability with immutable timestamps |
| 6 — Reports | Print-perfect PDFs for both formats | We sign off fidelity against your audited originals together |
| 7 — Shop-Floor Pilot | Offline hardening on your tablets | A one-week live pilot proves zero data loss |
| 8 — NCR & Intelligence | Auto-drafted NCRs, audit-recall queries | Your QMS records complete themselves by default |
| 9 — Audit Rehearsal | Training + UAT on real batches | Your Quality Head passes a mock OEM audit using the platform alone |

Quality assurance is built in: every calculation engine is automatically tested against the standards (including the exact error cases found in your workbooks), and the platform cannot ship with a failing check.

---

## 6. Commercial Packages

| Package | Scope | Positioning | Indicative Price |
|---|---|---|---|
| **Starter QC** | Dimensional module (ST/QC/02), Item Master, PDF export, dual sign-off | The Excel replacement | ₹60,000 – ₹90,000 |
| **Professional QMS** ⭐ | Starter + Coating module (ST/QC/04) + Dew-point Watchdog + DFT Statistics + Calibration Registry + NCR Drafter | Your complete QMS, digitized | ₹1,20,000 – ₹1,80,000 |
| **Enterprise Intelligence** | Professional + Tolerance Drift (SPC) dashboard + AI drawing extraction + tablet entry mode + customer-facing dossier portal | The factory quality operating system | ₹2,20,000 – ₹3,20,000+ |
| **Annual Support Retainer** | Hosting, backups, updates, new-drawing onboarding assistance, ISO audit-prep support | Your dedicated QC technology partner | ₹8,000 – ₹15,000 / month |

**Our recommendation:** the **Professional QMS** tier. It is the smallest package that eliminates *both* audit exposures we documented — the dew-point record and the missing instrument traceability. The Starter tier fixes speed but leaves the coating risk on the table.

**Future add-ons** (available any time, priced separately): predictive tolerance-drift dashboard, AI extraction of dimensions straight from drawing PDFs, and a secure portal where FLENDER / WINERGY can download certified inspection dossiers directly.

---

## 7. Why This Protects the FLENDER / WINERGY Relationship

Tier-1 OEM audits do not test your parts — they test your **records**. Every finding in Section 2 is the kind of observation that escalates a supplier from "preferred" to "conditional." This platform makes the compliant outcome the *default* outcome: dew points are computed, gauges are tracked, sign-offs are timestamped, and every answer an auditor asks for is one query away.

> **The one-slide version:** "This system does what no spreadsheet can: it calculates psychrometric dew point to prevent an ISO 12944 violation on your painting line, computes ISO 19840 DFT statistics across 26 points without hidden helper cells, tracks your gauge calibrations, drafts your NCRs, and cuts inspection time from 45 minutes to 3 — protecting your standing as a preferred supplier to Flender and beyond."

---

## 8. Next Steps

1. **Review & sign-off** of the Product Requirements (v1.2) — one working session with your QC leadership.
2. **Confirm package tier** and commercial terms.
3. **Kick off Phase 1** (secure data layer) — your team's only input needed at this stage is a copy of representative item drawings and instrument list.
4. **Phase 3 demo** with your own dimension data — the first checkpoint where your inspectors use the real grid.
5. **Shop-floor pilot (Phase 7)** — one week of live use before final acceptance.

We are ready to begin on your sign-off.

---

*Annexures available on request: Product Requirements v1.2, workbook audit analysis, security & compliance mapping, delivery plan with phase exit criteria.*
