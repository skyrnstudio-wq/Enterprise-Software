# Simran Technocrats — Inspection Workbooks Audit & Pain Points Analysis
**Document Type:** Technical Quality Audit & Software Automation Blueprint  
**Author:** Skyrn Studio  
**Date:** September 14, 2026  
**Reference Files Audited:**  
1. `Inspection Format.xlsx` (`Format No. ST/QC/02, Rev 02` — Dimensional Inspection Report)  
2. `Painting report.xlsx` (Surface Preparation & Industrial Coating Report — Flender / Winergy)  

---

## 1. Executive Summary

A comprehensive forensic audit of the two quality inspection workbooks currently used by **Simran Technocrats (I) Pvt. Ltd.** reveals deep systemic risks in their existing Excel-based workflows. 

While the company possesses over **40 years of precision engineering pedigree** and produces critical components for world-class OEMs like **FLENDER / WINERGY** (wind turbine gearboxes and industrial drives), their quality documentation is severely bottlenecked by:
- **Catastrophic compliance vulnerabilities** in protective coating documentation (recorded dew points violating international ISO 12944 standards on paper due to manual math/transcription errors).
- **Extreme formula fragility** (inspector created 26 hidden shadow columns to bypass merged-cell limitations when calculating DFT statistics).
- **Massive manual repetition** across dimension rows, paint logs, and batch headers.
- **Broken formulas and text-formatting workarounds** across dimensional inspection sheets.
- **Data integrity discrepancies** between consecutive inspection stages of the same physical component.

This document breaks down every pain point, calculation flaw, and compliance exposure uncovered across both files, followed by the exact software automation solution that eliminates them.

---

## 2. Deep Audit: `Painting report.xlsx`

### Overview of Workbook Structure
The workbook contains three distinct sheets representing different stages of protective coating application:
1. **`01 (SP+1)`**: Surface Preparation & 1st Coat Application.
2. **`03 (DFT Final)`**: Dry Film Thickness (DFT) & Final Visual Inspection (Note: Sheet `02` for intermediate coat is missing).
3. **`COATING DATA`**: Process log tracking environmental conditions, paint batches, manufacturing dates, and thinners across 1st, 2nd, and 3rd coats.

Component Audited: **Spiral Air Duct Cap**  
Drawing Number: **`A5E46224446 (WY000_9423E)`**  
Customer / Project: **FLENDER / WINERGY**  
Piece Identification: **`ST-A5E46224446-2603-AQ`**  
Inspector: **K Deshpande (NACE CIP Level 2 certified)**  

---

### Pain Point P-01: 🚨 Critical Compliance Violation — Substrate vs. Dew Point ($T_{steel} < T_{dew}$)

- **Locations:** Sheet `01 (SP+1)` Row 20 and Sheet `COATING DATA` Row 5.
- **Recorded Data:**
  - Ambient Temperature: **`30.2°C`**
  - Relative Humidity (%RH): **`69.8%`**
  - Substrate / Steel Temperature: **`28.8°C`**
  - Recorded Dew Point: **`29.2°C`**
- **The Regulatory Failure:**
  Under **ISO 12944-7** (Corrosion protection of steel structures — Part 7: Execution and supervision of paint work) and **NACE/SSPC** standards:
  $$\mathbf{T_{steel} \ge T_{dew} + 3.0^\circ\text{C}}$$
  Paint application is **strictly forbidden** unless the steel temperature is at least **3.0°C above the dew point** of the ambient air. This prevents microscopic moisture condensation on the blasted steel, which causes flash rust, loss of adhesion, and catastrophic coating blistering.
  
  In the audited record:
  $$\text{Margin} = T_{steel} - T_{dew} = 28.8^\circ\text{C} - 29.2^\circ\text{C} = \mathbf{-0.4^\circ\text{C}}$$
  **The steel temperature was recorded as colder than the dew point.** On paper, this is an immediate, batch-rejecting audit non-conformance for Flender/Winergy.
- **The True Physics & Root Cause:**
  Using the internationally recognized Magnus-Tetens psychrometric formula:
  $$\alpha(T, RH) = \frac{17.27 \times T}{237.7 + T} + \ln\left(\frac{RH}{100}\right)$$
  $$T_{dew} = \frac{237.7 \times \alpha}{17.27 - \alpha}$$
  For $T = 30.2^\circ\text{C}$ and $RH = 69.8\%$:
  $$\mathbf{T_{dew}^{\text{actual}} = 24.06^\circ\text{C}}$$
  The actual margin was:
  $$\text{Actual Margin} = 28.8^\circ\text{C} - 24.06^\circ\text{C} = \mathbf{+4.74^\circ\text{C}} \quad (\ge 3.0^\circ\text{C} \implies \text{PASS!})$$
  **Diagnosis:** The physical conditions were fully compliant, but the inspector made a manual entry or transcription error (likely mistyping `24.2` as `29.2`, or guessing without psychrometric tables). By typing the wrong number into Excel, they created an official quality record that fails an ISO/NACE audit.
- **Secondary Occurrence in `COATING DATA` (Row 7 — 3rd Coat):**
  - Ambient: `31.5°C`, %RH: `74.2%`, Steel: `30.9°C`.
  - Recorded Dew Point: `28.9°C` $\implies$ Margin $= 30.9 - 28.9 = \mathbf{2.0^\circ\text{C}}$ ($< 3.0^\circ\text{C}$, failing the standard).
  - True Psychrometric Dew Point: **`26.33°C`** $\implies$ True Margin $= \mathbf{4.57^\circ\text{C}}$ (fully compliant).
- **Software Solution:**
  The web app auto-computes $T_{dew}$ in real time from Ambient Temp and %RH using the Magnus-Tetens formula. The inspector never types the dew point. If $T_{steel} - T_{dew} < 3.0^\circ\text{C}$, the system locks the submit button and displays a high-visibility warning.

---

### Pain Point P-02: Delivery Batch Discrepancy Across Inspection Stages

- **Locations:** Sheet `01 (SP+1)` cell `U2` vs. Sheet `03 (DFT Final)` cell `U2`.
- **Recorded Data:**
  - Sheet `01` Delivery Batch: **`2604-02`** (April 2026, Lot 02)
  - Sheet `03` Delivery Batch: **`2605-02`** (May 2026, Lot 02)
  - Component ID: `ST-A5E46224446-2603-AQ` (identical on both sheets)
- **The Impact:**
  Because the surface preparation occurred on `21.04.2026` and final inspection occurred on `02.05.2026`, the inspector updated the delivery batch code on Sheet 03 to reflect the month of May (`2605`), but left Sheet 01 with the April code (`2604`).
  In a formal customer quality audit, these two sheets cannot be reconciled as belonging to the same delivery lot.
- **Software Solution:**
  Header metadata is stored at the **Batch Record level**, not copied sheet-by-sheet. All inspection stages (surface prep, coating logs, DFT) inherit the immutable batch reference automatically.

---

### Pain Point P-03: The 26-Column Shadow Cell Workaround for DFT Statistics

- **Location:** Sheet `03 (DFT Final)`, rows 24–27.
- **The Problem:**
  - 26 DFT readings are taken for the Inside surface (C4 High system: 240 µm nominal, 192–480 µm allowable range).
  - 26 DFT readings are taken for the Outside surface (C3 High system: 180 µm nominal, 144–360 µm allowable range).
  - In Excel, each reading is displayed in a 2-cell merged column (`D24:E24`, `F24:G24`, `H24:I24`, ..., `AB24:AC24` across two rows).
  - Because Excel's native `=MIN()` and `=AVERAGE()` functions behave unpredictably when applied across multi-row merged ranges containing blank merged cells, the inspector could not use `=MIN(D24:AB25)`.
- **The Fragile Workaround Discovered in the Sheet:**
  - The inspector manually created **26 shadow helper cells** hidden off-screen to the right in columns `AK` to `BJ` (columns 37 to 62):
    - `AK24: =D24`, `AL24: =F24`, `AM24: =H24`, ..., `AW24: =AB24` (Row 24 readings)
    - `AX24: =D25`, `AY24: =F25`, `AZ24: =H25`, ..., `BJ24: =AB25` (Row 25 readings)
  - Then in cells `AD25`, `AF25`, and `AH25`, they evaluated:
    - `AD25: =MIN(AK24:BJ24)` $\implies 255$
    - `AF25: =MAX(AK24:BJ24)` $\implies 325$
    - `AH25: =AVERAGE(AK24:BJ24)` $\implies 291.15$
  - They repeated the exact same shadow hack for rows 26–27 (`AK26:BJ26`).
- **The Risk:**
  - If any row or column is inserted, deleted, or shifted, these 52 off-screen formulas disconnect quietly, returning corrupted MIN/MAX/AVG values without any error message.
- **Software Solution:**
  The web app receives the 26 raw numeric values in an array and computes Min, Max, Average, Standard Deviation, and ISO 19840 compliance instantly in memory, rendering clean statistics without any spreadsheet workarounds.

---

### Pain Point P-04: Hardcoded Formulas vs. Dynamic Functions

- **Location:** Sheet `03 (DFT Final)` cell `Y11` vs. `Y16`.
- **Details:**
  - Row 16 (C3 High System Total DFT): Calculated via formula `=SUM(Y14:AA15)` $\implies 180$ µm.
  - Row 11 (C4 High System Total DFT): **Hardcoded to `240`**. No formula is present.
- **The Risk:**
  If the engineering spec for any individual coat in the C4 system is modified (e.g. primer increased from 60 µm to 80 µm), row 11 will still display `240` instead of updating to `260`, producing an erroneous report.
- **Software Solution:**
  Coating systems are defined as structured data (array of coats with nominal and range limits). Totals and cumulative ranges are always computed dynamically.

---

### Pain Point P-05: Typos, Missing Fields & Copy-Paste Errors

- **Product Typo:** Sheet `01 (SP+1)` cell `A23` writes `"Hempel Quattor 22090"` (missing "u", should be `Hempadur Quattro 22090`).
- **Missing Color:** Sheet `01` cell `K23` leaves the `Color` column completely blank for the 1st coat (should be `Beige / RAL 22090`).
- **Brand Name Copy-Paste Error:** Sheet `03 (DFT Final)` rows 8 and 14 list the brand name for `RAL 22090` primer as `Hempadur Quattro 17634`. `17634` is the intermediate coat (grey); the primer is `22090`. The inspector simply dragged down the text from row 9 without correcting it.
- **Overcrowded Scope:** Sheet `01` is titled *"SURFACE PREPARATION & 1ST COAT APPLICATION"*, but rows 23–27 list all three coats (Primer, Intermediate, Topcoat) in the 1st coat table, while Viscosity (`29 sec`) and WFT (`80 ~ 100 mic`) in row 28 only provide one value without indicating which coat they belong to.
- **Software Solution:**
  Item and Coating Masters store pre-validated product names, RAL color codes, and nominal WFT/DFT specifications. Inspectors select products from approved dropdowns, eliminating retyping and copy-paste errors.

---

### Pain Point P-06: Missing QMS Document Control & Unsigned Reports

- **No Controlled Document Reference:**
  Unlike `Inspection Format.xlsx` which has `FORMAT NO.-ST/QC/02, REV 02`, `Painting report.xlsx` has **no controlled format number, revision number, or date of release** anywhere in the header or footer.
- **Missing Sign-off:**
  The `Checked by -` block in Sheet `01` (cell `X33`) and Sheet `03` (cell `X32`) is **completely blank**. There is no Quality Head verification or sign-off timestamp.
- **Missing Stage:**
  The sheets are named `01 (SP+1)` and `03 (DFT Final)`. Sheet `02` is absent, leaving the intermediate coat verification undocumented in the formal report structure.
- **Software Solution:**
  Enforce two-person digital sign-off gates with immutable timestamps, print standardized QMS format headers/footers (`Format No. ST/QC/04, Rev 01`), and provide complete multi-stage traceability.

---

### Pain Point P-07: Zero Instrument Calibration Traceability

- **The Issue:**
  While the dimensional inspection sheet has an `EQUIPMENT ID` column, the painting report contains **no field to record the serial numbers or calibration IDs** of:
  - Digital DFT gauge (e.g. Elcometer 456 / DeFelsko PosiTector 6000)
  - Surface profile gauge / comparator
  - Digital thermo-hygrometer / psychrometer
  - Surface contact thermometer
- **The Risk:**
  If a DFT gauge is later found to be out of calibration during an ISO surveillance audit, Simran Technocrats cannot identify which batches were inspected with that instrument, creating massive product recall exposure.
- **Software Solution:**
  The web app includes an integrated Equipment Registry that requires selecting calibrated instruments for all surface prep and DFT measurements.

---

## 3. Deep Audit: `Inspection Format.xlsx` (`Format No. ST/QC/02, Rev 02`)

Component Audited: **AIR DUCT CAP**  
Drawing Number: **`W1G00005572A`**  
Item Code: **`W1G00005572`**  
Format Control: **`FORMAT NO.-ST/QC/02, REV.NO.-02, DATE-01-09-23`**  

---

### Pain Point D-01: Text Characters in Dimension Cells Breaking Excel Math

- **The Problem:**
  Many engineering drawings denote reference dimensions in brackets (e.g., `(2065)`, `(1032.5)`, `(136.5)`, `(1408.2)`, `(1305)`, `(218.5)`) or with GD&T symbols (e.g., `Ø12`, `Ø25`, `100°`).
  When these values are entered into Excel's `REQ. DIM.` column (Column B), Excel treats them as **text strings**, not numbers.
- **The Broken Formulas:**
  Applying a formula like `=B8-2` to `(2065)` immediately returns a `#VALUE!` error.
- **The Dangerous Manual Workaround:**
  To bypass the error, inspectors manually typed hardcoded arithmetic directly into the Min and Max formula bars:
  - Row 8: `E8: =2065-2`, `F8: =2065+2`
  - Row 9: `E9: =1032.5-1.2`, `F9: =1032.5+1.2`
  - Row 30: `E30: =136.5-0.5`, `F30: =136.5+0.5`
  - Row 48: `E48: =1408.2-1.2`, `F48: =1408.2+1.2`
  - Row 56: `E56: =12-0.2`, `F56: =12+0.2`
  - Row 60: `E60: =25-0.2`, `F60: =25+0.2`
- **The Consequence:**
  If an engineering revision updates a dimension, the Min and Max cells **do not update** because they reference hardcoded values instead of cell `B8`.
- **Software Solution:**
  The web app includes an automated Tolerance Parser that extracts the numeric nominal value regardless of formatting (stripping brackets, `Ø`, `R`, degrees) and auto-derives exact Min and Max limits.

---

### Pain Point D-02: Erroneous Limits Entered Manually

- **Location:** Row 10 (Dimension Sr. No. 3).
- **The Issue:**
  - `REQ. DIM.` (Nominal): **`10`**
  - `Min`: **`1`**
  - `Max`: **`3`**
- **The Problem:**
  If the nominal dimension is `10`, a Min of `1` and Max of `3` is physically impossible. This was clearly a transcription typo made when setting up the sheet that remained undetected in the Excel template for years.
- **Software Solution:**
  Rules enforce that $Min \le Nominal \le Max$. Any inversion triggers an automated schema validation error before the Item Master can be saved.

---

### Pain Point D-03: Zero Real-Time Pass/Fail Validation

- **The Problem:**
  The 5 sample columns (`01–05`) contain no conditional formatting. Inspectors type physical measurements by hand without visual feedback. If a measurement falls outside tolerance (e.g., 2068 mm when max is 2067 mm), it looks visually identical to an in-spec measurement.
- **The Risk:**
  Rejections are only caught during post-inspection manual review by the Quality Head, or worse, discovered by the OEM customer upon receipt of goods.
- **Software Solution:**
  Instant, real-time color feedback as measurements are entered:
  - 🟢 **Green:** Within tolerance band.
  - 🟡 **Amber:** Within 10% of tolerance limit (early warning for tool/fixture wear).
  - 🔴 **Red:** Out of tolerance.

---

### Pain Point D-04: Unmanaged Instrument ID Column

- **The Problem:**
  Column L (`EQUIPMENT ID`) exists on the sheet, but across all 53 dimensions in `W1G00005572`, **every single cell is completely blank**.
- **The Root Cause:**
  Typing equipment IDs like `VC-04` or `MC-02` by hand 53 times per batch is too tedious for shop-floor technicians under production pressure, so it gets skipped entirely.
- **Software Solution:**
  Default instrument types are defined in the Item Master per dimension. During batch entry, inspectors can assign an instrument to all linear dimensions with a single click ("Bulk Apply Vernier Caliper VC-04").

---

## 4. Comprehensive Comparison Matrix: Excel vs. Enterprise Web App

| Capability | Current Excel Reality | Future Enterprise Web App |
| :--- | :--- | :--- |
| **Dew Point Calculation** | Manually entered; recorded as $29.2^\circ\text{C}$ ($> T_{steel}$), violating ISO 12944-7. | Auto-computed via Magnus-Tetens formula; active lock prevents painting if $\Delta T < 3^\circ\text{C}$. |
| **DFT Statistics** | 26 fragile shadow helper cells (`AK24:BJ27`) hidden off-screen to compute MIN/MAX/AVG. | Instant in-memory computation of Min, Max, Avg, and ISO 19840 80/200 rule compliance. |
| **Tolerance Limits** | Text in cells `(2065)` forces hardcoded math `=2065-2` in formulas; typos like Nominal 10 $\rightarrow$ Min 1 / Max 3. | Intelligent GD&T parser auto-cleans symbols and derives Min/Max automatically; enforces $Min \le Nom \le Max$. |
| **Sample Data Entry** | 5 sample columns typed manually without visual validation; no keyboard shortcuts. | Full keyboard navigation (`Tab` / `Enter`), real-time 🟢/🟡/🔴 highlighting, "Copy to all 5" for repeat checks. |
| **Equipment Traceability** | `EQUIPMENT ID` column left 100% blank; no coating gauge tracking. | Relational registry with calibration expiry alerts; bulk instrument apply across dimensions. |
| **Batch Discrepancy** | Batch numbers diverge between stages (`2604-02` vs `2605-02`). | Single immutable batch record inherited across all inspection stages. |
| **Sign-Off & Accountability** | Unsigned `Checked by` fields; static typed names; unversioned painting sheets. | Role-based digital dual sign-off with immutable timestamps and controlled QMS headers/footers. |
| **Time Spent Per Batch** | ~45 to 60 minutes of repetitive retyping, manual tolerance checking, and formatting. | **Under 5 minutes** per batch using pre-populated masters and batch autofill. |

---

## 5. Architectural Blueprint for the Web Application

To resolve these pain points without disrupting the client's established operational cadence, the software must be built around four core architectural modules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SIMRAN TECHNOCRATS QC PORTAL                          │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│   DIMENSIONAL QC     │     COATING QC       │         ITEM MASTER           │
│ (Format ST/QC/02)    │ (Format ST/QC/04)    │ (Drawings, Nominals, Systems) │
├──────────────────────┴──────────────────────┴───────────────────────────────┤
│                        SHARED CORE ENGINES                                  │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 1. Psychrometric Engine: T_amb, %RH -> T_dew -> ISO 12944 3°C Rule Gate │ │
│ │ 2. GD&T Tolerance Parser: Cleans (Nominal) ± Tol -> Auto Min / Max      │ │
│ │ 3. DFT Statistics Engine: 26-pt Array -> Min, Max, Avg, ISO 19840 Rule  │ │
│ │ 4. Equipment Registry: Traceable IDs & Calibration Expiry Alerts        │ │
│ │ 5. Dual Sign-Off Engine: Inspector + Quality Head Immutable Timestamps  │ │
│ │ 6. High-Fidelity PDF Engine: Generates Pixel-Perfect Client Formats     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

This blueprint delivers an airtight quality management platform that protects Simran Technocrats during OEM surveillance audits while saving hundreds of hours of manual paperwork each month.
