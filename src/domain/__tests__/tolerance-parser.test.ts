import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseDimension, deriveLimits } from "../tolerance-parser";

describe("parseDimension", () => {
  it("parses a bracketed reference dimension", () => {
    const parsed = parseDimension("(2065)");
    expect(parsed).not.toBeNull();
    expect(parsed?.nominal).toBe(2065);
    expect(parsed?.isReference).toBe(true);
  });

  it("parses a diameter symbol", () => {
    const parsed = parseDimension("Ø12");
    expect(parsed?.nominal).toBe(12);
    expect(parsed?.symbol).toBe("diameter");
  });

  it("parses an angle", () => {
    const parsed = parseDimension("100°");
    expect(parsed?.nominal).toBe(100);
    expect(parsed?.symbol).toBe("angle");
  });

  it("parses symmetric tolerance", () => {
    const parsed = parseDimension("10 ±0.5");
    expect(parsed?.nominal).toBe(10);
    expect(parsed?.tolerancePlus).toBe(0.5);
    expect(parsed?.toleranceMinus).toBe(0.5);
  });

  it("parses asymmetric tolerance", () => {
    const parsed = parseDimension("10 +0.2/-0.1");
    expect(parsed?.nominal).toBe(10);
    expect(parsed?.tolerancePlus).toBe(0.2);
    expect(parsed?.toleranceMinus).toBe(0.1);
  });

  it("returns null for pure text cells", () => {
    expect(parseDimension("GO / NO-GO")).toBeNull();
    expect(parseDimension("")).toBeNull();
  });

  it("never derives Min > Max (property, PRD IM-03)", () => {
    const arb = fc.tuple(
      fc.double({ min: 0.1, max: 5000, noNaN: true }),
      fc.double({ min: 0, max: 50, noNaN: true }),
      fc.double({ min: 0, max: 50, noNaN: true }),
    );
    fc.assert(
      fc.property(arb, ([nominal, plus, minus]) => {
        const limits = deriveLimits({
          nominal,
          tolerancePlus: plus,
          toleranceMinus: minus,
          symbol: null,
          isReference: false,
        });
        expect(limits.min).toBeLessThanOrEqual(limits.max);
      }),
    );
  });
});
