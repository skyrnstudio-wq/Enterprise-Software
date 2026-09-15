# Application Flow
## Simran Technocrats — Inspection Automation & Quality Intelligence Platform
**Built by:** Skyrn Studio  
**Version:** 1.1  
**Date:** September 14, 2026  
**Synced with:** `product-requirements.md` (requirements), `technology-stack.md` (v2 stack), `ui-ux-plan.md` (design system)  

---

## Overview: The Big Picture

```
[Login] ──► [Role-Based Dashboard]
                    │
         ┌──────────┼──────────────────┐
         │          │                  │
      [Admin]  [QC Inspector]    [Quality Head]
         │      [NACE Inspector]       │
         │          │                  │
    [Setup &    [Create &          [Review &
     Config]    Fill Batch]        Sign-Off]
                    │                  │
              [Submit for         [Approve / Reject]
               Review]                 │
                                  [PDF Export]
```

The platform has **two inspection workflows** that share a common spine:

| Workflow | Format | Who Uses It |
|---|---|---|
| **Dimensional Inspection** | `ST/QC/02, Rev 02` | QC Inspector + Quality Head |
| **Surface Prep & Coating** | `ST/QC/04, Rev 01` | NACE Coating Inspector + Quality Head |

Both workflows start from the **Item Master** and end with a **digitally signed, print-ready PDF**.

---

## 1. Authentication & Role Routing

### Screen: Login Page
- User enters email + password
- System identifies role and redirects to appropriate dashboard:

```
Admin           ──► Admin Dashboard (full system access)
QC Inspector    ──► Inspector Dashboard (dimensional batches)
NACE Inspector  ──► Inspector Dashboard (coating batches)
Quality Head    ──► QH Dashboard (pending sign-offs + full history)
```

> **No role can access another role's restricted actions.** A QC Inspector cannot sign off their own batch. An Admin cannot approve inspections.

---

## 2. Admin Flow — System Setup

> The Admin must complete setup before any inspection can begin. This is a one-time configuration, with ongoing maintenance for new parts and instruments.

### 2.1 Instrument / Equipment Registry

**Path:** Admin Dashboard → Equipment Registry → Add Instrument

```
Admin fills:
  - Instrument ID (e.g. "VC-04")
  - Type (Vernier Caliper / Micrometer / DFT Gauge / Thermo-Hygrometer / Profile Gauge)
  - Make / Model (e.g. "Mitutoyo 530-312")
  - Measurement Range (e.g. "0–300 mm")
  - Last Calibration Date
  - Calibration Interval (months, e.g. 6)
  └── System auto-calculates: Next Due Date

Status is automatically shown:
  🟢 Active (>15 days to expiry)
  🟡 Due Soon (≤15 days)
  🔴 Expired (past due date)
```

---

### 2.2 Item Master — Create Drawing Record

**Path:** Admin Dashboard → Item Master → New Item

```
Step 1: Basic Info
  - Item Code (e.g. "W1G00005572")
  - Drawing Number (e.g. "A5E46224446 / WY000_9423E")
  - Item Description (e.g. "Spiral Air Duct Cap")
  - Customer (e.g. "FLENDER / WINERGY")
  - Drawing Revision Letter (e.g. "A")

Step 2: Dimension Rows (for Dimensional Inspection)
  For each dimension (up to 100+):
  ┌────────────────────────────────────────────────────────┐
  │ Sr. No. | Parameter Label | Nominal | Tolerance | Type │
  │  1      | OD              | (2065)  | ±2        | Ref  │
  │  2      | ID              | Ø25     | ±0.2      | Dia  │
  │  3      | Height          | 100°    | ±1°       | Ang  │
  └────────────────────────────────────────────────────────┘
  
  GD&T Parser auto-strips brackets and symbols:
  "(2065)" → Nominal: 2065 | Min: 2063 | Max: 2067  ✅
  Min and Max are read-only and locked.

Step 3: Protective Coating Spec (optional)
  - Substrate Material (e.g. "MS Sheet Fabrication")
  - Blast Profile Range (e.g. "45–75 µm")
  - Inside System: C4 High — Nominal DFT: 240 µm
      └── Primer: 60 µm | Intermediate: 120 µm | PU Finish: 60 µm
  - Outside System: C3 High — Nominal DFT: 180 µm
  - Approved Paint Products (from pre-validated product library):
      └── Hempadur Quattro 22090 (Primer, Beige)
      └── Hempadur Quattro 17634 (Intermediate, Grey)
      └── Hempathane HS 55610 (Topcoat, RAL color)

Step 4: Save & Publish Item
  → Item is now searchable and available for batch creation
```

> **Drawing Revision Rule:** When engineering issues a new revision, Admin creates a new Revision record linked to the same Item Code. All historical inspection records remain permanently linked to the revision under which they were inspected.

---

## 3. QC Inspector Flow — Dimensional Inspection

### Screen: Inspector Dashboard

Shows:
- [+ New Dimensional Batch] button
- List of My Draft Batches (auto-saved, resumable)
- Status of submitted batches (Pending Review / Approved / Rejected)

---

### 3.1 Start a New Dimensional Batch

**Path:** Inspector Dashboard → New Dimensional Batch

```
Step 1: Select Item
  Search by Item Code / Drawing No. / Description / Customer
  └── Select: "W1G00005572 — Air Duct Cap — FLENDER"
  └── System loads latest approved drawing revision automatically

Step 2: Fill Batch Header
  - PO Number (e.g. "PO-FL-2026-0412")
  - Delivery Batch Code (e.g. "2604-02")
  - Inspection Date (today, editable)
  - Lot Quantity (e.g. 12 pieces)
  - Inspector Name (auto-filled from logged-in user)

  → Click "Load Inspection Grid"
```

---

### 3.2 The Dimensional Inspection Grid

```
┌──────┬────────────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────────────┐
│ Sr.# │ Parameter      │ Min  │ Nom  │ Max  │  01  │  02  │  03  │ Instrument   │
├──────┼────────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────────────┤
│  1   │ OD             │ 2063 │ 2065 │ 2067 │[    ]│[    ]│[    ]│ [VC-04 ▼]   │
│  2   │ ID (Ø25)       │ 24.8 │  25  │ 25.2 │[    ]│[    ]│[    ]│ [MC-02 ▼]   │
│  3   │ Height         │  99° │ 100° │ 101° │[    ]│[    ]│[    ]│ [HG-01 ▼]   │
└──────┴────────────────┴──────┴──────┴──────┴──────┴──────┴──────┴──────────────┘
```

**Grid Behavior:**
- **Keyboard Navigation:** Tab moves right (sample to sample). Enter moves down (next dimension).
- **Auto-Save:** Continuous persistence to IndexedDB (Dexie) with offline sync queue — zero data loss on browser refresh, tab crash, or connectivity loss (`technology-stack.md` §3.6).
- **Real-Time Color Highlighting** (fires on every keystroke):
  - 🟢 Green: Value strictly within Min–Max
  - 🟡 Amber: Value within 10% of tolerance edge (tool wear early warning)
  - 🔴 Red: Value breaches Min or Max

**Quick-Fill Actions (per row):**
- [Copy to 05] — Copies Sample 01 value into Samples 02–05 (for GO/NO-GO checks)
- [Fill Nominal] — Fills all 5 samples with the nominal value (for rapid setup validation)

**Instrument Assignment:**
- Each row has a dropdown showing only calibrated instruments from the Equipment Registry
- Expired instruments shown with warning badge — selecting one requires Quality Head override
- [Bulk Apply Vernier VC-04 to all linear rows] — One-click to fill all linear rows

---

### 3.3 Submitting for Review

```
All dimension rows filled?
All instruments assigned?
         │
         ▼
  [Submit for QH Review]
         │
  System checks:
  - No red cells without acknowledgement
  - All 5 samples entered per row
  - All instrument IDs assigned
         │
  ✅ Passes → Batch moves to "Pending Quality Head Review"
  ❌ Fails  → Shows validation summary with blocking fields highlighted
```

Inspector is notified when Quality Head approves or rejects.

---

## 4. NACE Coating Inspector Flow — Protective Coating Inspection

### 4.1 Start a New Coating Batch

**Path:** Inspector Dashboard → New Coating Batch

```
Step 1: Link to Dimensional Batch (optional but recommended)
  → Search and link the related dimensional batch for the same component/PO
  → Batch header (PO, Batch Code, Component) is inherited automatically

Step 2: Confirm or enter Batch Header
  - PO Number (inherited)
  - Delivery Batch Code (inherited — cannot diverge from dimensional record)
  - Inspection Date
  - Piece Identification (e.g. "ST-A5E46224446-2603-AQ")
  - NACE Inspector: "K Deshpande, NACE CIP Level 2" (auto-filled)
```

---

### 4.2 Section A — Surface Preparation Log

```
A1. Steel Grade: [MS Sheet Fabrication ▼]
A2. Welding & Edge Dressing: ISO 8501-3 P-2 Grade [✅ Confirmed]
A3. Degreasing Method: Organic Solvent per ISO 12944-4 [✅ Confirmed]
A4. Water Break Test: [Pass ▼] (Clean = no water beading)
A5. Blast Cleaning Method: [Abrasive Blast Cleaning ▼]
A6. Blast Grade Achieved: [Sa 2.5 per ISO 8501-1 ▼]
A7. Grit Size: [G-40 ▼]
A8. Surface Profile (µm): [__] (must be 45–75 µm range)
    └── System validates: If <45 or >75 → shows ⚠️ out-of-spec warning
A9. Profile Gauge Instrument: [Profile Gauge PG-01 ▼]
```

---

### 4.3 Section B — Psychrometric Compliance Check (CRITICAL)

> This is the most important automated safety gate in the entire application.

```
Inspector enters THREE values:
  - Ambient Temperature (°C): [30.2]
  - Relative Humidity (%RH): [69.8]
  - Steel / Substrate Temperature (°C): [28.8]

System INSTANTLY computes (no manual entry allowed for dew point):
  ┌─────────────────────────────────────────────────────────┐
  │  Dew Point (T_dew):  24.1 °C  [AUTO-CALCULATED]        │
  │  Safety Margin (ΔT): +4.7 °C  [T_steel - T_dew]        │
  │  %RH Check:          69.8% ≤ 85% ✅                     │
  │  ISO 12944-7 Status: ✅ COMPLIANT — PROCEED             │
  └─────────────────────────────────────────────────────────┘

If ΔT < 3.0°C or %RH > 85%:
  ┌─────────────────────────────────────────────────────────┐
  │  🔴 APPLICATION PROHIBITED                              │
  │  Substrate is only +0.4°C above dew point.              │
  │  ISO 12944-7 requires minimum 3.0°C margin.             │
  │  Condensation risk: DO NOT APPLY PAINT.                 │
  │  [Submit] button is LOCKED until conditions improve.    │
  └─────────────────────────────────────────────────────────┘
```

---

### 4.4 Section C — Multi-Coat Paint Batch Log

For each coat (Primer → Intermediate → PU Finish):

```
Coat: [1st Coat — Primer ▼]
  Product Name:       [Hempadur Quattro 22090 ▼] (from pre-validated product library)
  RAL Color:          [Beige ▼]
  Part A Batch No.:   [__________]
  Part A Mfg. Date:   [__________] → System shows shelf-life status
  Part B Batch No.:   [__________]
  Part B Mfg. Date:   [__________] → System shows shelf-life status
  Thinner Type:       [08450 ▼]
  Thinner Batch No.:  [__________]
  Viscosity (sec):    [__]
  WFT (µm):          [__] (expected: 80–100 µm)

[+ Add Next Coat]  →  Repeats for Intermediate, then PU Finish
```

---

### 4.5 Section D — 26-Point DFT Measurement Grid

```
Inside Surface (C4 High System — Nominal: 240 µm)
┌──────────────────────────────────────────────────────────────┐
│  P01 [__]  P02 [__]  P03 [__]  P04 [__]  P05 [__]  P06 [__] │
│  P07 [__]  P08 [__]  P09 [__]  P10 [__]  P11 [__]  P12 [__] │
│  P13 [__]  P14 [__]  P15 [__]  P16 [__]  P17 [__]  P18 [__] │
│  P19 [__]  P20 [__]  P21 [__]  P22 [__]  P23 [__]  P24 [__] │
│  P25 [__]  P26 [__]                                          │
└──────────────────────────────────────────────────────────────┘
Live Statistics (computed instantly in memory):
  Min: —    Max: —    Avg: —
  ISO 19840 (80/200 Rule): — / 26 readings compliant

Outside Surface (C3 High System — Nominal: 180 µm)
  [Same 26-point grid]

DFT Gauge Instrument: [DFT Gauge DG-01 ▼]
```

Cell color coding:
- 🟢 Within 80–200% of nominal DFT
- 🔴 Below 80% (under-coated) or above 200% (over-applied)

---

### 4.6 Section E — Visual Coating Sign-Off Checklist

```
Visual Inspection Checklist:
  ☐ Free of Pinholes
  ☐ No Sagging or Runs
  ☐ No Gloss Loss or Hazing
  ☐ No Peel-Off or Delamination
  ☐ No Blistering

All must be checked ✅ before submission is allowed.
```

---

## 5. Quality Head Flow — Review & Sign-Off

### Screen: Quality Head Dashboard

```
┌──────────────────────────────────────────────────────┐
│  📋 PENDING REVIEW (3)                               │
│  ─────────────────────────────────────────────────   │
│  • Air Duct Cap — Batch 2604-02 — Dimensional  [→]  │
│  • Air Duct Cap — Batch 2604-02 — Coating      [→]  │
│  • Blower Housing — Batch 2605-01 — Dimensional [→] │
│                                                      │
│  ✅ APPROVED THIS MONTH (12)                         │
│  ❌ REJECTED (2)                                     │
└──────────────────────────────────────────────────────┘
```

---

### 5.1 Reviewing a Batch

```
QH sees the fully populated batch record with:
  - All dimensional measurements (color-coded 🟢/🟡/🔴)
  - Any out-of-spec readings highlighted with ⚠️ flags
  - Psychrometric compliance record (auto-calculated, not typed)
  - All instrument IDs with calibration status on the day of inspection
  - Any expired instrument warnings
  - Inspector submission details + timestamp

Action Panel (bottom of screen):
┌──────────────────────────────────────────────────────────┐
│  [🔴 REJECT with Comments]      [✅ APPROVE & SIGN OFF]  │
└──────────────────────────────────────────────────────────┘
```

---

### 5.2 Approve Path

```
[✅ APPROVE & SIGN OFF] clicked
        │
        ▼
Confirmation modal:
  "By approving, you digitally sign this record as Quality Head.
   This batch will be permanently locked and cannot be modified."
  [Confirm & Sign]
        │
        ▼
  - QH name, role, and timestamp recorded immutably
  - Batch status → "APPROVED ✅"
  - Record is LOCKED — no one (not even Admin) can edit inspection data
  - [📄 Generate PDF Report] button appears
```

---

### 5.3 Reject Path

```
[🔴 REJECT with Comments] clicked
        │
        ▼
Modal: "Rejection Reason (required)"
  [Mandatory text entry]
  [Submit Rejection]
        │
        ▼
  - Batch status → "REJECTED — Returned to Inspector"
  - Inspector receives notification with QH's comments
  - Inspector can edit and resubmit (draft mode restored)
  - QH rejection reason is permanently logged on the record
```

---

## 6. NCR Auto-Drafting Flow

Triggered automatically when any measurement breaches tolerance or an environmental gate is violated.

```
Out-of-tolerance reading detected
        │
        ▼
NCR banner appears on batch:
  ⚠️ "1 dimension out of tolerance. Draft an NCR?"
  [Draft NCR Now]
        │
        ▼
Auto-populated NCR form:
  Batch Ref:       ST-A5E46224446-2603-AQ
  Component:       Air Duct Cap (W1G00005572)
  Drawing Rev:     A
  Failing Param:   OD — Nominal: 2065 mm
  Actual Reading:  2068 mm (Sample 03)
  Limit Breached:  Max: 2067 mm
  Instrument Used: VC-04 (Calibration valid until 2027-02-01)
  Inspector:       [auto-filled]
        │
        ▼
QH assigns Disposition:
  [Rework] → Component returned to production
  [Scrap]  → Component rejected and scrapped
  [Concession / Use-As-Is] → OEM approval required

CAPA entry:
  Root Cause: [__________________________]
  Corrective Action: [____________________]
  Preventive Action: [____________________]

  [Sign & Close NCR]
```

---

## 7. PDF Generation Flow

**Path:** Approved Batch → [📄 Generate PDF]

```
User selects format:
  [Dimensional Report — Format ST/QC/02, Rev 02]
  [Coating & Painting Report — Format ST/QC/04, Rev 01]
        │
        ▼
System generates PDF with:
  - Company letterhead
  - Controlled format number, revision, date (footer)
  - Complete batch header (PO, Batch Code, Date, Item)
  - Full measurement grid or coating log
  - Inspector name + timestamp
  - Quality Head name + timestamp + "APPROVED" watermark
  - For Coating: Psychrometric record, DFT statistics, ISO 19840 result
        │
        ▼
  [Download PDF]    [Print]    [Email to Client]
```

> **Print Fidelity:** Dedicated @media print styles ensure exact A4 page breaks and table borders — pixel-matching the original audited formats.

---

## 8. Calibration Audit Recall Flow

**Path:** Admin → Equipment Registry → [Instrument ID] → Audit History

```
Admin searches: "DFT Gauge DG-01"
        │
        ▼
System returns every inspection record where DG-01 was used:
  ┌─────────────────────────────────────────────────────────┐
  │ Batch              │ Date       │ Component  │ Status    │
  ├────────────────────┼────────────┼────────────┼───────────┤
  │ ST-A5E46-2603-AQ  │ 21.04.2026 │ Air Duct   │ Approved  │
  │ ST-W1G00-2601-BK  │ 15.03.2026 │ Blower Hsg │ Approved  │
  └─────────────────────────────────────────────────────────┘
  → One-click download of full audit trail as PDF
```

---

## 9. Complete Screen Inventory

| # | Screen Name | Role | Description |
|---|---|---|---|
| 1 | Login | All | Email + password, role-based redirect |
| 2 | Admin Dashboard | Admin | System overview, quick links to config |
| 3 | Equipment Registry | Admin | Add/edit/view instruments + calibration status |
| 4 | Item Master List | Admin | Search/filter all drawing records |
| 5 | Item Master — Create/Edit | Admin | Add drawing details, dimension rows, coating specs |
| 6 | Inspector Dashboard | Inspector | My drafts, submitted, rejected batches |
| 7 | New Dimensional Batch — Item Select | Inspector | Search and select component from master |
| 8 | Dimensional Inspection Grid | Inspector | 5-sample grid with real-time color validation |
| 9 | New Coating Batch — Link & Header | NACE Inspector | Link to dimensional batch, set header |
| 10 | Coating Batch — Surface Prep | NACE Inspector | ISO 8501 surface prep log |
| 11 | Coating Batch — Psychrometric Check | NACE Inspector | Auto-computed dew point + ISO 12944 gate |
| 12 | Coating Batch — Paint Log | NACE Inspector | Multi-coat product + batch number entry |
| 13 | Coating Batch — DFT Grid | NACE Inspector | 26-point DFT entry + live ISO 19840 stats |
| 14 | Coating Batch — Visual Sign-Off | NACE Inspector | Checklist for pinholes, sags, blistering |
| 15 | Quality Head Dashboard | Quality Head | Pending review queue + history |
| 16 | Batch Review — Dimensional | Quality Head | Full record view + approve/reject |
| 17 | Batch Review — Coating | Quality Head | Full record view + approve/reject |
| 18 | NCR Drafter | Quality Head | Auto-populated NCR + CAPA entry |
| 19 | PDF Preview & Export | All (post-approval) | High-fidelity PDF for both report formats |
| 20 | Instrument Audit Recall | Admin | 1-click usage history for any instrument ID |
| 21 | Batch History / Search | Admin + QH | Full audit log with filters (date, item, status) |

---

## 10. Data State Machine (Batch Lifecycle)

```
[DRAFT]
   │  (Inspector fills, auto-persists to IndexedDB; syncs when online)
   │
   ▼
[SUBMITTED] ──► Pending Quality Head Review
   │
   ▼
[UNDER REVIEW] ──────────────────────────────────────► [REJECTED]
   │                                                        │
   ▼                                                        │
[APPROVED] ◄──── QH signs off immutably            ◄───── Inspector edits & resubmits
   │
   ▼
[PDF GENERATED] ──► Audit-ready document available for download / print
```

---

*This document is a living reference. Update when new modules are added (e.g. Tablet Mode, Customer Portal, SPC Dashboard).*
