# Industrial Manufacturing & QC: Developer Crash Course

### Everything a Software Engineer Needs to Build the Simran Technocrats Quality Platform

> [!NOTE]
> **Target Audience:** Software developers, system architects, and UI/UX designers with zero prior background in mechanical manufacturing, sheet metal fabrication, industrial coatings, or ISO Quality Management Systems (QMS).

---

## 1. Module 1: Who is Simran Technocrats? (The Client)

### 1.1 The Company & Engineering Pedigree

- **Founded:** Started in **1981** by Mr. Avtar Singh Sohal (a mechanical engineering graduate) with a modest setup named *"Precision Mechanical Works"* under the mantra: *"We can do it, and we can do it better."*
- **Location:** Dombivali, MIDC (Maharashtra Industrial Development Corporation), near Mumbai, India.
- **Company DNA:** A **40+ year-old, family-run precision engineering powerhouse**. They are not a software startup or a roadside job-shop; they possess four decades of metallurgical, fabrication, and tooling mastery.
- **Corporate Website:** [simrantechnocrats.com](http://www.simrantechnocrats.com/) — *"Quality Is Our Operating Model, Not A Shop Floor Mantra."*

### 1.2 Their Core Capabilities

1. **Deep Drawing & Heavy Stamping:** Using high-tonnage hydraulic and mechanical presses (up to 500+ tons) to force flat circular steel sheets into seamless 3D cylindrical and contoured shapes (like fan covers, blower shells, and motor end shields).
2. **Precision Sheet Fabrication:** CNC shearing, laser cutting, press brake bending, and forming.
3. **Certified Industrial Welding:** High-integrity MIG (Metal Inert Gas), TIG (Tungsten Inert Gas), and Spot welding for air-tight and structural seams.
4. **Surface Treatment & Protective Coating:** Shot blasting (grit G-40 to Sa 2.5 cleanliness), solvent degreasing, and industrial multi-coat painting (epoxy primers and polyurethane topcoats).

### 1.3 Key Tier-1 OEM Customer Uncovered: FLENDER / WINERGY

Our audit of their quality files uncovered their relationship with **FLENDER / WINERGY**:

- **Who is Flender?** One of the world's premier industrial drive and wind turbine gearbox manufacturers (formerly Siemens Flender).
- **Component Audited:** **Spiral Air Duct Cap** (`Drawing No. A5E46224446 / WY000_9423E`), which mounts onto industrial wind-turbine drivetrains operating in harsh outdoor and marine environments.

```
┌────────────────────────────────────────────────────────┐
│               FLENDER / WINERGY (OEM)                  │
│       Builds Wind Turbine Gearboxes & Drives           │
└──────────────────────────┬─────────────────────────────┘
                           │ Issues Purchase Orders & Drawing Revisions
                           ▼
┌────────────────────────────────────────────────────────┐
│           SIMRAN TECHNOCRATS (Fabricator)              │
│  Draws, Welds, Blasts, Paints, & Inspects Components   │
└──────────────────────────┬─────────────────────────────┘
                           │ Dispatches Finished Lots + Inspection Dossiers
                           ▼
                  [Customer Inward QC]
         (Rejects batch if reports fail audit!)
```

---

## 2. Module 2: The Physical Manufacturing Pipeline

Before writing code or designing databases, understand how physical parts move through the factory:

```
[1. Raw Material] ────► [2. Shearing/Cutting] ────► [3. Deep Drawing]
Coils / MS Sheet          Flat blank cut              500T Hydraulic Press
                                                             │
                                                             ▼
[6. Shot Blasting] ◄─── [5. DIMENSIONAL QC] ◄─── [4. Welding / Seams]
Abrasive Grit G-40      Workflow #1 (ST/QC/02)      MIG/TIG/Spot Assembly
Sa 2.5 Cleanliness      ~53 Dimensions Measured
      │
      ▼
[7. Solvent Degrease] ─► [8. 3-Coat Paint] ─────► [9. COATING & DFT QC]
Water Break Test         Primer + Int + PU         Workflow #2 (ST/QC/04)
Clean vs Beading         3°C Dew Point Rule        26-Point DFT Grid
                                                             │
                                                             ▼
                                                    [10. Packing & Dispatch]
                                                    Print-ready PDF Dossier
```

---

## 3. Module 3: Why QC Exists — Audits & "Controlled Documents"

### 3.1 What is a "Controlled Document"?

In typical web apps, changing a form label or moving a column is trivial. In aerospace, defense, and heavy industrial manufacturing, it is a **regulatory breach**.

- Simran Technocrats operates under an **ISO 9001:2015 Quality Management System (QMS)**.
- Every form is an auditable legal contract with a formal header/footer:
  `FORMAT NO.-ST/QC/02, REV.NO.-02, DATE-01-09-23`
- Altering fields or layout without formal Engineering Change Management (ECM) triggers audit non-conformances.
- **Developer Takeaway:** The web application is the modern, fast, automated data-entry engine; however, the **PDF/print export must pixel-match their existing format**.

### 3.2 The Annual "Surveillance Audit"

Every year, third-party certification auditors (e.g., TUV, DNV, Bureau Veritas) and OEM auditor teams (Flender, Siemens) visit the factory. They pick random batches from past months and ask:

> *"Show me batch ST-A5E46224446-2603-AQ. Who measured it? What gauge did they use? Was the gauge calibrated on that day? Prove that you sprayed paint when the steel was above the dew point."*

If the company cannot produce signed, traceable records in 60 seconds, or if the records contain impossible numbers, they risk losing their Tier-1 vendor approval.

---

## 4. Module 4: Workflow #1 — Dimensional QC (`Format No. ST/QC/02, Rev 02`)

Dimensional inspection proves that the physical steel geometry matches the customer's engineering drawing.

### 4.1 Engineering Tolerances & GD&T

Drawings specify **tolerances (acceptable bands)**, not single points:

$$
\text{Nominal: } 2065\text{ mm} \pm 2\text{ mm} \implies \text{Min: } 2063\text{ mm}, \quad \text{Max: } 2067\text{ mm}
$$

- **Nominal Value:** The blueprint ideal target ($2065$).
- **Tolerance Band:** The allowable machining variance ($\pm 2$).
- **GD&T (Geometric Dimensioning & Tolerancing):**
  - Linear dimensions: `2065 ±2`
  - Diameters: `Ø12 ±0.2` (`Ø` indicates cylindrical hole/shaft)
  - Angles: `100° ±1°`
  - Reference Dimensions: Placed in brackets `(2065)`—these denote overall reference measurements.

### 4.2 Why 5 Sample Columns (01–05)?

- If a batch has 50 pieces, measuring all 53 dimensions on every piece means $50 \times 53 = 2,650$ physical measurements (taking over 15 hours).
- Instead, statistical lot sampling rules dictate taking **5 random physical pieces** from the lot (Sample 01 to Sample 05).
- If all 5 samples pass every dimension, the entire production batch is accepted.

### 4.3 Calibration Equipment Traceability

Every dimension is checked with an instrument:

- **Vernier Caliper (`VC`):** For outer lengths, steps, and depths ($0 \sim 300\text{ mm}$).
- **Micrometer (`MC`):** For high-precision thickness measurements ($0.01\text{ mm}$ resolution).
- **Height Gauge (`HG`):** For vertical profiles on granite surface plates.
- **Thread Plug Gauge:** For threaded holes (e.g., `M10`), checked as a **GO / NO-GO** binary pass/fail.
- **Software Rule:** Every measurement row must link to a calibrated tool ID (`VC-04`) whose calibration date has not expired.

---

## 5. Module 5: Workflow #2 — Surface Coating & Painting (`Format No. ST/QC/04, Rev 01`)

Protective coating on industrial equipment is a critical chemical barrier preventing salt spray, moisture, and chemical vapors from eating through steel.

### 5.1 The 3 Stages of Protective Coating

1. **Surface Preparation (ISO 8501-1 / ISO 8501-3):**
   - Blasting steel with grit (`G-40`) to **Sa 2.5** cleanliness (near-white bare metal).
   - Profiling surface roughness to **$45 \sim 75\ \mu\text{m}$** (roughness allows paint to anchor mechanically).
   - Degreasing per ISO 12944-4: verified by the **Water Break Test** (water poured on steel sheets cleanly; if it beads up, oil residue is present).
   - Dressing all weld spatters, rough edges, and notches to **P-2 Grade**.
2. **Coating Application Log:**
   - Multi-coat system:
     - **1st Coat (Primer):** `Hempadur Quattro 22090` (Epoxy, Beige).
     - **2nd Coat (Intermediate):** `Hempadur Quattro 17634` (Epoxy, Grey).
     - **3rd Coat (Topcoat):** `Hempathane HS 55610` (Polyurethane, UV-resistant).
   - Two-part chemical reactions: Part A (Base resin) + Part B (Hardener) mixed with specific thinners (`08450`, `08080`).
3. **Dry Film Thickness (DFT) Inspection (ISO 19840):**
   - Measured after curing using electronic magnetic gauges.
   - **Inside System (C4 High Corrosivity):** Nominal DFT = $240\ \mu\text{m}$ (Acceptable: $192 \sim 480\ \mu\text{m}$).
   - **Outside System (C3 High Corrosivity):** Nominal DFT = $180\ \mu\text{m}$ (Acceptable: $144 \sim 360\ \mu\text{m}$).
   - 26 readings inside and 26 readings outside are captured to ensure uniform barrier thickness.

### 5.2 The Critical Psychrometric Law: The 3°C Dew Point Rule

This is the single most critical physical principle a developer must understand:

$$
\mathbf{T_{\text{steel}} \ge T_{\text{dew}} + 3.0^\circ\text{C}}
$$

- **What is Dew Point ($T_{dew}$)?** The ambient temperature at which air becomes 100% saturated with moisture, causing water vapor to condense into liquid droplets.
- **The Physical Hazard:** If steel temperature is close to or below the dew point, a microscopic film of water condenses on the steel. Spraying paint over moisture traps water against bare metal, causing premature blistering, peeling, and rust under the paint.
- **The ISO 12944-7 Standard:** Steel temperature **must be at least 3.0°C higher than the dew point** at all times during blasting, painting, and initial curing.

---

## 6. Module 6: The Forensic Pain Points (Why Excel is Failing Them)

Our audit of `Inspection Format.xlsx` and `Painting report.xlsx` revealed why the client is suffering in spreadsheets:

```
┌───────────────────────────────────────────────┬───────────────────────────────────────────────┐
│              EXCEL REALITY (TODAY)            │              WEB APPLICATION (FUTURE)         │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 1. Dew Point typed as 29.2°C vs Steel 28.8°C  │ 1. Dew Point auto-calculated via physics math;│
│    (Violates ISO 12944-7 on official paper!)  │    Locks paint sign-off if Margin < 3.0°C.    │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 2. 26 hidden shadow cells (AK24:BJ27) off-    │ 2. Computes Min, Max, Avg, and ISO 19840      │
│    screen to calculate DFT Min, Max, Avg.     │    compliance in memory across array.         │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 3. Text "(2065)" breaks Excel math;           │ 3. Automated GD&T regex parser extracts       │
│    Inspectors hardcode "=2065-2" formulas.    │    numeric nominals and computes Min/Max.     │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 4. Erroneous limits: Nominal 10 -> Min 1/Max 3│ 4. Form validation enforces Min <= Nom <= Max │
│    typed manually, went undetected for years. │    at schema level.                           │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 5. Sample cells have no color validation;     │ 5. Real-time feedback: 🟢 In Spec,            │
│    Out-of-spec readings look identical.       │    🟡 Approaching Edge (10%), 🔴 Out of Spec. │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 6. Delivery batch mismatch: 2604-02 vs 2605-02│ 6. Single unified batch master inherited      │
│    across different stages of same piece.     │    across all inspection stages.              │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ 7. Equipment ID column left 100% blank.       │ 7. Relational instrument registry with        │
│                                               │    calibration expiry warnings & 1-click apply│
└───────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 7. Module 7: Software Engineering Blueprint

### 7.1 Relational Data Model & Schemas

```
┌─────────────────────────┐         ┌─────────────────────────┐
│       ItemMaster        │ 1     * │     DrawingRevision     │
│  - item_code (PK)       ├────────►│  - revision_id (PK)     │
│  - description          │         │  - item_code (FK)       │
│  - customer_name        │         │  - revision_letter      │
└─────────────────────────┘         └────────────┬────────────┘
                                                 │ 1
                           ┌─────────────────────┴──────────────────────┐
                           │ *                                          │ *
               ┌───────────▼────────────┐                  ┌────────────▼────────────┐
               │     DimensionSpec      │                  │       CoatingSpec       │
               │  - spec_id (PK)        │                  │  - spec_id (PK)         │
               │  - revision_id (FK)    │                  │  - revision_id (FK)     │
               │  - parameter_label     │                  │  - blast_profile_range  │
               │  - nominal_val         │                  │  - inside_system (C4)   │
               │  - tol_plus / minus    │                  │  - outside_system (C3)  │
               │  - min_val / max_val   │                  │  - products_and_colors  │
               └────────────────────────┘                  └─────────────────────────┘
                           ▲                                            ▲
                           │                                            │
┌──────────────────────────┼────────────────────────────────────────────┼──────────────────────────┐
│ BATCH INSPECTION RUN     │                                            │                          │
│                          │                                            │                          │
│ ┌────────────────────────┴─────────┐                       ┌──────────┴────────────────────────┐ │
│ │     DimensionalBatchRecord       │                       │        CoatingBatchRecord         │ │
│ │  - batch_id (PK)                 │                       │  - batch_id (PK)                  │ │
│ │  - po_number, delivery_batch     │                       │  - ambient_temp, relative_humidity│ │
│ │  - sample_readings [01..05]      │                       │  - steel_temp, calculated_dew_pt  │ │
│ │  - instrument_id (FK)            │                       │  - dft_readings_inside [26]       │ │
│ │  - inspector_sign, qh_sign       │                       │  - dft_readings_outside [26]      │ │
│ └──────────────────────────────────┘                       │  - nace_inspector_sign, qh_sign   │ │
│                                                            └───────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 7.2 Core Algorithms Every Developer Needs

#### Algorithm 1: The Psychrometric Dew Point Engine (Magnus-Tetens Formula)

Never allow the user to manually type dew point. Compute it via physics:

```javascript
/**
 * Computes Dew Point and evaluates ISO 12944-7 Compliance Gate
 * @param {number} tempAmbient - Ambient dry-bulb temperature in °C (e.g. 30.2)
 * @param {number} relativeHumidity - Relative humidity percentage (e.g. 69.8)
 * @param {number} tempSteel - Substrate surface temperature in °C (e.g. 28.8)
 */
export function evaluatePsychrometricConditions(tempAmbient, relativeHumidity, tempSteel) {
  const a = 17.27;
  const b = 237.7;
  
  // Magnus-Tetens formula for dew point calculation
  const alpha = ((a * tempAmbient) / (b + tempAmbient)) + Math.log(relativeHumidity / 100.0);
  const dewPoint = (b * alpha) / (a - alpha);
  
  const margin = tempSteel - dewPoint;
  const passesMargin = margin >= 3.0;
  const passesHumidity = relativeHumidity <= 85.0;
  const isCompliant = passesMargin && passesHumidity;
  
  return {
    dewPoint: Number(dewPoint.toFixed(1)),
    margin: Number(margin.toFixed(1)),
    isCompliant,
    warning: !isCompliant
      ? !passesMargin
        ? `APPLICATION BLOCKED: Steel temp (${tempSteel}°C) must be ≥ 3.0°C above dew point (${dewPoint.toFixed(1)}°C). Current margin: ${margin.toFixed(1)}°C.`
        : `APPLICATION BLOCKED: Relative humidity (${relativeHumidity}%) exceeds the 85% ISO limit.`
      : null
  };
}
```

#### Algorithm 2: GD&T Robust Tolerance Parser

Extract numeric nominals and bounds from messy CAD text:

```javascript
/**
 * Parses CAD/Drawing tolerance strings like "(2065)", "Ø12 ±0.2", "100° ±1°"
 */
export function parseTolerance(rawNominal, rawTolerance) {
  // Strip non-numeric characters except minus and decimal point
  const cleanNominal = parseFloat(String(rawNominal).replace(/[^0-9.-]/g, ''));
  if (isNaN(cleanNominal)) {
    return { nominal: null, min: null, max: null, isSpecial: true };
  }
  
  // Match symmetric tolerance format: "±0.5" or "+/- 0.5"
  const symMatch = String(rawTolerance).match(/[±\+\/-]+\s*([0-9.]+)/);
  if (symMatch) {
    const tol = parseFloat(symMatch[1]);
    return {
      nominal: cleanNominal,
      min: Number((cleanNominal - tol).toFixed(3)),
      max: Number((cleanNominal + tol).toFixed(3)),
      isSpecial: false
    };
  }
  
  return { nominal: cleanNominal, min: cleanNominal, max: cleanNominal, isSpecial: false };
}
```

#### Algorithm 3: In-Memory DFT Statistical Summary (ISO 19840 80/200 Rule)

Eliminate the 26-column shadow cell hack:

```javascript
/**
 * Computes live DFT statistics across 26 readings and validates ISO 19840
 */
export function computeDftStats(readingsArray, nominalDft) {
  const valid = readingsArray.filter(v => typeof v === 'number' && !isNaN(v) && v > 0);
  if (valid.length === 0) return null;
  
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = valid.reduce((acc, curr) => acc + curr, 0) / valid.length;
  
  // ISO 19840 Acceptance Criteria:
  // 1. Average must meet or exceed Nominal DFT
  // 2. No individual reading below 80% of Nominal DFT
  // 3. No individual reading above 200% of Nominal DFT
  const minThreshold = nominalDft * 0.8;
  const maxThreshold = nominalDft * 2.0;
  
  const failingPoints = valid.filter(r => r < minThreshold || r > maxThreshold);
  
  return {
    count: valid.length,
    min: Math.round(min),
    max: Math.round(max),
    avg: Number(avg.toFixed(1)),
    isCompliant: failingPoints.length === 0 && avg >= nominalDft,
    failingCount: failingPoints.length
  };
}
```

---

## 8. Module 8: Developer Dictionary (Domain Glossary)

| Term                              | Domain Area        | Plain-English Definition                                                                                                |
| :-------------------------------- | :----------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **QMS**                     | Compliance         | Quality Management System — the company's formal procedures certified under ISO 9001.                                  |
| **Controlled Format**       | Compliance         | A registered document (`ST/QC/02`) that cannot be altered without management review.                                  |
| **GD&T**                    | Engineering        | Geometric Dimensioning & Tolerancing — standard engineering drawing symbols ($\varnothing, \pm$).                    |
| **Nominal**                 | Engineering        | The target blueprint dimension.                                                                                         |
| **Min / Max**               | Engineering        | The lowest and highest acceptable measurement limits ($Nominal \pm Tolerance$).                                       |
| **Sample 01–05**           | QC Protocol        | The 5 physical parts randomly pulled from a batch for statistical quality verification.                                 |
| **GO / NO-GO**              | QC Protocol        | Hard gauge check (e.g.`M10` thread plug). Either threads cleanly (GO) or stops (NO-GO).                               |
| **Sa 2.5**                  | Coating            | "Near-White Metal" blast cleaning per ISO 8501-1; bare steel free of rust and mill scale.                               |
| **Surface Profile**         | Coating            | Microscopic anchor roughness of blasted steel ($45 \sim 75\ \mu\text{m}$) needed for paint adhesion.                  |
| **Dew Point ($T_{dew}$)** | Physics            | Temperature at which air moisture condenses into liquid water.                                                          |
| **3°C Rule**               | Coating Compliance | ISO 12944 requirement: Substrate temperature must be$\ge 3^\circ\text{C}$ above ambient dew point.                    |
| **DFT**                     | Coating            | Dry Film Thickness — thickness of cured paint in micrometers ($\mu\text{m}$) measured with magnetic gauges.          |
| **WFT**                     | Coating            | Wet Film Thickness — thickness of wet paint immediately after spray application.                                       |
| **C3 / C4 High**            | Coating            | Atmospheric corrosivity categories under ISO 12944-2 (C3 = Industrial Exterior, C4 = Heavy Industrial/Marine Interior). |
| **NACE CIP Level 2**        | Certification      | Certified Coating Inspector credential required to sign off protective coating reports.                                 |
| **NCR**                     | Quality            | Non-Conformance Report — formal quality record raised when a reading breaches tolerance limits.                        |
| **PPAP**                    | Supply Chain       | Production Part Approval Process — rigorous OEM documentation package required by automotive/wind OEMs.                |
