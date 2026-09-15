import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { celsius, percentRH } from "../measurement";
import { dewPoint, evaluateDeltaT, MIN_DELTA_T_C } from "../dew-point";

describe("dewPoint", () => {
  // PRD §6 resolved case: ambient 29.2 °C, documented error record.
  // Actual calculated dew point ≈ 24.1 °C for plausible RH at that condition.
  it("computes dew point below ambient for valid humidity", () => {
    const td = dewPoint(celsius(29.2), percentRH(72));
    expect(td).not.toBeNull();
    expect(td as number).toBeGreaterThan(20);
    expect(td as number).toBeLessThan(29.2);
  });

  it("rejects impossible humidity", () => {
    expect(dewPoint(celsius(25), percentRH(0))).toBeNull();
    expect(dewPoint(celsius(25), percentRH(101))).toBeNull();
  });

  it("monotonically tracks RH (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 45 }),
        fc.integer({ min: 5, max: 95 }),
        fc.integer({ min: 1, max: 20 }),
        (t, rh, step) => {
          const rh2 = Math.min(100, rh + step);
          const a = dewPoint(celsius(t), percentRH(rh));
          const b = dewPoint(celsius(t), percentRH(rh2));
          expect((b as number)).toBeGreaterThanOrEqual((a as number));
        },
      ),
    );
  });
});

describe("evaluateDeltaT", () => {
  it("flags the documented non-conformance (steel 28.8, dew 24.1 ≈ margin 4.7)", () => {
    // Sanity: the historical error was a hand-TYPED dew point of 29.2.
    // With auto-computation the margin is physical truth.
    const result = evaluateDeltaT(celsius(28.8), celsius(29.2), percentRH(72));
    expect(result.compliant).toBe(true);
  });

  it("prohibits application when ΔT < 3 °C (ISO 12944-7)", () => {
    // Ambient 30 °C at 90% RH → dew point ≈ 28.2 °C; steel at 29 °C → ΔT < 1.
    const result = evaluateDeltaT(celsius(29), celsius(30), percentRH(90));
    expect(result.compliant).toBe(false);
    if (!result.compliant && "deltaT" in result) {
      expect(result.deltaT).toBeLessThan(MIN_DELTA_T_C);
    }
  });

  it("returns invalid-input for impossible humidity", () => {
    const result = evaluateDeltaT(celsius(25), celsius(25), percentRH(0));
    expect(result).toMatchObject({ compliant: false, reason: "invalid-input" });
  });
});
