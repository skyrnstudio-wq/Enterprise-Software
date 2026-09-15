# Inspection Report Automation — Comprehensive Project Brief
**Client:** Simran Technocrats (I) Pvt. Ltd.  
**Prepared by:** Skyrn Studio  
**Date:** September 14, 2026 (Updated with Painting & Coating Audit)  

---

## 1. Executive Context & Discoveries

Simran Technocrats is a 40+ year-old sheet metal fabricator based in Dombivali, MIDC, specializing in deep-drawn and fabricated assemblies (blower housings, fan casings, terminal boxes, end shields, duct caps) for Tier-1 industrial OEM customers.

Our audit of their quality documentation covers two foundational inspection workbooks:
1. **`Inspection Format.xlsx` (`Format No. ST/QC/02, Rev 02`):** Dimensional inspection report governing ~53 parameters across 5 sample pieces per batch under their ISO 9001 QMS.
2. **`Painting report.xlsx` (`Format No. ST/QC/04, Rev 01`):** Multi-stage industrial protective coating report audited for their Tier-1 OEM customer **FLENDER / WINERGY** (wind turbine gearboxes and industrial drives) for the **Spiral Air Duct Cap** (`A5E46224446 / WY000_9423E`).

---

## 2. Forensic Audit Findings: Where the Pain Points Really Lie

### A. Dimensional Inspection (`Format No. ST/QC/02, Rev 02`)
- **Broken Formulas from Text Formatting:** Nominal dimensions in brackets (e.g., `(2065)`, `(1032.5)`) or with GD&T symbols (`Ø12`, `100°`) convert cells to text strings. Excel returns `#VALUE!` on formula references, forcing inspectors to manually type hardcoded math (`=2065-2`, `=12-0.2`).
- **Undetected Calculation Errors:** Row 10 has nominal `10`, but Min is hardcoded as `1` and Max as `3`—a critical typo that has lived in their template undetected.
- **Zero Real-Time Validation:** Sample columns `01–05` lack conditional formatting. Out-of-tolerance dimensions look identical to compliant dimensions.
- **Empty Instrument Traceability:** Column L (`EQUIPMENT ID`) is 100% blank across all 53 rows because retyping instrument codes by hand is too tedious.

### B. Painting & Protective Coating Report (`Format No. ST/QC/04, Rev 01`)
- **🚨 Severe Compliance & Regulatory Hazard:**
  On Sheet `01 (SP+1)` and `COATING DATA`, Ambient Temp is `30.2°C`, %RH is `69.8%`, and Steel Temp is `28.8°C`. The inspector entered Dew Point as **`29.2°C`**.  
  Under **ISO 12944-7** and **NACE/SSPC** standards, paint application is strictly prohibited unless steel temperature is at least $3^\circ\text{C}$ above the dew point ($T_{steel} \ge T_{dew} + 3.0^\circ\text{C}$).  
  Here, the steel was recorded as being **colder than the dew point** ($-0.4^\circ\text{C}$ margin). On paper, this is an immediate, batch-rejecting audit non-conformance for Flender/Winergy.  
  *The true calculated dew point was $24.1^\circ\text{C}$ (yielding a compliant $+4.7^\circ\text{C}$ margin).* The inspector merely made a manual transcription typo—proving that manual Excel calculations represent an existential risk to their OEM contracts.
- **The 26-Column Shadow Cell Workaround:**
  Because DFT measurement columns are merged 2-cells wide, Excel's native `=MIN()` and `=AVERAGE()` functions failed. The inspector created **26 hidden shadow cells** off-screen (`AK24:BJ27`) referencing each cell individually (`=D24`, `=F24`, etc.). Any row/column insertion breaks these formulas silently.
- **Data Inconsistency Across Stages:**
  Delivery Batch is entered as `2604-02` on surface prep, but switches to `2605-02` on final inspection for the exact same physical piece (`ST-A5E46224446-2603-AQ`).
- **Unmanaged Instruments & Unsigned Reports:**
  Zero calibration tracking for DFT gauges or psychrometers, and the `Checked by -` sign-off block is completely blank.

---

## 3. Where the Repetition Happens (The 3 Levels)

The daily manual burden occurs at three distinct levels across their product line:
1. **Per-Reading / Per-Row Repetition:** Manually retyping ~50 dimension rows, 26 DFT readings, and paint batch numbers for every batch.
2. **Per-Item Repetition:** Creating, copying, and maintaining separate Excel workbooks for every new drawing revision.
3. **Per-Batch Repetition:** Re-entering routine header metadata (PO number, customer name, lot quantity, date) repeatedly across multiple inspection sheets.

---

## 4. Proposed Solution — Unified Enterprise Web Application

| Feature | What It Solves |
| :--- | :--- |
| **Unified Item Master** | Dimensions, tolerances, and coating specifications stored once per drawing revision; new batches pull from a searchable dropdown. |
| **Automated GD&T Limit Engine** | Derives exact Min/Max automatically from nominal ± tolerance, cleaning brackets `(2065)` and symbols `Ø12` without math errors. |
| **Batch Entry Grid (5 Samples)** | Keyboard tabbing (`Tab`/`Enter`), "Copy to all 5" for thread plugs (`M10`), and real-time color feedback (🟢 In Spec, 🟡 Warning, 🔴 Out of Spec). |
| **Automated Psychrometric Engine** | Calculates true Dew Point from Ambient Temp and %RH using the Magnus-Tetens formula. **Enforces ISO 12944-7 3°C Rule:** Locks out painting if $T_{steel} - T_{dew} < 3^\circ\text{C}$. |
| **Automated DFT Statistical Engine** | Computes Min, Max, Average, and ISO 19840 (80/200 rule) compliance across all 26 points instantly in memory, completely eliminating off-screen shadow formulas. |
| **Equipment Calibration Registry** | Relational instrument tracking (Vernier Calipers, Micrometers, Elcometer DFT gauges, Psychrometers) with calibration expiry alerts and bulk assignment. |
| **Two-Person Digital Sign-Off** | Role-based digital signatures with immutable timestamps (Inspector + Quality Head for dimensional; NACE CIP Level 2 + Quality Head for coating). |
| **Pixel-Perfect PDF Generation** | Generates official PDF reports matching `Format No. ST/QC/02, Rev 02` and Flender/Winergy coating layouts exactly. |
| **1-Click NCR Auto-Drafter** | Instantly generates a formal Non-Conformance Report whenever dimensions or environmental limits are breached. |

---

## 5. Quantified Business Impact & ROI

| Metric | Current Excel Reality | Future Web Application | Time / Risk Reduction |
| :--- | :--- | :--- | :--- |
| **Time per Dimensional Batch** | 35–45 minutes | **3–5 minutes** | **~90% reduction** |
| **Time per Coating Inspection** | 30–40 minutes | **4–6 minutes** | **~85% reduction** |
| **Calculation / Math Errors** | Common (Nominal 10 $\rightarrow$ Min 1 / Max 3) | **0% (auto-computed)** | **100% eliminated** |
| **ISO 12944 Dew Point Risk** | High ($29.2^\circ\text{C}$ recorded on paper) | **Zero (Magnus-Tetens auto-calc)** | **100% compliant** |
| **Audit Preparation Time** | 2–4 hours digging through workbooks | **10 seconds (instant query)** | **~98% reduction** |
| **Instrument Traceability** | 0% (column left blank) | **100% logged per dimension** | **Full ISO audit defense** |

Across a plant inspecting 15–20 batches per week, the web application recovers **20+ engineering hours per week** while completely insulating Simran Technocrats from customer audit penalties.

---

## 6. Recommended Technology Stack

- **Frontend & App Logic:** Vite + React (SPA)
- **Styling Architecture:** Pure Vanilla CSS (custom industrial design system, CSS variables, glassmorphism cards, micro-animations, Google Fonts Inter/Outfit)
- **Backend / Database (Production):** PostgreSQL via Supabase (Relational schema: Products $\rightarrow$ Drawing Revisions $\rightarrow$ Dimensions / Coating Specs $\rightarrow$ Batches $\rightarrow$ Readings $\rightarrow$ Sign-offs)
- **Authentication & Security:** Role-Based Access Control (Inspector, NACE Inspector, Quality Head, Admin) with Supabase Auth
- **PDF Generation Engine:** Native high-fidelity `@media print` engine reproducing controlled QMS layouts with 100% visual fidelity
- **Deployment:** Vercel (frontend) + Supabase (database/auth), with full offline capability for shop-floor reliability
