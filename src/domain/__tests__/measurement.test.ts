import { describe, it, expect } from "vitest";
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
});
