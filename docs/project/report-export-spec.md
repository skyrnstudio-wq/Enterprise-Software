# Report Export & Print Fidelity Specification
## Inspection Automation & Quality Intelligence Platform

**Client:** Simran Technocrats (I) Pvt. Ltd.
**Vendor / Builder:** Skyrn Studio
**Version:** 1.0
**Date:** September 14, 2026
**Status:** ✅ Current
**Depends on:** `product-requirements.md` §4.6 (PDF-01…04), `ui-ux-plan.md` (design system), `technology-stack.md` §3.8 (print-CSS engine), `workbook-audit-analysis.md` (audited layouts)

---

## 1. Principle

The two inspection formats are **controlled QMS documents**. A printed report must be indistinguishable from the audited Excel originals — same layout, same borders, same letterhead, same footer metadata. The rendering source is the **same React components** used on screen, with print-only branches (`technology-stack.md` §3.8). Screen and record can never diverge, because there is only one component.

Fallback (documented, not planned): server-side rendering with Puppeteer if a tablet browser's print pipeline proves insufficient.

---

## 2. Two Controlled Reports

| Report | Format | Governed by | Trigger |
|---|---|---|---|
| Dimensional Inspection Report | `ST/QC/02, Rev 02` | ISO 9001 QMS | `APPROVED` batch (PDF-01) |
| Surface Prep & Protective Coating Report | `ST/QC/04, Rev 01` | ISO 12944 / 8501, NACE | `APPROVED` batch (PDF-01) |

Export is **gated on approval**: DRAFT/SUBMITTED batches expose no export action. The gate is enforced in the submission RPC and mirrored in the UI.

---

## 3. Document Anatomy — `ST/QC/02` (Dimensional)

A4 portrait; margins as per audited original (measured in `workbook-audit-analysis.md`).

1. **Letterhead** — company name/address block, format number `ST/QC/02`, revision `Rev 02`, issue date (PDF-04 footer data).
2. **Header fields** — Item code, drawing number + revision, customer, PO number, delivery batch code, lot quantity, inspection date.
3. **Measurement grid** — serial, parameter label (incl. GD&T symbol), nominal, Min/Max, instruments, samples 01–05, result per row.
4. **Status chips** — color **and** shape/icon (colorblind-safe; grayscale-safe under B/W printing: pass = ✓, warn = !, fail = ✗).
5. **Dual sign-off blocks** — Inspector; Quality Head. Name, role, timestamp, decision. Space for physical stamp remains (client QMS coexistence).
6. **Footer** — format number, revision, issue date, page n of m, generated timestamp + batch ID in mono type.

Out-of-tolerance rows print with the fail marker and, per client preference toggle, an NCR reference number if one was raised.

## 4. Document Anatomy — `ST/QC/04` (Coating)

A4 portrait, likely **two pages** (audited original spans sections):

1. **Letterhead** + format block `ST/QC/04, Rev 01`.
2. **Surface preparation section** — steel grade, degreasing/water-break result, blast method/grade (Sa 2.5), grit, profile range, ISO 8501-3 P-2 dressing.
3. **Psychrometric records** — ambient, RH, steel temp, **computed dew point**, ΔT margin per coat event; the compliance verdict prints (APPROVED / PROHIBITED-at-time) as recorded.
4. **Paint batch log** — per coat: product, RAL, Part A batch + mfg date, Part B batch + mfg date, thinner batch, viscosity, WFT.
5. **DFT section** — 26-point grid per side (Inside C4 High, Outside C3 High) + statistics block: Min, Max, Average, Std Dev, ISO 19840 verdict.
6. **Visual inspection** — pinholes/sagging/gloss/peel/blisters checklist (COAT-07).
7. **Sign-off** — NACE CIP Level 2 Inspector block (with certification line, e.g. `K Deshpande, NACE CIP Level 2`) + Quality Head block.
8. **Footer** — as §3.

---

## 5. Print-CSS Engineering Rules

- Page model: `@page { size: A4; margin: <measured> }`; explicit `break-inside: avoid` on every row, sign-off block, and the DFT statistics block — a split statistics table is an audit defect.
- The grid prints from the **same table components** as the screen with a `data-print` variant: inputs become text spans (cell borders always visible), virtualization disabled in print mode (print the full 100 rows, not the visible window).
- Colors must degrade to grayscale-safe: status is never encoded by hue alone.
- Typography: IBM Plex Sans for prose, Plex Mono for all numeric/measurements — matches the drafting aesthetic and maximizes legibility at 600 dpi.
- Company logo: high-resolution SVG in the repo (no raster screenshot of the letterhead).
- `window.print()` invoked from an explicit button; `beforeprint` switches the router view to the report layout; afterprint returns.

## 6. Fidelity Verification (acceptance per PDF-02/03)

- Golden-file comparison: printed output (via browser print-to-PDF at 100 % scale) overlay-compared against the audited Excel printouts; deviations listed and signed off by the client QH **before** the PDF phase exits.
- Checklist per report: letterhead position, grid column widths, sign-off block placement, footer metadata, multi-page break behavior with 100 dimension rows.
- Regression: a Playwright print-emulation screenshot test locks the layout — a visual diff fails CI on unintended drift.

## 7. File Naming & Retrieval

- Suggested convention (confirm with client QMS): `STQC02_{item_code}_{delivery_batch}_{YYYYMMDD}.pdf`.
- Export action records an `audit_log` entry (who exported, when) — report distribution is itself auditable.

---

*Layout changes require re-running the §6 fidelity comparison; the golden files are the arbiter, not eyeballing.*
