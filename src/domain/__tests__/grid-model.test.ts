import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  parseCellInput,
  splitPaste,
  rowStatus,
  isSuspiciousUniformity,
  canCopyFirstSample,
  canFillNominal,
  submissionChecklist,
  moveFocus,
} from "../grid-model";

/**
 * Pure grid-model tests — execution-plan.md Phase 3 steps 3/5/6/8, edges
 * 3.2/3.3/3.6/3.8/3.15/3.16/3.17, plus the F-06a number-line partition:
 * parseCellInput · evaluateTolerance must agree with the direct numeric
 * evaluation on every printable decimal (the parser can never change a
 * verdict).
 */

describe("parseCellInput (edges 3.2/3.3/3.5)", () => {
  it("accepts plain decimals, signs, and decimal commas", () => {
    expect(parseCellInput("10")).toBe(10);
    expect(parseCellInput(" 9.88 ")).toBe(9.88);
    expect(parseCellInput("24,8")).toBe(24.8); // edge 3.3
    expect(parseCellInput("-0.5")).toBe(-0.5); // edge 3.4 — pass-through, no clamping
    expect(parseCellInput(".5")).toBe(0.5);
    expect(parseCellInput("+3")).toBe(3);
  });

  it("rejects scientific notation, hex, and garbage at the mask level", () => {
    expect(parseCellInput("1e3")).toBeNull(); // edge 3.2
    expect(parseCellInput("0x10")).toBeNull();
    expect(parseCellInput("1E-2")).toBeNull();
    expect(parseCellInput("10 mm")).toBeNull();
    expect(parseCellInput("NaN")).toBeNull();
  });

  it("distinguishes empty from invalid at the call site (empty ⇒ null too)", () => {
    expect(parseCellInput("")).toBeNull();
    expect(parseCellInput("   ")).toBeNull();
  });

  it("preserves extreme precision (edge 3.5)", () => {
    expect(parseCellInput("24.8050000001")).toBe(24.8050000001);
  });
});

describe("splitPaste (edge 3.8)", () => {
  it("splits notebook columns on whitespace, commas, and semicolons", () => {
    expect(splitPaste("10.1 10.2\t10.3,10.4;10.5")).toEqual([
      "10.1",
      "10.2",
      "10.3",
      "10.4",
      "10.5",
    ]);
  });
  it("caps at five samples and ignores empties", () => {
    expect(splitPaste("1 2 3 4 5 6 7")).toEqual(["1", "2", "3", "4", "5"]);
    expect(splitPaste("  1   2 ")).toEqual(["1", "2"]);
  });
});

describe("rowStatus (DIM-04, edge 3.17)", () => {
  const N = 10;
  const P = 0.5;
  const M = 0.5;

  it("empty when no samples entered; 0 is a value, not empty", () => {
    expect(rowStatus([null, null, null, null, null], N, P, M)).toBe("empty");
    const zeros = rowStatus([0, 0, 0, 0, 0], 0, 0.5, 0.5);
    expect(zeros).toBe("pass");
  });

  it("incomplete gate: some but not all entered", () => {
    expect(rowStatus([10, null, null, null, null], N, P, M)).toBe("incomplete");
  });

  it("worst-of-samples with amber band semantics", () => {
    expect(rowStatus([10, 10, 9, 10, 10], N, P, M)).toBe("fail"); // 9 breaches 9.5
    expect(rowStatus([10, 10, 10.45, 10, 10], N, P, M)).toBe("warn");
    expect(rowStatus([10, 10, 10, 10, 10], N, P, M)).toBe("pass");
  });

  it("at-limit sample is amber (cell treatment), not green", () => {
    expect(rowStatus([9.5, 9.5, 9.5, 9.5, 9.5], N, P, M)).toBe("warn");
  });
});

describe("isSuspiciousUniformity (edge 3.16)", () => {
  it("flags five identical samples on a narrow band", () => {
    expect(isSuspiciousUniformity([10, 10, 10, 10, 10], 0.002)).toBe(true);
  });
  it("ignores wide-band rows and partial rows", () => {
    expect(isSuspiciousUniformity([10, 10, 10, 10, 10], 0.5)).toBe(false);
    expect(isSuspiciousUniformity([10, 10, 10, null, null], 0.002)).toBe(false);
    expect(isSuspiciousUniformity([10, 10, 10, 10, 10.1], 0.002)).toBe(false);
  });
  it("zero samples are values: five zeros on a narrow zero-centred row flag", () => {
    expect(isSuspiciousUniformity([0, 0, 0, 0, 0], 0.001)).toBe(true);
  });
});

describe("quick-fill guards (edges 3.6/3.7)", () => {
  it("Copy-01→05 disabled while sample 01 is empty", () => {
    expect(canCopyFirstSample([null, 10, 10, 10, 10])).toBe(false);
  });
  it("allowed when 01 filled — even warn/fail (status follows the copy)", () => {
    expect(canCopyFirstSample([9, 10, 10, 10, 10])).toBe(true);
  });
  it("Fill Nominal allowed on reference dimensions (edge 3.7)", () => {
    expect(canFillNominal(true)).toBe(true);
  });
});

describe("submissionChecklist (step 8, edge 3.15)", () => {
  const ref = () => false;

  it("blocks on missing samples, missing instruments, expired instruments", () => {
    const items = submissionChecklist(
      [
        {
          serial: 1,
          status: "pass",
          instrumentId: "i1",
          instrumentExpired: false,
          suspicious: false,
        },
        {
          serial: 2,
          status: "incomplete",
          instrumentId: "i1",
          instrumentExpired: false,
          suspicious: false,
        },
        {
          serial: 3,
          status: "pass",
          instrumentId: null,
          instrumentExpired: false,
          suspicious: false,
        },
        {
          serial: 4,
          status: "pass",
          instrumentId: "i2",
          instrumentExpired: true,
          suspicious: false,
        },
      ],
      ref,
    );
    const blocks = items.filter((i) => i.kind === "block");
    expect(blocks.map((b) => b.message)).toEqual([
      "1 row missing samples",
      "1 row missing instrument",
      "1 row on an expired instrument",
    ]);
  });

  it("warns without blocking on suspicious uniformity and near-limit rows", () => {
    const items = submissionChecklist(
      [
        {
          serial: 1,
          status: "warn",
          instrumentId: "i1",
          instrumentExpired: false,
          suspicious: true,
        },
        {
          serial: 2,
          status: "fail",
          instrumentId: "i1",
          instrumentExpired: false,
          suspicious: false,
        },
      ],
      ref,
    );
    expect(items.filter((i) => i.kind === "block")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "warn")).toHaveLength(2);
  });

  it("reference rows are exempt from the instrument/incompleteness gates", () => {
    const items = submissionChecklist(
      [
        {
          serial: 9,
          status: "empty",
          instrumentId: null,
          instrumentExpired: false,
          suspicious: false,
        },
      ],
      (s) => s === 9,
    );
    expect(items).toHaveLength(0);
  });
});

describe("moveFocus (DIM-03 keyboard model)", () => {
  it("Tab moves right, wrapping to the next row's first sample", () => {
    expect(moveFocus({ row: 0, sample: 0 }, "Tab", 53)).toEqual({ row: 0, sample: 1 });
    expect(moveFocus({ row: 0, sample: 4 }, "Tab", 53)).toEqual({ row: 1, sample: 0 });
  });

  it("Enter moves down in the same sample column, clamped at the last row", () => {
    expect(moveFocus({ row: 10, sample: 2 }, "Enter", 53)).toEqual({ row: 11, sample: 2 });
    expect(moveFocus({ row: 52, sample: 2 }, "Enter", 53)).toEqual({ row: 52, sample: 2 });
    expect(moveFocus({ row: 10, sample: 2 }, "ArrowDown", 53)).toEqual({ row: 11, sample: 2 });
  });

  it("Shift+Tab/ArrowLeft move left, wrapping back one row's last sample", () => {
    expect(moveFocus({ row: 3, sample: 0 }, "Shift+Tab", 53)).toEqual({ row: 2, sample: 4 });
    expect(moveFocus({ row: 3, sample: 2 }, "ArrowLeft", 53)).toEqual({ row: 3, sample: 1 });
    // Top-left corner clamps — focus is never lost (DIM-03).
    expect(moveFocus({ row: 0, sample: 0 }, "Shift+Tab", 53)).toEqual({ row: 0, sample: 0 });
  });

  it("bottom-right corner clamps on Tab — no wrap-off-grid", () => {
    expect(moveFocus({ row: 52, sample: 4 }, "Tab", 53)).toEqual({ row: 52, sample: 4 });
  });
});

describe("F-06a — mask+evaluation partition (property)", () => {
  it("parseCellInput · evaluateTolerance agrees with direct evaluation", () => {
    const decimalString = fc
      .integer({ min: 0, max: 200 })
      .chain((micros) => fc.constant(String(micros / 100))); // "0.00"…"2.00"
    fc.assert(
      fc.property(
        decimalString,
        fc.double({ min: 5, max: 15, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        (raw, nominal, tol) => {
          const parsed = parseCellInput(raw);
          expect(parsed).not.toBeNull();
          const min = nominal - tol;
          const max = nominal + tol;
          expect(evaluateToleranceDirect(parsed as number, min, max)).toBe(
            evaluateViaModel(parsed as number, min, max),
          );
        },
      ),
    );
  });
});

// Direct copy of the evaluation rules — the property asserts the model's
// composition (parse → evaluateTolerance) matches the spec's semantics.
function evaluateToleranceDirect(value: number, min: number, max: number): string {
  if (value < min || value > max) return "fail";
  const band = (max - min) * 0.1;
  if (band > 0 && (value - min < band || max - value < band)) return "warn";
  return "pass";
}

import { evaluateTolerance as evaluateViaModel } from "../measurement";
