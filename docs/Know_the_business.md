# Simran Technocrats — Client Discovery & Domain Guide

**Target Client:** Simran Technocrats (I) Pvt. Ltd. ([simrantechnocrats.com](http://www.simrantechnocrats.com/))  
**Document Type:** Client Strategy, QC Domain Intelligence & Positioning Notes  
**Audited Workflows:**
1. **Dimensional Inspection Report:** `Format No. ST/QC/02, Rev 02` (ISO 9001 QMS Controlled)
2. **Protective Coating & Painting Report:** `Format No. ST/QC/04, Rev 01` (ISO 12944 / NACE CIP Level 2 Compliant — Audited for OEM Client **FLENDER / WINERGY**)

---

## 1. Executive Summary: Know the Business

Simran Technocrats has been fabricating precision sheet metal parts since **1981**. It is a **40+ year-old, family-run engineering operation** founded by a mechanical engineer—not a tech startup, nor a small roadside job shop.

### Core Capabilities & Products
- **Manufacturing Processes:** Deep drawing, heavy/sheet fabrication, certified welding (MIG / TIG / Spot), shot blasting, and industrial protective coating.
- **OEM Components:** Blower housings, fan casings, terminal boxes, end shields, and precision motor/drive components.
- **Key Tier-1 OEM Client Identified:** **FLENDER / WINERGY** (global wind turbine gearbox and industrial drive manufacturer, formerly Siemens Flender). Component audited: **Spiral Air Duct Cap** (`A5E46224446 / WY000_9423E`).

> [!IMPORTANT]
> **Consultative Mindset & Framing:**  
> Their website highlights **"40+ years of engineering"** and a proud mantra of **"We can do it, and do it better."** They take deep pride in their craftsmanship, engineering heritage, and longevity.  
> **Always lead with respect for their operational pedigree.** Never frame the proposal as *"let's fix your outdated, messy Excel files."* Frame it as: *"Let's give your proven inspection workflow a software tool that matches the caliber of your engineering and protects you during OEM audits."*

---

## 2. Deconstructing the Controlled QC Formats

> [!WARNING]
> **Do not propose redesigning these formats casually.**  
> In manufacturing QC, these are **Controlled Documents** under their Quality Management System (QMS) and customer supply contracts. Any change to field names, order, or visual layout triggers formal management sign-off, internal audit review, and a document revision bump.

### A. Dimensional Inspection Format (`Format No. ST/QC/02, Rev 02`)

| Feature in Form | What It Actually Means | Why It Matters for Software Design |
| :--- | :--- | :--- |
| **Controlled Format No. & Rev** | Document is audited under ISO 9001 QMS standards. | The digital and exported PDF outputs must match their existing layout with pixel fidelity. Always ask who owns document control before altering fields. |
| **Nominal ± Tolerance $\rightarrow$ Min / Max** | Standard GD&T practice: engineering drawings define acceptable bands, not single points. | The software should auto-calculate Min/Max limits upon entering nominal and tolerances (stripping brackets like `(2065)` and `Ø12`), eliminating manual math errors. |
| **5 Sample Columns (01–05)** | Batch / lot sampling protocol (measuring 5 physical parts per lot, not just a single "golden unit"). | The grid requires 5 distinct measurement entry points per dimension row with keyboard tabbing support and real-time pass/fail/warning color feedback. |
| **Equipment ID per Dimension** | Calibration traceability instrument logging (e.g., Vernier Caliper `VC-04`, Micrometer `MC-02`). | If an instrument fails calibration later, auditors need to trace every inspection report where it was used. Support bulk-applying instrument IDs across rows. |
| **Dual Sign-Off (Inspector + Quality Head)** | Two-person accountability gate required for ISO compliance. | Maintain distinct digital signatures, approval states, and immutable timestamps. Do not flatten this into a single "Approved" checkbox. |

### B. Surface Preparation & Protective Coating Format (`Format No. ST/QC/04, Rev 01`)

Audited from Flender/Winergy production run (`ST-A5E46224446-2603-AQ`):

| Feature in Form | What It Actually Means | Why It Matters for Software Design |
| :--- | :--- | :--- |
| **Surface Prep Grade (ISO 8501-1 / 8501-3)** | Abrasive blast cleaning to **Sa 2.5** (near-white metal), grit G-40, profile 45–75 µm; edge/weld dressing to **P-2 Grade**. | Form requires logging surface preparation method, grit size, surface comparator profile, and visual weld smoothness. |
| **Degreasing & Water Break Test** | Organic solvent cleaning per ISO 12944-4; water break test confirms absence of oil/hydrocarbons (Clean = no beading). | Pass/fail qualitative checklist fields with standard terminology. |
| **Psychrometric Dew Point Rule ($T_{steel} \ge T_{dew} + 3^\circ\text{C}$)** | Under ISO 12944-7 & NACE, steel must be $\ge 3^\circ\text{C}$ above ambient dew point to prevent condensation and coating failure. | **Critical automated feature:** System auto-computes true Dew Point via Magnus-Tetens formula from Ambient Temp and %RH, enforcing the 3°C margin gate before paint sign-off. |
| **Multi-Coat Coating Systems** | Dual system specs: Inside **C4 High** (240 µm nominal: Primer 60 µm + Intermediate 120 µm + PU Finish 60 µm); Outside **C3 High** (180 µm nominal). | System tracks individual coat layers, paint batches (Part A base, Part B hardener), manufacturing dates, and thinners (`08450`, `08080`). |
| **26-Point DFT Measurement Grid** | Multi-point Dry Film Thickness sampling (26 points Inside, 26 points Outside) evaluated against ISO 19840 (80/200 rule). | Web app eliminates Excel's fragile 26-column shadow cell hack (`AK24:BJ27`) by computing Min, Max, Avg, and compliance instantly in memory. |
| **NACE CIP Level 2 Sign-Off** | Industrial protective coatings require specialized certification (`K Deshpande, NACE CIP Level 2`). | Formal inspector certification credentials displayed on the digital twin and exported PDF report alongside Quality Head verification. |

---

## 3. Essential Vocabulary: Speaking the Client's Language

Demonstrate industry and engineering fluency from minute one:

| Term | Full Form | What It Means & Software Context |
| :--- | :--- | :--- |
| **FAI** | First Article Inspection | The initial sample inspection conducted on a brand-new drawing/tooling setup prior to greenlighting full production runs. |
| **PPAP** | Production Part Approval Process | Rigorous OEM customer sign-off package (Levels 1–5). Flender/Siemens frequently require PPAP submission. |
| **NCR** | Non-Conformance Report | Formal quality record raised when physical measurements or coating conditions breach tolerance thresholds. |
| **GD&T** | Geometric Dimensioning & Tolerancing | Engineering symbology on drawings ($\varnothing$, flatness, runout, position, perpendicularity). |
| **Drawing Rev** | Drawing Revision Level | Engineering revisions update drawing numbers (e.g. `A5E46224446 / WY000_9423E` or `W1G00005572A`). System must prevent inspecting against obsolete revisions. |
| **DFT** | Dry Film Thickness | The thickness of a dried paint coating on steel, measured in micrometers ($\mu\text{m}$) using a calibrated magnetic/eddy-current gauge. |
| **WFT** | Wet Film Thickness | The thickness of wet paint immediately after spraying (e.g. `80 ~ 100 µm`), used by the painter to predict final DFT. |
| **NACE CIP** | NACE Coating Inspector Program | Globally recognized credential (now AMPP) for industrial protective coating inspection. |
| **Sa 2.5** | Near-White Metal Blast Cleaning | Visual cleanliness standard per ISO 8501-1; required prior to high-performance epoxy primer application. |
| **3°C Dew Point Rule** | Substrate Condensation Gate | International requirement (ISO 12944-7): Substrate temperature must be $\ge 3^\circ\text{C}$ above ambient dew point ($T_{steel} \ge T_{dew} + 3^\circ\text{C}$). |
| **ISO 19840 / 80-200 Rule** | DFT Acceptance Criteria | Standard for rough steel surfaces: No individual reading $< 80\%$ of nominal DFT, and no reading $> 200\%$ (or $300\%$) of nominal. |

---

## 4. Project Specifics & Architecture Insights

### A. The 3 Levels of Repetition
When diagnosing their pain points, frame the problem in three distinct layers:
1. **Per-Dimension / Per-Reading Repetition (Row Level):** Manually retyping ~50 dimension parameters and tolerance ranges, or typing 26 repetitive DFT readings and coating batch numbers.
2. **Per-Item Repetition (Workbook Level):** Creating, saving, and managing separate Excel workbooks/sheets for each individual drawing and component.
3. **Per-Batch Repetition (Header Level):** Re-entering routine header metadata (PO number, customer name, order quantity, material spec) repeatedly across multiple stages.

### B. The Index Sheet as a Proto-Master
Their existing Excel workbook contains an **Index sheet** acting as a rudimentary item catalog:
- *Talking point:* *"You already have the right architectural instinct with your Index sheet. Our software simply turns that instinct into a searchable Item Master with instant auto-fill, eliminating repetitive blank-template cloning."*

### C. Audited Multi-Format Scope
We have now fully audited both primary inspection formats:
1. **Dimensional Inspection (`Format No. ST/QC/02, Rev 02`)**
2. **Industrial Surface Preparation & Protective Coating (`Format No. ST/QC/04, Rev 01`)**

This eliminates previous scope uncertainty regarding multi-format capability. The template engine will support both formats seamlessly under a unified Item Master.

---

## 5. High-Impact Consulting Moves (What Will Actually Impress Them)

1. **Highlight the Dew Point Compliance Hazard You Discovered:**
   > *"In auditing your painting sheet, we noticed the dew point was recorded as 29.2°C with steel at 28.8°C—which on paper violates the ISO 12944 3°C rule due to a manual math error, even though actual conditions (24.1°C) were fully compliant. Our software automatically calculates dew point using psychrometric formulas so a transcription typo can never trigger an audit finding with Flender."*  
   > *Impact:* Demonstrates unparalleled domain authority and shows you are actively protecting them from client rejections.

2. **Address the 26-Column Hidden Shadow Formula Hack:**
   > *"We noticed in the DFT final inspection sheet that calculating Min, Max, and Average across merged cells required 26 shadow formulas off-screen in columns AK to BJ. If someone inserts a column, those calculations break quietly. Our application computes these statistics natively in memory, verified against ISO 19840 rules."*  
   > *Impact:* Proves you conducted a forensic inspection of their spreadsheets and understand Excel's hidden failure modes.

3. **Inquire About Flender / Winergy Supply Chain Requirements:**
   > *"Since components like the Spiral Air Duct Cap are supplied to Flender / Winergy, do they require submission of combined dimensional and painting inspection dossiers at dispatch, and do they audit your NACE inspection records?"*  
   > *Impact:* Positions your software as an enterprise-grade OEM supplier integration tool.

4. **Ask About Equipment Traceability Across Departments:**
   > *"How do you currently prove to an ISO auditor that the digital DFT gauge or Vernier caliper used on a batch was within its calibration cycle on that exact date?"*  
   > *Impact:* Sells the Calibration Registry as an essential QMS compliance safeguard.

5. **Anchor the Demo on the "Under 5 Minutes per Batch" Transformation:**
   > Walk through a live comparison: *"Watch how 45 minutes of manual retyping and spreadsheet wrangling becomes a 3-minute, error-free workflow."*