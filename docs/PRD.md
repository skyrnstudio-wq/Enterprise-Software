# Product Requirements Document
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.  
**Vendor / Builder:** Skyrn Studio  
**Version:** 1.1 — Comprehensive Multi-Format Specification  
**Date:** September 14, 2026  
**Status:** 🟡 Pending Client Sign-off  

---

## 1. Purpose & Background

Simran Technocrats is a 40+ year-old precision sheet metal fabricator based in Dombivali, MIDC. They produce deep-drawn and heavy fabricated components (blower housings, fan casings, terminal boxes, end shields, and motor/duct assemblies) for Tier-1 OEM industrial customers, including **FLENDER / WINERGY** (wind turbine gearboxes and industrial drives).

Their manufacturing operations are governed by two audited, critical quality control formats:
1. **Dimensional Inspection Report (`Format No. ST/QC/02, Rev 02`):** Governed under ISO 9001 Quality Management System (QMS). Requires inspecting ~53 critical dimensions across 5 physical samples per production batch.
2. **Surface Preparation & Protective Coating Report (`Format No. ST/QC/04, Rev 01`):** Governed under ISO 12944 (Corrosion protection of steel structures), ISO 8501 (Surface blast cleaning & edge dressing), and NACE/SSPC standards. Includes surface prep, psychrometric environmental monitoring, multi-coat paint logs, and 26-point Dry Film Thickness (DFT) statistical analysis signed by a NACE CIP Level 2 certified inspector.

### The Problem
- **Massive Manual Repetition:** Inspectors manually retype ~50 dimension parameters or 26 DFT readings and chemical batch numbers for every batch, item, and order across dozens of disconnected Excel files.
- **Critical Compliance Risks Discovered:** In existing coating spreadsheets, manual entry of dew points has led to documented records where **substrate temperature is lower than the recorded dew point** ($T_{steel} < T_{dew}$). Under ISO 12944-7 and NACE rules, applying paint under these conditions is strictly illegal and triggers immediate batch rejection during OEM audits.
- **Fragile Excel Workarounds:** Calculating DFT statistics across merged cells required building 26 hidden shadow columns (`AK24:BJ27`) off-screen in Excel, which disconnect upon row/column edits.
- **Broken Formulas & Limits:** Brackets in nominal dimension cells `(2065)` force inspectors to hardcode arithmetic formulas (`=2065-2`), leading to undetected errors (e.g. Nominal 10 having Min 1 and Max 3).
- **Inconsistent Batch Records:** Delivery batch codes diverge between inspection stages (`2604-02` on surface prep vs `2605-02` on final inspection) for the same physical component.
- **Missing Equipment Traceability:** Equipment ID columns are left 100% blank; no calibration tracking exists for DFT gauges or calipers.

### The Desired Outcome
A modern, state-of-the-art **Enterprise Web Application** that digitizes and unifies both dimensional and protective coating inspection workflows:
- Faithfully preserving their audited QMS layouts.
- Eliminating manual repetition through an intelligent Item Master and Batch Autofill.
- Automatically calculating GD&T limits, psychrometric dew points, and DFT statistics.
- Enforcing compliance gates (preventing coating applications when $T_{steel} - T_{dew} < 3^\circ\text{C}$).
- Enforcing calibration traceability and two-person digital sign-off accountability.
- Generating print-ready, audit-compliant PDF inspection reports in seconds.

---

## 2. Goals & Non-Goals

### ✅ In Scope (Core Enterprise Platform)
- **Unified Item / Drawing Master:** Centralized repository for drawing revisions, nominal dimensions, GD&T tolerances, and protective coating specifications (C3/C4 systems, RAL colors, paint products).
- **Dimensional Inspection Module (`Format No. ST/QC/02, Rev 02`):**
  - Robust tolerance parser auto-deriving Min/Max from nominal ± tolerance (handling brackets and symbols like `(2065)` and `Ø12`).
  - Fast 5-sample batch grid with keyboard tabbing, real-time color feedback (Green/Amber/Red), and "Copy to all 5" shortcuts.
  - Relational Equipment ID assignment.
  - Two-person digital sign-off (Inspector + Quality Head) with immutable timestamps.
  - Pixel-perfect PDF generation matching `ST/QC/02, Rev 02`.
- **Industrial Surface Preparation & Protective Coating Module (`Format No. ST/QC/04, Rev 01`):**
  - Surface prep logging (Abrasive blast Sa 2.5, grit G-40, profile 45–75 µm, weld dressing P-2 Grade per ISO 8501).
  - Degreasing & Water Break Test logging (ISO 12944-4).
  - **Automated Psychrometric Dew Point Engine:** Real-time dew point calculation ($T_{dew}$) via Magnus-Tetens formula; active lock-out gate enforcing the **ISO 12944-7 / NACE 3°C Rule** ($T_{steel} - T_{dew} \ge 3.0^\circ\text{C}$).
  - Multi-coat paint & thinner batch log (Primer, Intermediate, PU Finish, batch numbers, manufacturing dates, shelf-life validation).
  - 26-point Dry Film Thickness (DFT) measurement grid for Inside (C4 High) and Outside (C3 High) systems.
  - **Automated DFT Statistical Engine:** Live computation of Min, Max, Average, Standard Deviation, and ISO 19840 (80/200 rule) compliance without shadow cells.
  - Certified NACE CIP Level 2 Inspector + Quality Head sign-off.
  - High-fidelity PDF export matching Flender / Winergy layout.
- **Equipment Calibration Registry:** Traceable logging for Vernier Calipers, Micrometers, DFT Gauges, Profile Gauges, and Thermo-Hygrometers with active/due/expired alerts.
- **Quality Intelligence & NCR Drafting:** 1-click Non-Conformance Report auto-drafting for out-of-tolerance dimensions or environmental violations.

### 🔜 In Scope (Later Phases — Optional Add-ons)
- PO / order header integration with accounting/ERP software (Tally, SAP).
- Vision AI for drawing extraction (dimension table extraction from PDF/CAD drawings).
- Customer-facing self-service inspection report download portal.

### ❌ Out of Scope
- Modifying or altering the client's existing reference Excel files (`Inspection Format.xlsx` and `Painting report.xlsx` remain strictly immutable baseline references).
- Complete ERP, finance, or inventory management.
- Direct IoT/machine sensor hardware integration.

---

## 3. Users & Roles

| Role | Description | Key Actions |
| :--- | :--- | :--- |
| **QC Inspector** | Shop-floor technician conducting dimensional measurements or surface prep checks. | Create batch inspection, enter measurements, verify environmental conditions, save drafts, submit for review. |
| **NACE Coating Inspector** | Certified coating specialist (e.g. NACE CIP Level 2). | Conduct surface prep, log paint batches/WFT, enter DFT readings, verify psychrometric compliance, digitally sign coating reports. |
| **Quality Head** | Senior QC authority with ultimate sign-off responsibility under ISO 9001. | Review submitted batches, reject with revision comments, execute final digital sign-off, trigger NCRs, view historical audits. |
| **Admin** | System configuration manager (Power User or Skyrn Studio). | Manage Item Master catalog, coating specs, drawing revisions, instrument calibration registry, user accounts. |

---

## 4. Core Functional Requirements

### 4.1 Unified Item / Drawing Master

| Requirement ID | Requirement Description |
| :--- | :--- |
| **IM-01** | Admin can create an Item Master record containing: Drawing Number (e.g. `A5E46224446 / WY000_9423E`), Item Code (`W1G00005572`), Description (`Spiral Air Duct Cap`), Customer (`FLENDER / WINERGY`), and Drawing Revision. |
| **IM-02** | Each Item Record stores an ordered list of Dimension Rows (up to 100+), each with: Serial No., Parameter Label, Nominal Value, Tolerance (+/-), and GD&T Symbol (linear, $\varnothing$, angle, runout). |
| **IM-03** | **Automated GD&T Tolerance Parser:** The system automatically cleans strings like `(2065)`, `Ø12`, `100°`, extracts numeric nominals, and derives exact Min and Max limits. Min and Max are read-only and enforce $Min \le Nominal \le Max$. |
| **IM-04** | Each Item Record can optionally attach a **Protective Coating Specification**: Substrate material (`MS Sheet Fabrication`), Blast profile (`45–75 µm`), Paint systems (Inside C4 High, Outside C3 High), Paint products (`Hempadur Quattro 22090/17634`, `Hempathane HS 55610`), RAL colors, and Nominal DFT targets. |
| **IM-05** | When a drawing revision updates, the Admin creates a new Revision record. Prior inspection records remain immutably linked to the revision under which they were inspected. |
| **IM-06** | Items are instantly searchable and filterable by Item Code, Drawing Number, Customer, or Description. |

---

### 4.2 Dimensional Inspection Module (`Format No. ST/QC/02, Rev 02`)

| Requirement ID | Requirement Description |
| :--- | :--- |
| **DIM-01** | Inspector selects an Item from the master catalog; the system automatically pre-populates all ~53 dimension rows, nominal values, tolerances, and derived Min/Max limits. |
| **DIM-02** | Inspector enters batch header metadata: PO Number, Delivery Batch Code, Date, and Lot Quantity. |
| **DIM-03** | Grid renders all dimension rows with 5 sample value cells (`01–05`). Keyboard navigation allows moving horizontally via `Tab` and vertically via `Enter`. |
| **DIM-04** | **Instant Real-Time Color Highlighting:**<br>• 🟢 **Green:** Value is strictly within Min/Max limits.<br>• 🟡 **Amber:** Value is within 10% of either tolerance edge ("Approaching Limit" warning for tool wear).<br>• 🔴 **Red:** Value breaches Min or Max tolerance. |
| **DIM-05** | **Batch Quick-Fill Actions:** "Copy to all 5" action copies sample 01 to samples 02–05 for identical readings or GO/NO-GO thread plug gauge checks (`M10`). "Fill Nominal" shortcut enables rapid testing. |
| **DIM-06** | **Instrument Assignment:** Each row requires selecting a calibrated Instrument ID (e.g. `VC-04`, `MC-02`). Inspectors can bulk-apply an instrument across all linear rows in one click. |
| **DIM-07** | Draft inspections auto-save every 30 seconds to prevent data loss during shop-floor shifts. |

---

### 4.3 Surface Preparation & Protective Coating Module (`Format No. ST/QC/04, Rev 01`)

| Requirement ID | Requirement Description |
| :--- | :--- |
| **COAT-01** | **Surface Prep & Degreasing Logging:** Inspector records steel grade (`MS Sheet Fabrication`), visual weld/edge smoothness per ISO 8501-3 P-2 Grade, organic solvent cleaning per ISO 12944-4, and Water Break Test result (Beading = Fail, Clean = Pass). |
| **COAT-02** | **Abrasive Blasting Logging:** Records method (`Abrasive Blast Cleaning`), grade achieved (`Sa 2.5` per ISO 8501-1), grit size (`G-40`), and surface profile (`Medium / 45–75 µm` via comparator G). |
| **COAT-03** | **Automated Psychrometric Dew Point Engine:**<br>• System accepts Ambient Temperature ($^\circ\text{C}$), Relative Humidity ($\%RH$), and Substrate / Steel Temperature ($^\circ\text{C}$).<br>• System automatically calculates true Dew Point ($T_{dew}$) using the Magnus-Tetens psychrometric equation.<br>• Calculates compliance margin $\Delta T = T_{steel} - T_{dew}$.<br>• **ISO 12944-7 Safety Lock:** If $\Delta T < 3.0^\circ\text{C}$, the system triggers a red alert: *"APPLICATION PROHIBITED: Substrate is less than 3°C above dew point (Condensation Risk)"*, preventing coating sign-off. |
| **COAT-04** | **Multi-Coat Paint Batch Log:** Tracks individual coat layers (1st Coat Primer, 2nd Coat Intermediate, 3rd Coat Polyurethane Finish). For each coat, logs Product Name, RAL Color, Part A Batch No., Part A Mfg Date, Part B Hardener Batch No., Part B Mfg Date, Thinner No., Thinner Batch No., Viscosity (seconds), and Wet Film Thickness (WFT: $80 \sim 100\ \mu\text{m}$). |
| **COAT-05** | **26-Point Dry Film Thickness (DFT) Grid:** Dedicated multi-point measurement grid capturing 26 readings for Inside (C4 High: 240 µm nominal, 192–480 µm range) and 26 readings for Outside (C3 High: 180 µm nominal, 144–360 µm range). |
| **COAT-06** | **Automated DFT Statistical Engine:** Real-time calculation of **Min, Max, and Average DFT**, and verification against **ISO 19840 (80/200 rule)**. Automatically highlights any reading $< 80\%$ of nominal or $> 200\%$ of nominal without any off-screen shadow formulas. |
| **COAT-07** | **Visual Coating Sign-Off:** Qualitative verification confirming coating is free of pinholes, sagging, gloss-loss, peel-off, and blisters. |

---

### 4.4 Instrument & Calibration Registry

| Requirement ID | Requirement Description |
| :--- | :--- |
| **EQ-01** | Admin maintains a master registry of all measuring instruments across dimensional and coating departments: Instrument ID, Description, Make/Model, Range, Last Calibration Date, Calibration Interval (months), and Next Due Date. |
| **EQ-02** | System computes status automatically: **Active** (Green), **Due Soon** within 15 days (Amber), and **Expired** (Red). |
| **EQ-03** | When entering batch data, if an expired instrument is selected, the system flags a mandatory acknowledgement warning that must be approved by the Quality Head. |
| **EQ-04** | **Audit Recall Query:** One-click search by Instrument ID instantly retrieves every dimensional or coating inspection report where that specific gauge was used, satisfying ISO surveillance audit traceability. |

---

### 4.5 Dual Digital Sign-Off & Accountability Gate

| Requirement ID | Requirement Description |
| :--- | :--- |
| **SO-01** | On completing an inspection batch, the Inspector submits the report. Their name, role (e.g. `K Deshpande, NACE CIP Level 2`), and submission timestamp are immutably recorded. |
| **SO-02** | The Quality Head reviews the submission. Any out-of-tolerance dimensions, environmental warnings, or expired instrument alerts are prominently flagged. |
| **SO-03** | The Quality Head can: (a) **Approve** — recording digital signature and timestamp, locking the batch record permanently; or (b) **Reject** — with mandatory revision comments, returning the batch to draft status. |
| **SO-04** | Once approved, no user (including Admins) can modify the inspection data through the application UI. The database record is completely immutable. |

---

### 4.6 Audit-Ready High-Fidelity PDF Generation

| Requirement ID | Requirement Description |
| :--- | :--- |
| **PDF-01** | Approved batches can generate official PDF reports on demand. |
| **PDF-02** | **Dimensional Inspection Report:** PDF layout pixel-matches `Format No. ST/QC/02, Rev 02` with company letterhead, drawing details, 5-sample measurement grid, and dual sign-off blocks. |
| **PDF-03** | **Painting & Protective Coating Report:** PDF layout pixel-matches the audited Flender/Winergy format with surface prep checklist, psychrometric records, paint batch details, 26-point DFT summary, and NACE Level 2 certification blocks. |
| **PDF-04** | Format numbers, revision levels, and issue dates are printed on report footers as required by ISO 9001 / OEM documentation control. |

---

### 4.7 Non-Conformance (NCR) Auto-Drafting

| Requirement ID | Requirement Description |
| :--- | :--- |
| **NCR-01** | When any sample measurement breaches tolerance, or when an environmental violation occurs, a **"Draft NCR"** action becomes available. |
| **NCR-02** | Auto-populates an official Non-Conformance Report containing: Batch reference, component ID, drawing revision, failing dimension/parameter, nominal limit, actual value, equipment used, and operator name. |
| **NCR-03** | Quality Head can assign disposition (Rework, Scrap, Concession / Use-As-Is) and record corrective/preventive actions (CAPA). |

---

## 5. Non-Functional & Shop-Floor Requirements

| Category | Requirement Specification |
| :--- | :--- |
| **Performance** | Grid must render up to 100 dimension rows and 52 DFT points with sub-100ms response time during keyboard input. |
| **Reliability** | State autosaves to browser `localStorage` continuously; zero data loss on browser refresh or accidental tab closure. |
| **Design Aesthetics** | State-of-the-art industrial user interface using pure Vanilla CSS. High-contrast typography (Google Fonts Inter/Outfit), subtle glassmorphism cards, accessible status indicators, and responsive layout. |
| **Data Integrity** | Strict typing for numbers; automated tolerance validation ($Min \le Nom \le Max$); automated psychrometric physics calculations. |
| **Print Fidelity** | Dedicated `@media print` stylesheets ensuring exact A4 page breaks, clear table borders, and high-resolution logo reproduction for client audits. |

---

## 6. Resolved Open Questions & Strategic Answers

Based on our forensic audit of the reference files, the open questions have been conclusively resolved:

1. **Which OEM customers receive these reports?**  
   *Resolved:* **FLENDER / WINERGY** (wind turbine drive manufacturer) is confirmed as a major Tier-1 customer for components like the Spiral Air Duct Cap (`A5E46224446 / WY000_9423E`).
2. **What other inspection formats exist?**  
   *Resolved:* In addition to `ST/QC/02` (Dimensional), the second core format is **Surface Preparation & Protective Coating (`ST/QC/04`)**, fully audited from `Painting report.xlsx`.
3. **What is the root cause of the Dew Point error?**  
   *Resolved:* Inspector typed `29.2°C` while steel was `28.8°C`, creating a documented ISO 12944 non-conformance. Actual calculated dew point was `24.1°C`. The software will auto-compute dew points to eliminate this risk permanently.
4. **How are batch numbers structured?**  
   *Resolved:* Formats like `ST-A5E46224446-2603-AQ` and delivery batch codes like `2604-02` track year/month/lot sequences. The system will unify batch headers so stages never diverge.

---

## 7. Acceptance Criteria

The enterprise web application is considered production-ready when:
1. An Admin can select or create an Item Master record for both Dimensional and Coating inspection workflows.
2. An Inspector can enter dimensional measurements across 5 sample columns with instant 🟢/🟡/🔴 tolerance feedback.
3. Entering Ambient Temp and %RH auto-calculates Dew Point, and entering a steel temperature within $3^\circ\text{C}$ of dew point triggers an immediate compliance warning.
4. Entering 26 DFT readings auto-computes Min, Max, Average, and ISO 19840 compliance without helper formulas.
5. An Instrument ID is linked to every inspection row, and expired instruments trigger audit warnings.
6. The Inspector and Quality Head can complete digital dual sign-offs with immutable timestamps.
7. Both Dimensional (`ST/QC/02`) and Protective Coating (`ST/QC/04`) reports generate high-fidelity, print-ready PDFs indistinguishable from audited customer standards.
