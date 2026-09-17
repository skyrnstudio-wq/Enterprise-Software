import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { evaluateTolerance } from "../measurement";

describe("evaluateTolerance (PRD DIM-04)", () => {
  // Limits 10 ± 0.5 → min 9.5, max 10.5, band 1.0, amber within 0.1 of edge.
  const MIN = 9.5;
  const MAX = 10.5;

  it("green within limits", () => {
    expect(evaluateTolerance(10, MIN, MAX)).toBe("pass");
    expect(evaluateTolerance(9.8, MIN, MAX)).toBe("pass");
  });

  it("red breaches a limit", () => {
    expect(evaluateTolerance(9.4, MIN, MAX)).toBe("fail");
    expect(evaluateTolerance(10.6, MIN, MAX)).toBe("fail");
  });

  it("amber within 10% of a tolerance edge", () => {
    expect(evaluateTolerance(9.55, MIN, MAX)).toBe("warn");
    expect(evaluateTolerance(10.45, MIN, MAX)).toBe("warn");
  });

  it("handles zero-band limits without amber", () => {
    expect(evaluateTolerance(10, 10, 10)).toBe("pass");
  });

  it("extreme magnitudes stay finite and classified (no NaN/Infinity leak)", () => {
    expect(evaluateTolerance(0, 0, 0)).toBe("pass");
    // AT the limit is amber: §4.3's 10% band starts at the edge. The PASS
    // verdict for on-limit readings (edge 3.1) is a separate, looser
    // comparison made by submit_batch — the cell treatment is intentionally
    // the more conservative of the two layers.
    expect(evaluateTolerance(1e12, 0, 1e12)).toBe("warn");
    expect(evaluateTolerance(1e12 + 1, 0, 1e12)).toBe("fail");
  });

  // F-06 closure — the number-line partition property (testing-quality-plan):
  // evaluation is total across the magnitudes a micrometer/CMM produces, and
  // the classification never contradicts the limit comparison. Offsets are
  // built with a margin (≥ 0.01) so sub-ULP boundary rounding cannot flip a
  // comparison — the property tests semantics, not IEEE 754.
  it("partitions the number line into disjoint pass/warn/fail (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100_000, max: 100_000, noNaN: true }), // nominal
        fc.double({ min: 0, max: 1_000, noNaN: true }), // tolPlus
        fc.double({ min: 0, max: 1_000, noNaN: true }), // tolMinus
        fc.boolean(), // outside the limits?
        fc.boolean(), // which side
        fc.double({ min: 0.01, max: 1_000, noNaN: true }), // margin from the edge
        (nominal, tolPlus, tolMinus, outside, beyondMax, margin) => {
          const min = nominal - tolMinus;
          const max = nominal + tolPlus;
          const offset = outside
            ? beyondMax
              ? tolPlus + margin
              : -(tolMinus + margin)
            : beyondMax
              ? tolPlus * 0.5
              : -tolMinus * 0.5;
          const status = evaluateTolerance(nominal + offset, min, max);
          if (outside) {
            expect(status).toBe("fail");
          } else {
            // Strictly inside: never red. Amber near an edge is §4.3's band.
            expect(status).not.toBe("fail");
          }
        },
      ),
    );
  });
});
