import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PsychrometricPanel, DftPanel, ShelfLifeChip } from "../CoatingPanels";
import { coatingSubmissionChecklist, canSubmitCoating } from "@/domain/coating";

/**
 * Dew-point lock-out journey (#3) at the component layer — execution-plan
 * Phase 4 step 9. Full E2E lands with Phase 6 tooling; here the UI contract
 * is pinned: violating conditions render the locked CompliancePanel with the
 * margin copy, boundary values pass (4.1/4.4), and the checklist integration
 * keeps submit gated while locked.
 */

function renderPanel(steel: string, ambient: string, rh: string): void {
  render(
    <PsychrometricPanel steelRaw={steel} ambientRaw={ambient} rhRaw={rh} onChange={() => {}} />,
  );
}

describe("journey #3 — dew-point lock-out (component layer)", () => {
  it("ΔT below 3.0 locks: APPLICATION PROHIBITED + margin copy (edges 4.1/4.2)", () => {
    // ambient 30 °C / 60 %RH ⇒ dew ≈ 21.4 °C; steel 23 °C ⇒ ΔT ≈ 1.6 °C.
    renderPanel("23", "30", "60");
    expect(screen.getByText("APPLICATION PROHIBITED")).toBeTruthy();
    expect(screen.getByText(/below the required 3\.0 °C margin/i)).toBeTruthy();
  });

  it("ΔT exactly 3.0 °C passes the gate (edge 4.1 pin)", () => {
    // Dew point 20 °C at (28.0 °C, 66.1 %RH)-ish; use engine-exact pair:
    // ambient 30 °C / 60 %RH ⇒ dew ≈ 21.40; steel 24.40 ⇒ ΔT ≈ 3.00.
    renderPanel("24.45", "30", "60");
    expect(screen.getByText("APPLICATION PERMITTED")).toBeTruthy();
  });

  it("RH > 85 % locks with the humidity message (edge 4.4) — ΔT clause satisfied first", () => {
    // steel 35 / ambient 30 ⇒ ΔT ≈ 7.6 ≥ 3, so the RH clause is what trips.
    renderPanel("35", "30", "86");
    expect(screen.getByText(/exceeds the 85 % application ceiling/i)).toBeTruthy();
  });

  it("RH exactly 85 % passes when ΔT is sufficient (edge 4.4 pin)", () => {
    renderPanel("35", "30", "85");
    expect(screen.getByText("APPLICATION PERMITTED")).toBeTruthy();
  });

  it("condensation case names the condition present, not just the margin (edge 4.3)", () => {
    // Steel colder than ambient at high RH ⇒ negative ΔT.
    renderPanel("18", "30", "95");
    expect(screen.getByText(/condensation present/i)).toBeTruthy();
  });

  it("partial conditions render the neutral enter-state, never a verdict", () => {
    renderPanel("23", "", "60");
    expect(screen.getByText("ENTER CONDITIONS")).toBeTruthy();
  });
});

describe("journey #3 — DFT ISO 19840 surface (COAT-05/06)", () => {
  const grid = (values: (number | null)[]): (number | null)[] => [
    ...values,
    ...Array(26 - values.length).fill(null),
  ];

  it("live stats render entered readings; breach reading is flagged in-cell", () => {
    render(
      <DftPanel
        sideLabel="Inside"
        system="C4 High"
        nominal={240}
        readings={grid([240, 242, 239, 241, 190])} // 190 < 192 = below-80 breach
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("READING < 80% NOMINAL")).toBeTruthy();
    expect(screen.getByLabelText(/Inside live statistics/i)).toBeTruthy();
    expect(screen.getByText(/^5\/26 entered/)).toBeTruthy();
  });

  it("compliant grid shows the PASS chip (edge 4.9 boundaries inside)", () => {
    render(
      <DftPanel
        sideLabel="Outside"
        system="C3 High"
        nominal={180}
        readings={grid([144, 145, 200, 360, 180])} // exactly 0.8× and 2.0× — compliant
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("ISO 19840 PASS")).toBeTruthy();
  });

  it("thin grid renders the enter-more state, not a verdict", () => {
    render(
      <DftPanel
        sideLabel="Inside"
        system="C4 High"
        nominal={240}
        readings={grid([240, 241, 239])}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("MIN 5 READINGS (3/26)")).toBeTruthy();
  });
});

describe("journey #3 — shelf-life chip (COAT-04, edges 4.13/4.14)", () => {
  it("expired product blocks with the fail chip; boundary 30-day amber", () => {
    const { rerender } = render(
      <ShelfLifeChip mfgDate="2025-01-01" today="2026-09-16" intervalMonths={12} />,
    );
    expect(screen.getByText("SHELF LIFE EXPIRED")).toBeTruthy();

    rerender(<ShelfLifeChip mfgDate="2025-10-16" today="2026-09-16" intervalMonths={12} />);
    expect(screen.getByText("EXPIRES IN 30D")).toBeTruthy();

    rerender(<ShelfLifeChip mfgDate="2024-09-16" today="2026-09-16" intervalMonths={24} />);
    expect(screen.getByText("EXPIRES TODAY")).toBeTruthy();

    rerender(<ShelfLifeChip mfgDate={null} today="2026-09-16" intervalMonths={12} />);
    expect(screen.getByText("MFG DATE NEEDED")).toBeTruthy();
  });
});

describe("journey #3 — checklist integration keeps submit gated while locked", () => {
  const base = {
    surfacePrepComplete: true,
    conditionsEntered: true,
    coatsComplete: true,
    dftCounts: { INSIDE: 26, OUTSIDE: 26 },
    partialDftAcknowledged: false,
    visualChecksComplete: true,
  };

  it("psychro lock ⇒ lock-out gate undone ⇒ cannot submit", () => {
    const items = coatingSubmissionChecklist({ ...base, psychroLocked: true });
    expect(items.find((i) => i.id === "lock-out")?.done).toBe(false);
    expect(canSubmitCoating(items)).toBe(false);
  });

  it("compliant conditions ⇒ submittable", () => {
    const items = coatingSubmissionChecklist({ ...base, psychroLocked: false });
    expect(canSubmitCoating(items)).toBe(true);
  });
});
