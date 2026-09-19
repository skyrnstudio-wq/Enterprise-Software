# Report Fidelity Sign-Off Checklist
## ST/QC/02 (Dimensional) · ST/QC/04 (Coating)

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Date opened:** ______ · **Session date:** ______
**Acceptance basis:** `product-requirements.md` PDF-02 / PDF-03 · `report-export-spec.md` §3, §4, §6
**Status:** ☐ Pending client Quality Head sign-off

> **Why this document exists.** PDF-02 and PDF-03 require the printed reports to be
> *indistinguishable* from the audited Excel originals. That claim can only be closed
> by a human comparing paper to paper. This is the record of that comparison: every
> printed line, against its counterpart in the original, with the reviewer's verdict
> and any deviation captured. **The golden Excel printouts are the arbiter — not
> eyeballing the screen.**

---

## 1. Scope

| Report | Format | Governed by | Original reference |
|---|---|---|---|
| Dimensional Inspection Report | `ST/QC/02, Rev 02` | ISO 9001 QMS | `Inspection Format.xlsx` (immutable baseline) |
| Surface Prep & Protective Coating Report | `ST/QC/04, Rev 01` | ISO 12944 / 8501 · NACE | `Painting report.xlsx` (immutable baseline) |

Layout changes after sign-off invalidate this record and require a re-run (§8).

---

## 2. How to run the comparison

1. Approve a real batch (or use the seeded `W1G00005572 / FLENDER` fixture) and open
   **Export / print** on `/reports/{batchId}`.
2. In the browser print dialog choose **Save as PDF**, **A4**, **Scale 100 %**,
   margins **Default**, background graphics **ON**, and **Headers and footers OFF**.
   Page numbers are printed by the platform itself — a CSS `@page` running footer —
   so the browser's own footer must stay off (it would add a duplicate page number
   plus the URL/title). See D37. Do this for both formats.
3. Print the same batch's pages from the audited Excel original the same way.
4. Lay the two printouts side by side (or overlay at 50 % opacity) and walk §4–§7
   line by line. Two people: one reads the original, one confirms the platform.
5. Record every mismatch in the **deviation log (§8)** — do not fix in the room.
6. Sign §9 only when every row is ✓ or an accepted deviation.

**Inputs to have on the table:** the two Excel originals, a colour + a **black-and-white**
print of each platform report (grayscale-safe check), and the batch's instrument list.

---

## 3. Resolve before the session (open placeholders)

These are known gaps to settle *before* signing — flagged honestly rather than hidden in the tables:

| # | Item | Current state | Action |
|---|---|---|---|
| P1 | **ST/QC/04 issue date** | ✅ **Resolved** — prints `Not stated` | The source workbook has **no date of release** (audit P-06), so the block mirrors the original instead of inventing one. Client QH may assign a real date at the session (one-line change in `FORMAT_META`). |
| P2 | **Company logo** | Placeholder SVG geometry | **Kept for the session** — supply the client's high-resolution SVG/PNG and drop it in the letterhead slot |
| P3 | **NCR reference on failed rows** | Not printed | Confirm whether the original carries an NCR/DR no. per failed dimension; if yes, add the column |
| P4 | **Sign-off "decision" + signature/stamp space** | Prints Name / Certification / Signed-at | Confirm whether the original needs an explicit decision word and a blank stamp area |
| P5 | **Page count** | ST/QC/02 = 1 page; ST/QC/04 expected **2 pages** | Confirm the original's page split matches |
| P6 | **File name convention** | `STQC02_{item}_{batch}_{YYYYMMDD}.pdf` | Client QMS to confirm or amend (`report-export-spec §7`) |

---

## 4. Global checks — both formats

| # | Element | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| G1 | Page size / orientation | A4 portrait | | |
| G2 | Margins | `@page`: **14 mm top · 12 mm sides · 16 mm bottom** (audited-original binding edge 12.7 mm) | | Confirm against original |
| G3 | Company name | `Simran Technocrats (I) Pvt. Ltd.` | | |
| G4 | Subtitle line | `Inspection Automation & Quality Intelligence Platform` | | Original subtitle to confirm |
| G5 | Typography | IBM Plex Sans (prose) · IBM Plex Mono (all numerics) | | |
| G6 | Grayscale safety | Status = glyph + border, never hue alone | | Print a B/W copy |
| G7 | Multi-page: header row repeats | Table `thead` repeats on every page | | 100-row stress case |
| G8 | Multi-page: no row splits | `break-inside: avoid` on every row | | |
| G9 | Sign-off never orphaned | Sign-off block kept with content | | |
| G10 | Print guard | Only report routes print; other screens show a blocking notice | | Ctrl+P test |

---

## 5. ST/QC/02 — Dimensional Inspection Report

### 5.1 Letterhead & format block

| # | Printed line | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| D1 | Format No. | `ST/QC/02` | | |
| D2 | Rev. No. | `Rev 02` | | |
| D3 | Date (letterhead) | `01-09-23` | | Confirm original issue date |
| D4 | Logo position | Top-left, 40 × 40 px slot | | See P2 |

### 5.2 Title & batch details

| # | Printed line | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| D5 | Document title | `DIMENSIONAL INSPECTION REPORT` (uppercase, centred) | | |
| D6 | Section title | `Batch details` | | |
| D7 | Item code | from batch | | |
| D8 | Drawing no. | from batch (e.g. `9423E`) | | |
| D9 | Revision | from batch (e.g. `A`) | | |
| D10 | Customer | from batch (e.g. `FLENDER`) | | |
| D11 | PO number | from batch | | |
| D12 | Delivery batch | from batch (e.g. `2609-01`) | | |
| D13 | Lot quantity | `<n> pcs` | | Is `pcs` on the original? |
| D14 | Inspection date | from batch | | |

### 5.3 Measurement record table

| # | Column / element | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| D15 | Table heading | `Measurement record` | | |
| D16 | Column order | Sr. · Parameter · Nominal ± tol · Equipment · 01 · 02 · 03 · 04 · 05 · Result | | Column set/order vs original |
| D17 | Sr. | Serial number | | |
| D18 | Parameter | Label + GD&T symbol (e.g. `Ø12 DIM-02`) | | |
| D19 | Reference dimension marker | `(ref)` suffix on the reference row | | |
| D20 | Nominal ± tol | `Nominal ±tolPlus/tolMinus` | | Formatting vs original |
| D21 | Equipment | Instrument code (e.g. `VC-04`) or `—` | | The audit finding this closes |
| D22 | Samples 01–05 | Recorded values or `—` | | |
| D23 | Per-sample highlight | Warn/fail shading on the cell | | Confirm original's convention |
| D24 | Result glyph | `✓` / `!` / `✗` / `—` | | |
| D25 | All rows print | Full row set (no virtualization in print) | | 53 rows; 100-row stress case |
| D26 | Footnote | `✓ within tolerance · ! within 10 % of a limit · ✗ out of tolerance…` | | |
| D27 | Failed rows → NCR ref | **Not printed** | | See P3 |

### 5.4 Remarks, sign-off & footer

| # | Printed line | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| D28 | Rejection history | `Quality Head remarks (history)` — only if a rejection exists | | |
| D29 | Inspector block title | `Inspected by` | | |
| D30 | Inspector — name | from sign-off record | | |
| D31 | Inspector — signed at | `DD Mon YYYY, HH:mm` (24 h, en-IN) | | Format vs original |
| D32 | Quality Head block title | `Checked / approved by — Quality Head` | | |
| D33 | QH — name / signed at | from sign-off record | | |
| D34 | Decision shown? | **Not printed** | | See P4 |
| D35 | Footer line 1 | `ST/QC/02 · Rev 02 · 01-09-23 · ISO 9001 QMS` | | |
| D36 | Footer line 2 | `{batchId[0:8]} · exported YYYY-MM-DD [· ref {auditId[0:8]}]` | | |
| D37 | Page n of m | Printed by a CSS `@page` running footer: `Page {n} of {total}`, bottom-centre of every page | **Automated** — `e2e/print.spec.ts` prints the fixture headlessly and asserts one correctly-numbered footer per page against the real page count (`e2e/pdf-text.ts`) | Chrome 131+ / Edge; other engines omit it (browser-footer fallback) |

---

## 6. ST/QC/04 — Surface Preparation & Protective Coating Report

> Expected **two pages** — confirm the section split lands where the original splits.

### 6.1 Letterhead, title & batch details

| # | Printed line | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| C1 | Format No. | `ST/QC/04` | | |
| C2 | Rev. No. | `Rev 01` | | |
| C3 | Date (letterhead) | `Not stated` | | Mirrors original (no date, P-06) — assign a date if the client prefers |
| C4 | Title | `SURFACE PREPARATION & PROTECTIVE COATING REPORT` | | |
| C5 | Batch details | same 8 fields as D7–D14 | | |

### 6.2 Section A — Surface preparation

| # | Printed line | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| C6 | Section title | `A — Surface preparation` | | |
| C7 | Steel grade | from record | | |
| C8 | Blast method | from record | | |
| C9 | Blast grade | from record (e.g. `Sa 2.5`) | | |
| C10 | Grit size | from record (e.g. `G-40`) | | |
| C11 | Weld / edge dressing (P-2) | `✓ Yes` / `✗ No` | | ISO 8501-3 P-2 |
| C12 | Solvent clean | `✓ Yes` / `✗ No` | | |
| C13 | Water break test | `✓ Yes` / `✗ No` | | Beading = No |
| C14 | Profile (µm) + verdict | value + chip: `✓ 45–75` / `! near 45–75` / `✗ out of 45–75` | | |

### 6.3 Section B — Psychrometric conditions (per coat)

| # | Column / element | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| C15 | Section title | `B — Psychrometric conditions (per coat)` | | |
| C16 | Columns | Coat · Ambient °C · %RH · Steel °C · Dew point °C · ΔT °C · Compliance verdict | | |
| C17 | Dew point | computed (Magnus–Tetens) — never typed | | |
| C18 | ΔT | `Steel − Dew point` | | |
| C19 | Verdict | `✓ APPROVED` / `✗ PROHIBITED at time` | | Prints as RECORDED, not re-judged |
| C20 | No coats | `No coat events recorded` | | Empty-state check |

### 6.4 Section C — Paint batch log

| # | Column / element | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| C21 | Section title | `C — Paint batch log` | | |
| C22 | Columns | Coat · Product · RAL · Part A batch · A mfg · Part B batch · B mfg · Thinner · Viscosity · WFT | | |
| C23 | Viscosity unit | `<n> s` | | |
| C24 | WFT unit | `<n> µm` | | |

### 6.5 Section D — Dry film thickness

| # | Column / element | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| C25 | Section title | `D — Dry film thickness` | | |
| C26 | Inside panel header | `DFT — Inside (<system>, nominal <n> µm)` | | C4 High, 240 µm |
| C27 | Outside panel header | `DFT — Outside (<system>, nominal <n> µm)` | | C3 High, 180 µm |
| C28 | Grid | 26 points, 13 columns × 2 rows per side | | |
| C29 | Out-of-range highlight | Cell shaded when `< 0.8×` or `> 2×` nominal | | |
| C30 | Statistics row | Min · Max · Average · Std dev σ · Verdict | | |
| C31 | ISO verdict text | `ISO 19840 PASS` / `ISO 19840 FAIL` / `MIN 5 READINGS` | | |
| C32 | Stats block never splits | `break-inside: avoid` on the whole panel | | Edge 6.4 |

### 6.6 Section E, sign-off & footer

| # | Printed line | Platform output (as built) | Match ✓/✗ | Notes |
|---|---|---|---|---|
| C33 | Section title | `E — Visual inspection` | | |
| C34 | Defects | Pinholes · Sagging · Gloss loss · Peel-off · Blisters | | |
| C35 | Per-defect verdict | `✓ not present` / `✗ present` | | |
| C36 | Inspector block title | `NACE CIP Level 2 Inspector` | | |
| C37 | Inspector certification | `NACE CIP Level 2` | | |
| C38 | Quality Head block | `Checked / approved by — Quality Head` | | |
| C39 | Footer | same structure as D35–D36 for `ST/QC/04` | | |

---

## 7. Print-engineering checks

| # | Check | Expected | ✓/✗ |
|---|---|---|---|
| E1 | 100-row stress test | Header repeats; no row or stats block splits; page count sane | |
| E2 | Black-and-white print | Every status still readable (glyph + border) | |
| E3 | Ctrl+P on a non-report screen | Blocking notice, no uncontrolled document | |
| E4 | Save-as-PDF file name | Suggests `STQC02_…` / `STQC04_…` | |
| E5 | Zoom 100 % fidelity | No scaling artefacts vs original | |
| E6 | Fonts embedded | IBM Plex renders identically off-machine | |

---

## 8. Deviation log

| # | Report | Element | Original | Platform | Severity | Resolution | Closed |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

*Severity: **A** = blocks acceptance · **B** = must fix before pilot · **C** = cosmetic / backlog.*

---

## 9. Sign-off

By signing, the client Quality Head confirms each printed report matches its audited
original to the standard required by PDF-02 / PDF-03, with only the deviations logged
in §8 outstanding.

| Role | Name | Signature | Date |
|---|---|---|---|
| Client Quality Head | | | |
| Client QC representative | | | |
| Skyrn Studio (builder) | | | |

**File-name convention confirmed:** ☐ as proposed ☐ amended to: ______________________

---

## 10. After sign-off

- The signed PDF (or scan) is filed as the acceptance record for **Phase 6 exit**.
- The Playwright print baselines (`e2e/print.spec.ts`) are re-run to lock the signed
  layout; any future pixel drift then fails the build rather than reaching an auditor.
- Any change to the report layouts re-opens §8 and requires a re-signed copy of this sheet.

---

*One component tree renders both the screen and the paper (report-export-spec §1), so this
sign-off covers the reviewed record and the printed record at once — they cannot diverge.*
