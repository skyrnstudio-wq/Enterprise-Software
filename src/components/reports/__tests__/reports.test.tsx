import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReportDim } from "../ReportDim";
import { ReportCoating } from "../ReportCoating";
import { fileNameFor, sheetTitle } from "@/lib/report-meta";
import type { ReportData } from "@/lib/api/review";

/**
 * Report renderer contracts — execution-plan Phase 6 steps 5/6/7 +
 * report-export-spec §3/§4. The renderers are the last stop before a
 * controlled document prints, so their behavior is pinned here:
 * - full grid, never virtualized (spec §5) — a 53-row fixture renders 53 rows;
 * - verdicts derive from the SAME domain engines as the review screen;
 * - psychrometric verdicts print as RECORDED (edge 4.7), never re-judged;
 * - DFT statistics block is a keep-together unit (edge 6.4);
 * - rejection comments print (RejectModal's stated contract, SO-03);
 * - sign-off blocks render pending (`—`) when a role hasn't signed.
 */

const batchId = "b7e6a1c2-0000-4000-8000-000000000001";

function dimData(overrides: Partial<Extract<ReportData, { workflow: "DIMENSIONAL" }>> = {}): Extract<
  ReportData,
  { workflow: "DIMENSIONAL" }
> {
  return {
    workflow: "DIMENSIONAL",
    header: {
      batchId,
      status: "APPROVED",
      workflow: "DIMENSIONAL",
      itemCode: "W1G00005572",
      drawingNumber: "W1G00005572A",
      revision: "A",
      customer: "FLENDER / WINERGY",
      poNumber: "PO-7741",
      deliveryBatchCode: "2604-02",
      inspectionDate: "2026-09-16",
      lotQty: 25,
    },
    signOffs: [
      { role: "INSPECTOR", name: "R Patil", decision: "SUBMIT", comments: null, signedAtIso: "2026-09-16T09:30:00Z" },
    ],
    rows: [],
    ...overrides,
  };
}

function coatData(): Extract<ReportData, { workflow: "COATING" }> {
  return {
    workflow: "COATING",
    header: { ...dimData().header, workflow: "COATING" },
    signOffs: [],
    surfacePrep: {
      steelGrade: "MS Sheet Fabrication",
      weldEdgeOk: true,
      solventCleanOk: true,
      waterBreakPass: true,
      blastMethod: "Abrasive Blast Cleaning",
      blastGrade: "Sa 2.5",
      gritSize: "G-40",
      profileUm: 62,
    },
    coats: [
      {
        coatNo: 1,
        product: "Hempadur Quattro 22090",
        ral: "RAL 22090",
        partABatch: "PA-4471",
        partAMfg: "2026-04-11",
        partBBatch: "PB-118",
        partBMfg: null,
        thinnerBatch: null,
        viscosityS: 29,
        wftUm: 90,
        ambientC: 30.2,
        rhPct: 69.8,
        steelC: 28.8,
        dewPointC: 24.1,
        deltaTC: 4.7,
        verdict: "APPROVED",
      },
    ],
    dft: {
      INSIDE: [240, 245, 238, 250, 242, 244, 239, 246, 241, 243, 247, 240, 244, 242, 238, 249, 241, 243, 246, 240, 244, 239, 247, 242, 245, 241],
      OUTSIDE: [180, 184, 178, 186, 181, 183, 179, 185, 182, 180, 184, 178, 186, 181, 183, 179, 185, 182, 180, 184, 178, 186, 181, 183, 179, 185],
    },
    dftNominals: { inside: 240, outside: 180 },
    systems: { inside: "C4 High", outside: "C3 High" },
    visual: { pinholes: false, sagging: false, gloss_loss: false, peel_off: false, blisters: false },
  };
}

describe("ReportDim — ST/QC/02 (spec §3)", () => {
  it("renders the FULL 53-row grid — never virtualized (spec §5)", () => {
    const rows = Array.from({ length: 53 }, (_, i) => ({
      serial: i + 1,
      label: `Dim ${String(i + 1)}`,
      symbol: null,
      isReference: false,
      nominal: 25,
      tolPlus: 0.2,
      tolMinus: 0.2,
      instrumentCode: "VC-04",
      values: [24.9, 25.0, 25.1, 24.95, 25.05],
    }));
    const { container } = render(<ReportDim data={dimData({ rows })} />);
    // Scope to the measurement grid — the header-field table also has a tbody.
    const bodyRows = container.querySelectorAll("table.print-repeat tbody tr");
    expect(bodyRows.length).toBe(53);
  });

  it("marks out-of-tolerance samples with the fail treatment and the row verdict ✗", () => {
    const data = dimData({
      rows: [
        {
          serial: 1,
          label: "Length",
          symbol: null,
          isReference: false,
          nominal: 2065,
          tolPlus: 2,
          tolMinus: 2,
          instrumentCode: "VC-04",
          values: [2068, 2064, 2065, 2064.5, 2065.5], // 2068 breaches max 2067
        },
      ],
    });
    const { container } = render(<ReportDim data={data} />);
    const firstRow = container.querySelector("table.print-repeat tbody tr");
    expect(firstRow).not.toBeNull();
    const cells = within(firstRow as HTMLElement);
    expect(cells.getByText("2068")).toBeTruthy(); // the breaching sample prints
    expect(cells.getByText("✗")).toBeTruthy(); // row verdict glyph survives B/W
  });

  it("prints the rejection comments from the QH sign-off history (SO-03)", () => {
    const data = dimData({
      signOffs: [
        { role: "INSPECTOR", name: "R Patil", decision: "SUBMIT", comments: null, signedAtIso: "2026-09-16T09:30:00Z" },
        {
          role: "QUALITY_HEAD",
          name: "S Kulkarni",
          decision: "REJECT",
          comments: "Dimension 12 out of tolerance — recheck and resubmit.",
          signedAtIso: "2026-09-16T11:00:00Z",
        },
      ],
    });
    render(<ReportDim data={data} />);
    expect(screen.getByText(/recheck and resubmit/i)).toBeTruthy();
  });

  it("renders the pending QH sign-off as unsigned (— date) when absent", () => {
    const { container } = render(<ReportDim data={dimData()} />);
    const dls = container.querySelectorAll("dl");
    expect(dls.length).toBe(2); // inspector block + QH block
    const qhBlock = dls[1];
    expect(qhBlock).not.toBeNull();
    // No QH sign-off ⇒ name and date render as the pending dash.
    expect(within(qhBlock as HTMLElement).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("derives the QMS file name per spec §7", () => {
    expect(fileNameFor(dimData())).toBe("STQC02_W1G00005572_2604-02_20260916.pdf");
  });

  it("uses the controlled format metadata on the sheet title", () => {
    expect(sheetTitle(dimData())).toBe("Dimensional Inspection Report");
  });
});

describe("ReportCoating — ST/QC/04 (spec §4)", () => {
  it("prints the psychrometric verdict AS RECORDED — APPROVED stays approved", () => {
    render(<ReportCoating data={coatData()} />);
    expect(screen.getByText("✓ APPROVED")).toBeTruthy();
  });

  it("prints PROHIBITED-at-time for a violating coat event without re-judging", () => {
    const data = coatData();
    const first = data.coats[0];
    if (first === undefined) throw new Error("fixture must have coat 1");
    first.verdict = "PROHIBITED";
    render(<ReportCoating data={data} />);
    expect(screen.getByText("✗ PROHIBITED at time")).toBeTruthy();
  });

  it("computes the DFT statistics block from the recorded grid (edge 6.4)", () => {
    render(<ReportCoating data={coatData()} />);
    // Inside nominal 240: mean of the fixture = 6316/26 ≈ 242.9.
    expect(screen.getAllByText("ISO 19840 PASS").length).toBe(2); // both sides
    expect(screen.getByText("242.9")).toBeTruthy(); // live mean, not stored stats
  });

  it("flags 80/200 breaches in the DFT grid with the fail treatment", () => {
    const data = coatData();
    data.dft.INSIDE = data.dft.INSIDE.map((v, i) => (i === 0 ? 180 : v)); // 0.75× ⇒ breach
    render(<ReportCoating data={data} />);
    expect(screen.getAllByText("ISO 19840 FAIL").length).toBe(1);
  });

  it("renders the NACE certification line on the inspector sign-off (PDF-03)", () => {
    render(<ReportCoating data={coatData()} />);
    // Section title AND the sign-off block's role/certification line.
    expect(screen.getAllByText(/NACE CIP Level 2/i).length).toBeGreaterThanOrEqual(2);
  });

  it("prints surface prep Section A presets", () => {
    render(<ReportCoating data={coatData()} />);
    expect(screen.getByText("Sa 2.5")).toBeTruthy();
    expect(screen.getByText("G-40")).toBeTruthy();
  });
});
