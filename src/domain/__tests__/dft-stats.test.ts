import { describe, it, expect } from "vitest";
import { computeDftStats, evaluateIso19840 } from "../dft-stats";

describe("computeDftStats", () => {
  const NOMINAL_C4 = 240; // Inside system: C4 High (PRD COAT-05)

  it("skips null points instead of treating them as zero", () => {
    const stats = computeDftStats([240, 250, null, 230, null], NOMINAL_C4);
    expect(stats.count).toBe(3);
    expect(stats.min).toBe(230);
    expect(stats.max).toBe(250);
    expect(stats.mean).toBeCloseTo(240, 10);
  });

  it("computes standard deviation over entered readings", () => {
    const stats = computeDftStats([240, 240, 240, 240], NOMINAL_C4);
    expect(stats.stdDev).toBe(0);
  });

  it("counts 80/200 rule breaches", () => {
    // 0.8 * 240 = 192; 2 * 240 = 480
    const stats = computeDftStats([191, 481, 240, 300], NOMINAL_C4);
    expect(stats.belowCount).toBe(1);
    expect(stats.aboveCount).toBe(1);
  });
});

describe("evaluateIso19840", () => {
  const NOMINAL_C3 = 180; // Outside system: C3 High

  it("passes a compliant set", () => {
    const stats = computeDftStats(
      [180, 185, 190, 175, 182, 178],
      NOMINAL_C3,
    );
    expect(evaluateIso19840(stats)).toEqual({ compliant: true });
  });

  it("fails on a reading below 80% of nominal", () => {
    const stats = computeDftStats([143, 180, 185, 190, 175], NOMINAL_C3);
    expect(evaluateIso19840(stats)).toMatchObject({
      compliant: false,
      reason: "below-80",
    });
  });

  it("fails on a reading above 200% of nominal", () => {
    const stats = computeDftStats([361, 180, 185, 190, 175], NOMINAL_C3);
    expect(evaluateIso19840(stats)).toMatchObject({
      compliant: false,
      reason: "above-200",
    });
  });

  it("requires at least 5 readings", () => {
    const stats = computeDftStats([180, 180, 180, 180], NOMINAL_C3);
    expect(evaluateIso19840(stats)).toMatchObject({
      compliant: false,
      reason: "insufficient-readings",
    });
  });
});
