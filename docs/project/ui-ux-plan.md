# UI/UX Plan
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Companion documents:** `product-requirements.md` (requirements), `application-flow.md` (flows), `technology-stack.md` (implementation stack) — all in `docs/project/`

---

## 1. Design Direction: "The Engineering Drawing"

### 1.1 The Thesis

Simran Technocrats' pride is 40+ years of engineering pedigree. Their users are machinists, NACE-certified inspectors, and a Quality Head who defends ISO audits. The interface must feel like it belongs on their shop floor — **precise, dense, calm, and legible** — not like a startup landing page.

The visual metaphor is a **first-angle engineering drawing**: hairline rules, technical typography, generous information density, and status communicated the way a drawing communicates — through standardized symbols and annotations, never decoration.

### 1.2 Explicit Anti-Slop Rules

These are hard rules, not preferences. Any PR or screen violating them is rejected:

| ❌ Banned | ✅ Instead |
|---|---|
| Purple/blue gradient backgrounds, "AI gradient" blobs | Flat graphite/paper surfaces with hairline `1px` borders |
| Glassmorphism / backdrop-blur cards (v1 proposal) | Solid surfaces; elevation via border + subtle shadow, at most one level |
| Emoji used as UI icons (📋 ✅ 🟢 in buttons/labels) | Icon library (Lucide) + colorblind-safe status glyphs |
| Purple/indigo/teal "SaaS dashboard" accent color | One industrial accent: safety orange |
| Rounded-everything (16px+ radii, pill buttons) | Sharp 2–4px radii; rectangles, like a drawing title block |
| Decorative animations, parallax, bouncy easing | Functional motion only: 120–160ms opacity/transform, `ease-out` |
| Inter/Outfit/Sora default font stack | IBM Plex Sans + IBM Plex Mono |
| Vague marketing copy in empty states ("Welcome to your dashboard!") | Operational copy: "No batches pending review. Submitted batches appear here for sign-off." |
| Large low-density layouts with cards floating in whitespace | Compact, table-first layouts; density is a feature for inspectors |

### 1.3 Design Principles

1. **Density over decoration.** Inspectors compare 53 rows at a glance. Every pixel serves data.
2. **Status is redundant by design.** Color + glyph + text, always together (§5.3). The interface must work for a colorblind inspector and survive a washed-out tablet screen in sunlight.
3. **The form is sacred.** These are controlled QMS documents. On-screen layouts mirror the paper formats' field order and vocabulary (`Nominal`, `Min`, `Max`, `T_dew`) so the transition from Excel feels like familiar ground, not a redesign.
4. **Automation is ambient, not modal.** Computed values (dew point, Min/Max, DFT stats) appear inline, silently, where the eye already is. No dialogs interrupting a gloved inspector mid-measurement (§7).
5. **One-hand, one-glance operation.** The top 3 actions of any screen are reachable and readable without scrolling or navigating.

---

## 2. Information Architecture & Navigation

### 2.1 Role-Based Shell

One application shell, content differs by role:

```
┌────────────────────────────────────────────────────────────┐
│ TOP BAR (56px, always visible)                             │
│  [SIMRAN TECHNOCRATS · QC]   [Batch Search ⌘K]  [🔔] [User]│
├──────────┬─────────────────────────────────────────────────┤
│ SIDE NAV │  CONTENT                                        │
│ (200px,  │                                                 │
│ collaps- │                                                 │
│ ible to  │                                                 │
│  56px    │                                                 │
│ icons)   │                                                 │
└──────────┴─────────────────────────────────────────────────┘
```

Side nav contents by role:

| Role | Nav items |
|---|---|
| QC / NACE Inspector | My Batches · New Inspection · History |
| Quality Head | Review Queue · All Batches · NCR Register · History |
| Admin | Item Master · Equipment Registry · Users · Audit Log |
| All (footer of nav) | Formats & Templates (read-only view of ST/QC/02, ST/QC/04) |

- Inspector workflows are also **nav-free**: from "New Inspection" onward, the flow is a focused wizard with a progress rail — the side nav collapses to a back-arrow. Inspectors should never wonder where they are.
- **⌘K / tap-to-search** batch search in the top bar: batch code, PO, item code, drawing no. — one search box for everything, since users think in whichever identifier is written on the physical job traveler.

### 2.2 The Primary Loop

The core loop of the entire product is 3 taps deep:

```
Login → [New Inspection] → [Pick Item] → [Confirm Header] → GRID
```

Target: under 20 seconds from login to first measurement entry for a returning inspector. The item picker defaults to "recent items" (last 5 used by this inspector) before showing the searchable master list.

---

## 3. Design System Foundations

### 3.1 Typography

| Token | Value | Usage |
|---|---|---|
| `font-sans` | IBM Plex Sans, 400/500/600 | All UI text |
| `font-mono` | IBM Plex Mono, 400/500 | **All numeric measurement values, IDs, batch codes, format numbers** |
| Display | Plex Sans 600, 20px/28px | Screen titles |
| Body | Plex Sans 400, 14px/20px | Default |
| Dense | Plex Sans 400, 13px/18px | Tables, grids |
| Caption | Plex Sans 500, 11px, uppercase, +0.06em tracking | Section labels, column headers, status chips |

- **IBM Plex Mono with tabular figures for every number** — measurement columns align digit-for-digit, and `2063.0` vs `2068.0` is readable across a row at arm's length. This single choice does more for grid usability than any color.
- Minimum body size 14px on desktop/tablet; nothing below 11px anywhere.

### 3.2 Spacing, Radii, Elevation

- **Spacing scale:** 4px base (4, 8, 12, 16, 24, 32, 48). Grid cells use 8px horizontal padding for dense scannability.
- **Radii:** `2px` inputs/cells, `4px` cards/buttons, `4px` chips. No pill shapes.
- **Elevation:** exactly two levels — Level 0 (flat surface + hairline border) and Level 1 (modals/toasts: `0 4px 16px rgba(0,0,0,.14)`). Nothing else floats.
- **Borders:** `1px solid` at tokenized neutral-300 on light surfaces; the dominant visual element of the UI, echoing technical drawing linework.

### 3.3 Iconography & Symbol Set

- **Lucide icons**, 16px in dense UI / 20px in nav, 1.5px stroke.
- A fixed **status glyph set** used everywhere (§5.3): `Pass = ✓`, `Warn = ▲`, `Fail = ✕`, `Locked = 🔒-icon (Lucide Lock)`, `Auto = ƒx`. Never any other glyph for those meanings.

---

## 4. Color System (Full Token Table)

### 4.1 Core Palette — "Graphite & Paper"

Neutral base derived from graphite pencil on drawing paper — warm, low-chroma, high legibility.

| Token | Light (default) | Value | Usage |
|---|---|---|---|
| `bg-canvas` | `#F4F4F2` | App background |
| `bg-paper` | `#FCFCFB` | Cards, tables, forms |
| `bg-sunken` | `#ECECEA` | Table headers, disabled zones |
| `ink-900` | `#1C1E21` | Primary text |
| `ink-700` | `#43464B` | Secondary text |
| `ink-500` | `#6B6F76` | Placeholder, captions |
| `ink-300` | `#C9CCD1` | Hairline borders |
| `ink-200` | `#E3E5E8` | Row separators |
| `accent` | `#E05A00` | **Safety orange** — primary actions, active states, focus rings. Sparingly: max ~5% of any screen |
| `accent-hover` | `#C24E00` | Button hover |
| `focus-ring` | `accent` @ 2px + 2px offset | Keyboard focus everywhere |

Dark mode (`ink`/`bg` tokens inverted, graphite `#121417` canvas) ships in phase 2 — the semantic status tokens below are defined once and themed.

### 4.2 Semantic Status Palette (the traffic-light system)

Built to be distinguishable under deuteranopia/protanopia (the most common color vision deficiencies) — hue pairs were chosen for lightness separation first, hue second.

| Token | Light value | Meaning | Usage rules |
|---|---|---|---|
| `status-pass-bg` | `#E7F2E4` | In-tolerance | Cell fill at 100%, text `#1E4D1B` |
| `status-pass-fg` | `#1E4D1B` | | ✓ glyph always accompanies |
| `status-warn-bg` | `#FBF0D9` | Within 10% of tolerance edge (tool-wear early warning) | ▲ glyph always accompanies |
| `status-warn-fg` | `#7A5200` | | |
| `status-fail-bg` | `#F9E3E0` | Out of tolerance / compliance violation | ✕ glyph always accompanies |
| `status-fail-fg` | `#8C1D18` | | |
| `status-info-bg` | `#E3EDF5` | Auto-computed value, neutral notice | ƒx glyph |
| `status-info-fg` | `#1F4A63` | | |
| `status-locked-fg` | `ink-700` | Immutable / signed record | Lock glyph |

### 4.3 Status Must Never Rely on Color Alone

Every status instance = **color fill + glyph + (where space allows) text label**:

```
✓ PASS        ▲ NEAR LIMIT      ✕ OUT OF TOL.       ƒx AUTO-CALC
```

In a grid cell where space is tight, the glyph is mandatory and the cell's left border thickens to 3px in the status color — a redundant encoding that survives monochrome printing and colorblind reading alike.

### 4.4 "Sunlight Mode" (High-Contrast Shop-Floor Theme)

A toggleable theme for tablets used in bright production halls:

- Canvas pure white, text pure black, borders `#8A8D92`
- Status colors darkened to WCAG-AAA contrast on white (e.g. `status-warn-fg → #5C3D00`)
- All touch targets gain a visible 1px outline
- No subtle states whatsoever — every hover-equivalent becomes a hard pressed-state

---

## 5. Core Components (Design System Inventory)

| Component | Spec highlights |
|---|---|
| **Measurement Cell** | The atom of the product. Mono type, right-aligned, 48px tall, live validation border+glyph+fill per §4.3. Uncontrolled input; only the cell itself re-renders per keystroke |
| **Status Chip** | 20px tall, caption type, glyph + label, one of the 5 statuses. Never animated |
| **Compliance Panel** (dew point, DFT stats) | `bg-sunken` panel, mono figures, `ƒx AUTO-CALC` tag, big ΔT readout. Turns `status-fail` treatment as a whole unit when a gate trips |
| **Section Card** | Paper surface, hairline border, uppercase caption header with section letter (A, B, C…) matching the paper format's own section lettering |
| **Form Row** | Label left (140px), control right; helper text under control in ink-500; validation text in fail-fg with glyph |
| **Data Table** | Sunken header row (caption type, uppercase), 8px cell padding, sticky first column + header, zebra-free (borders only) |
| **Wizard Rail** | Vertical step indicator for inspection flows: filled dot = done, ring = current, dim = pending; step names use the paper format's own section names |
| **Toast** | Top-right, Level-1 elevation, auto-dismiss 6s, persists for compliance failures until acknowledged |
| **Empty State** | Ink-500 icon + one operational sentence + the single next action as a button. No illustrations, no slogans |
| **Sign-off Block** | Mirrors the paper format's signature area: name, role/cert (e.g. "NACE CIP Level 2"), timestamp, and hash — visually identical to the PDF's block |

---

## 6. Screen-by-Screen Specification

21 screens, per `application-flow.md` §9. Each lists layout, key states, and unique rules. (Common states — loading skeleton, empty, error toast — are assumed everywhere unless noted.)

### 6.1 Login (S1)
Split layout: left 60% = form on paper surface (email, password, submit); right 40% = graphite panel with the company name, "Inspection Platform", and controlled-format numbers as a subtle mono list. Error states inline, never as alerts. Role routing happens silently post-auth — no role picker.

### 6.2 Dashboards (S2, S6, S15)
- **Inspector:** single column. Row 1: two equal actions — `[+ New Dimensional Batch]` `[+ New Coating Batch]` (the two jobs of the app, given equal billing). Row 2: "Continue Draft" card if one exists (resume in one tap, autosave age shown: "saved 12s ago"). Row 3: batch list grouped Draft → Pending Review → Rejected (rejected batches pinned to top with the QH's comment visible inline — no digging).
- **Quality Head:** the review queue is a table, not cards: Item · Batch Code · Type · Submitted (relative time) · Flags (count of amber/red readings, rendered as `▲2 ✕1` chips). Flags are the reason QH opens a record, so they're a first-class column.
- **Admin:** entry points to Item Master and Equipment Registry as two prominent panels + calibration due-soon strip (any instrument ≤15 days to expiry surfaces here automatically — automated UX rule A4, §7).

### 6.3 Equipment Registry (S3, S20)
Table with status column (§4.3 chips). Instrument detail = drawer: metadata + calibration timeline + **usage history table** (the ISO audit recall view, EQ-04) with one-click PDF export. Due-soon/Expired rows carry chips in the list itself.

### 6.4 Item Master List & Editor (S4, S5)
- List: table with Item Code, Drawing No., Description, Customer, Revision, dimension count. Search across all fields simultaneously.
- Editor: 4-step wizard (Basic Info → Dimension Rows → Coating Spec → Publish).
- **Dimension Rows step:** spreadsheet-like editor. Inspector types raw drawing text (`(2065)`, `Ø25±0.2`, `100°`) into one cell; the GD&T parser fills Nominal/Min/Max inline with `ƒx` tagging; a small validation chip (`✓ parsed` / `✕ unrecognized format`) appears per row. Min/Max are visibly locked. Import from their existing Excel file (paste or upload) is offered first — one-time migration is the best UX feature of all.
- Coating Spec step: preset-form (C3/C4 system cards with paint products from the validated library), not free-text.

### 6.5 New Batch — Item Select & Header (S7, S9)
- Item select: recent-items grid first, search below. Selecting an item shows its revision chip and a preview of row/point counts ("53 dimensions · Rev A") before confirming.
- Header form: minimal — PO, Batch Code, Date (defaulted today), Lot Qty. When linked from a dimensional batch (coating flow), inherited fields render as `ƒx inherited` read-only rows — divergence is impossible by construction (fixes audit finding §2.B of the audit report).
- Primary button: `Load Inspection Grid`.

### 6.6 Dimensional Inspection Grid (S8) — *Critical Journey #1*

The heart of the product. Desktop/tablet landscape layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│ W1G00005572 · Air Duct Cap · Rev A     Batch 2604-02   ● saved 12s ago│
├──────┬──────────────────┬────────┬────────┬──────┬──────┬──────┬────┤
│ Sr.# │ PARAMETER        │ MIN    │ NOM    │ MAX  │ 01   │ 02   │ …  │
├──────┼──────────────────┼────────┼────────┼──────┼──────┼──────┼────┤
│ 1    │ OD               │ 2063   │ 2065   │ 2067 │ 2065✓│[    ]│ …  │
│ 2    │ ID Ø25           │ 24.80  │ 25.00  │ 25.20│[    ]│[    ]│ …  │
└──────┴──────────────────┴────────┴────────┴──────┴──────┴──────┴────┘
│  [Copy 01→05]  [Fill Nominal]     Instrument: [VC-04 ▼] [Apply to all]│
│                                          Progress: 17/53 rows complete│
└──────────────────────────────────────────────────────────────────────┘
```

- **Row validation is holistic:** the row's status is the worst of its samples; a `▲/✕` chip appears on the Sr. # cell so problem rows are findable when scrolled.
- **Keyboard model:** Tab → next sample cell; Enter → next row, same sample; typing overwrites; F2/Edit on double-tap. Fully operable without a mouse (PRD NFR).
- **Instrument column:** one select per row, pre-filtered to calibrated instruments; `[Apply to all linear rows]` bulk action is the default path (one tap for most of the grid). Expired instrument selection shows inline `✕ calibration expired — QH override required`, and blocks submission, not entry.
- **Autosave indicator** in the header: `● saving…` → `● saved 12s ago` (mono, ink-500). Loss of connectivity switches it to `◌ offline — will sync` without any modal interruption.
- **Quick-fill** lives in a sticky action bar under the grid (thumb-reachable on tablet).
- Progress footer counts complete rows, not cells — matches the inspector's mental unit.

### 6.7 Coating Batch — Sections A–E (S10–S14)

Presented as a **focused wizard with a rail** (Section A Surface Prep → B Psychrometric → C Paint Log → D DFT Grid → E Visual Checklist), because the paper format itself is sectioned A–E. Each section is one screen; the rail shows completion state; inspector can navigate back freely, forward only when the section validates.

- **Section A (Surface Prep):** form of preset selects (Sa 2.5, G-40, P-2) with the ISO standard numbers rendered as mono captions next to each field — the standard citation is part of the content, not a tooltip. Profile µm input shows the valid range as an inline `45–75 µm` hint and live warn/fail on entry.
- **Section B (Psychrometric) — Critical Journey #2** (see §7.2 for the automation behavior). Layout is the Compliance Panel (§5) at top, three inputs below it, in that order: the *result* is the hero, not the form:

```
┌ COMPLIANCE · ISO 12944-7 ──────────────────────────────┐
│  T_dew  24.1 °C ƒx     ΔT  +4.7 °C ✓     RH 69.8% ✓    │
│  COMPLIANT — PROCEED                                    │
└─────────────────────────────────────────────────────────┘
   Ambient °C [30.2]   RH % [69.8]   Steel °C [28.8]
```

  On violation the panel flips to fail treatment, grows a 3px left border, states the breach in plain numbers ("Steel is 0.4 °C above dew point. 3.0 °C required."), and the wizard's Continue becomes a locked `✕ APPLICATION PROHIBITED` button — the message says *what to wait for*, and the panel updates live as conditions change (e.g. steel warms in the sun). No dismiss, no override for anyone.

- **Section C (Paint Log):** one card per coat (Primer → Intermediate → Finish) in application order, visually stacked like a build-up diagram. Part A/B batch + mfg date inputs show shelf-life status chips on date entry (`✓ in shelf life` / `▲ expires 2026-11-02`). Product selects draw only from the item's validated product list.
- **Section D (DFT Grid) — Critical Journey #3:** two panels (Inside C4 240 µm / Outside C3 180 µm), each a 26-cell grid rendered as 6×5 touch cells (≈64px square on tablet — finger-sized, not typing-sized). Cell status per §4.3 using the 80/200 rule. Live stats row under each panel: `Min · Max · Avg · σ · ISO 19840 ✓ (26/26)` in mono, updating per entry. Numeric keypad forced on mobile via `inputmode="decimal"`.
- **Section E (Visual Checklist):** five large checkbox rows (44px+), all required; unchecked rows keep Continue disabled with a count (`2 of 5 confirmed`).

### 6.8 QH Review Screens (S16, S17)
Read-only rendering of the exact record the inspector saw (same components, input cells → text). Header strip summarizes flags: `▲3 · ✕1 · 1 expired instrument` — each chip anchors to the offending row on tap. Action bar pinned bottom: `[Reject…]` (secondary/danger-outline) and `[Approve & Sign]` (accent). Approve opens the confirmation modal with the immutable-lock statement and the QH's name/role pre-rendered as the Sign-off Block. Reject requires the comment field (min 10 chars) and shows where the inspector will see it.

### 6.9 NCR Drafter (S18)
Auto-populated fields render with `ƒx` tags (batch ref, failing param, limits, instrument + its calibration validity — the audit defense data, not just the failure). Disposition as three large radio cards (Rework / Scrap / Concession — Concession carries an "OEM approval required" annotation). CAPA fields: three multi-line inputs labeled exactly as the paper NCR. Sign & Close repeats the Sign-off Block pattern.

### 6.10 PDF Preview & Export (S19)
Split view: A4 preview at true aspect, right rail with format selector (ST/QC/02 / ST/QC/04), and Download / Print / Email actions. Preview is the print stylesheet itself — what you see is the controlled document.

### 6.11 History & Audit Search (S21)
Filterable table: date range, item, customer, status, format type. Every row → record view; approved records open read-only with a `LOCKED` chip. Export current filter to CSV/PDF for audit prep (the "2–4 hours → 10 seconds" promise, made tangible).

---

## 7. Automated UX Layer

"Automate UX" — the product should do the inspector's paperwork, not just digitize it. Every rule below removes a keystroke, a decision, or an error class.

| # | Rule | Behavior |
|---|---|---|
| A1 | **Inheritance over entry** | Batch header, dimension rows, coating specs, paint products, instrument used last time on this item — all pre-filled from Item Master + history. Inspector confirms rather than types. Header fields inherited from a linked batch render read-only |
| A2 | **Compute, never ask** | Dew point, ΔT, Min/Max, DFT stats, calibration due status, shelf-life status — all computed live, always tagged `ƒx`, never manually enterable. This is the direct UX answer to the audit findings (dew point typo, Min 1/Max 3) |
| A3 | **Warn before the limit, not at it** | Amber state fires at 90% of the tolerance band with the caption "▲ near limit" — the inspector learns the tool is drifting while parts still pass |
| A4 | **Surface what's due, don't wait to be asked** | Dashboard strips + toast: calibration due soon, drafts abandoned >24h, rejected batches awaiting action. Notifications are actionable (tap → the exact record) |
| A5 | **Gate, don't police** | Submit button disabled until validations pass, with a checklist of remaining blockers visible right above it (`✕ 2 rows missing instrument · ▲ 1 row near limit`) — the user always knows what stands between them and done |
| A6 | **Pre-draft the NCR** | On any fail reading, the "Draft NCR" affordance appears immediately with every field auto-populated; the inspector's only job is review + disposition |
| A7 | **Remember the human** | Recent items, last-used instrument per item type, preferred date format (DD.MM.YYYY per their paper), autoselect of the current NACE cert on coating records |
| A8 | **Sync is invisible** | Offline entry continues silently; the only feedback is the header dot (§6.6). No "connection lost!" modals — a shop floor can't afford panic |

**Anti-automation guardrail:** every automated value is inspectable — `ƒx` tags are tappable and reveal the formula, inputs, and standard citation (e.g. Magnus-Tetens, ISO 19840 §). During audits, "the computer did it" must always be showable.

---

## 8. Mobile & Tablet Responsiveness

### 8.1 Device Strategy

| Breakpoint | Target device | Experience |
|---|---|---|
| `≥1280px` | Desktop (QH, Admin) | Full layout, side nav expanded |
| `768–1279px` | **Shop-floor tablets (primary)** | Nav collapses to icons; grids go full-bleed; touch targets 48px |
| `<768px` | Phones (lookup + capture aid) | Not a data-entry target — optimized for review, search, and quick readings (see 8.4) |

Tablets are the primary inspection device, so the design is **tablet-first for the inspection flows, desktop-first for review/admin flows**.

### 8.2 Touch & Ergonomics

- Minimum touch target **48×48px** (44px absolute floor), 8px spacing between adjacent targets.
- Inputs on inspection screens are 48px tall — operable with light gloves.
- All inspection-wizard actions in a **sticky bottom bar** (thumb zone); destructive/primary actions separated by position, not just color.
- Numeric fields force `inputmode="decimal"` (keypad, not alphabet); selects use native pickers on touch devices (larger hit areas than custom dropdowns).
- No hover-dependent affordances anywhere in inspection flows; press states are visual and instant.

### 8.3 Responsive Transform Rules

- **Dimensional grid on tablet (portrait):** parameter block (Sr.#, name, Min/Nom/Max) becomes a **sticky left panel**; sample columns 01–05 scroll horizontally with column-pin affordances. Landscape unlocks the full grid (§6.6) — the app nudges landscape ("Rotate for full grid") but never forces it.
- **Dimensional grid on phone:** transforms to **card-per-dimension**: parameter + limits as header, five large sample inputs as a 1×5 strip beneath, status per input. Sequential, thumb-friendly; the row progress list above allows jumping to any dimension.
- **DFT grid:** 6×5 cell layout degrades gracefully to 5×5 + 1; cells are always ≥44px. Stats panel sticks below the grid on scroll.
- **Tables (QH queue, history) on narrow screens:** priority columns pinned; remaining columns behind a horizontal scroll with a right-edge fade affordance (scroll hint, not a mystery).
- **Compliance panels** (dew point, DFT stats) are **never truncated or collapsed** on mobile — they stack full-width. Compliance info is never sacrificed to fit.

### 8.4 Print & Export

- `@media print` (per `technology-stack.md` §3.8): hides nav/actions, renders the controlled-document layout with exact A4 page breaks. Print preview from tablets uses the same PDF pipeline as desktop — no separate mobile export path to maintain.

---

## 9. Accessibility & Verification Checklist

- WCAG 2.1 AA minimum: contrast ≥4.5:1 body text, ≥3:1 large text and status glyphs (Sunlight Mode targets AAA).
- Full keyboard operability of the grid (§6.6 model); visible focus ring on every interactive element; no keyboard traps in Radix-managed dialogs.
- Status never color-alone (§4.3); form errors announced via `aria-live="polite"`; the compliance violation panel gets `role="alert"`.
- Every screen passes the three-state check (empty / loading / error) and the two-input check (mouse / keyboard-only) before build sign-off.
- E2E Playwright suites (per `technology-stack.md` §3.9) encode journeys #1–3 including the dew-point lock-out — design intent becomes executable acceptance criteria.

---

## 10. Milestone Mapping

| Milestone | UI scope |
|---|---|
| M1 — Dimensional MVP | S1, S6, S7, S8, S15–S17, S19 · components: Measurement Cell, Status Chip, Data Table, Wizard Rail |
| M2 — Coating module | S9–S14, S18 · Compliance Panel, DFT grid, coat cards |
| M3 — Admin & audit | S2–S5, S20, S21 · Registry, Item editor, audit recall |
| M4 — Polish | Sunlight Mode, dark mode, PWA offline UX states, notification digest |

---

*Living document. Component specs win over prose when conflicts arise; propose changes as versioned addenda, not silent edits.*
