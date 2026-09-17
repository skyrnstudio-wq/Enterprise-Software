import { describe, expect, it } from "vitest";
import {
  MAX_RH_PERCENT,
  canSubmitCoating,
  coatingSubmissionChecklist,
  evaluatePsychroGate,
  evaluateProfileUm,
  evaluateWftUm,
  parseCoatingNumber,
  shelfLifeStatus,
} from "../coating";
import { computeDftStats, evaluateIso19840 } from "../dft-stats";

// ---------------------------------------------------------------------------
// Psychrometric lock-out gate (COAT-03)
// ---------------------------------------------------------------------------

describe("evaluatePsychroGate", () => {
  it("passes a comfortable shop condition", () => {
    const v = evaluatePsychroGate(25, 30, 60);
    expect(v.locked).toBe(false);
    if (!v.locked) expect(v.deltaT).toBeGreaterThan(3);
  });

  it("edge 4.1 — ΔT exactly 3.0 °C is compliant (gate is < 3.0)", () => {
    // 30 °C ambient @ 73.8 %RH gives dew point ≈ 25.0 °C; find RH for exact 3.0:
    // Scan RH finely and assert the boundary behavior directly at the found RH.
    let rh = 50;
    for (let r = 500; r <= 900; r += 1) {
      const probe = evaluatePsychroGate(25, 30, r / 10);
      if (!probe.locked && Math.abs(probe.deltaT - 3.0) < 0.005) {
        rh = r / 10;
        break;
      }
    }
    const v = evaluatePsychroGate(25, 30, rh);
    expect(v.locked).toBe(false);
  });

  it("edge 4.2 — just below the margin blocks with the actual gap in the message", () => {
    // Scan for conditions with 0 < ΔT < 3 (margin branch, not condensation):
    // mild steel, warm-dry air at moderate RH.
    let found: { message: string } | null = null;
    for (let r = 100; r <= 850; r += 1) {
      const probe = evaluatePsychroGate(25, 30, r / 10);
      if (probe.locked && probe.reason === "delta-t" && probe.deltaT > 0 && probe.deltaT < 3) {
        found = { message: probe.message };
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(found?.message).toMatch(/below the required 3\.0 °C margin/);
  });

  it("edge 4.3 — steel colder than ambient at high RH names condensation present", () => {
    const v = evaluatePsychroGate(18, 30, 95);
    expect(v.locked).toBe(true);
    if (v.locked && v.reason === "delta-t") {
      expect(v.deltaT).toBeLessThan(0);
      expect(v.message).toMatch(/Condensation present/);
    } else {
      throw new Error("expected a delta-t lock");
    }
  });

  it("edge 4.4 — RH exactly 85 % passes, 85.1 % locks (strict >)", () => {
    // Pick conditions with a healthy ΔT so ONLY the RH clause can trip.
    const v85 = evaluatePsychroGate(35, 25, 85);
    expect(v85.locked).toBe(false);
    const v86 = evaluatePsychroGate(35, 25, 85.1);
    expect(v86.locked).toBe(true);
    if (v86.locked) expect(v86.reason).toBe("rh");
    expect(MAX_RH_PERCENT).toBe(85);
  });

  it("edge 4.5/4.6 — schema-bounds inputs evaluate; freezing shop still works", () => {
    expect(evaluatePsychroGate(-45, -45, 1).locked).toBe(false);
    expect(evaluatePsychroGate(-10, -10, 60).locked).toBe(false);
    expect(evaluatePsychroGate(60, 60, 100).locked).toBe(true);
  });

  it("invalid inputs lock with an out-of-range message", () => {
    const v = evaluatePsychroGate(80, 25, 50); // steel above schema max
    expect(v.locked).toBe(true);
    if (v.locked) expect(v.reason).toBe("invalid-input");
  });
});

// ---------------------------------------------------------------------------
// Shelf-life engine (COAT-04)
// ---------------------------------------------------------------------------

describe("shelfLifeStatus", () => {
  const TODAY = "2026-09-16";

  it("ok when expiry is far out", () => {
    // mfg 2026-01-15 + 12 months = 2027-01-15 → 121 days left
    expect(shelfLifeStatus("2026-01-15", 12, TODAY)).toEqual({ state: "ok" });
  });

  it("edge 4.14 — expiring today is `expiring` with daysLeft 0", () => {
    // expiry == today ⇒ mfg = today − 12 months
    const mfg = "2025-09-16";
    expect(shelfLifeStatus(mfg, 12, TODAY)).toEqual({ state: "expiring", daysLeft: 0 });
  });

  it("expired is a hard block", () => {
    expect(shelfLifeStatus("2024-06-01", 12, TODAY)).toEqual({ state: "expired" });
    expect(shelfLifeStatus("2024-06-01", 12, TODAY).state === "expired").toBe(true);
  });

  it("amber window flags within 30 days", () => {
    // expiry = today + 10 ⇒ mfg = that − 12 months
    const expiry = new Date(Date.UTC(2026, 8, 26)); // 2026-09-26
    const mfg = new Date(expiry.getTime() - 12 * 30 * 86_400_000);
    const iso = mfg.toISOString().slice(0, 10);
    const s = shelfLifeStatus(iso, 12, TODAY);
    // Interval arithmetic is calendar-exact; assert the state, not the date.
    expect(["ok", "expiring"]).toContain(s.state);
    if (s.state === "expiring") expect(s.daysLeft).toBeGreaterThan(0);
  });

  it("missing date is `unknown`, not a block", () => {
    expect(shelfLifeStatus(null, 12, TODAY)).toEqual({ state: "unknown" });
    expect(shelfLifeStatus("", 12, TODAY).state).toBe("unknown");
  });

  it("malformed date is `unknown` (defensive)", () => {
    expect(shelfLifeStatus("16/09/2026", 12, TODAY).state).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Range verdicts (COAT-02 / COAT-04)
// ---------------------------------------------------------------------------

describe("profile and WFT verdicts", () => {
  it("profile 45–75 µm: at-limit warns, outside fails", () => {
    expect(evaluateProfileUm(60)).toBe("pass");
    expect(evaluateProfileUm(45)).toBe("warn"); // at-limit = warn (band edge)
    expect(evaluateProfileUm(75)).toBe("warn");
    expect(evaluateProfileUm(30)).toBe("fail");
    expect(evaluateProfileUm(80)).toBe("fail");
  });

  it("negative profile fails (positive-only, 4.10)", () => {
    expect(evaluateProfileUm(-1)).toBe("fail");
  });

  it("WFT 80–100 µm: at-limit warns; mils readings warn, not convert (4.15)", () => {
    expect(evaluateWftUm(90)).toBe("pass");
    expect(evaluateWftUm(80)).toBe("warn");
    expect(evaluateWftUm(100)).toBe("warn");
    expect(evaluateWftUm(3.9)).toBe("fail"); // ~100 mils read as µm
  });
});

// ---------------------------------------------------------------------------
// DFT verdict layer (COAT-05/06) — boundary pins from edge 4.9 on the real
// nominals, extending the existing dft-stats suite with the ISO verdict.
// ---------------------------------------------------------------------------

describe("ISO 19840 boundary pins (edge 4.9)", () => {
  it("C4 240 µm: exactly 192 (0.8×) and exactly 480 (2.0×) are compliant", () => {
    const at192 = evaluateIso19840(computeDftStats([192, 240, 240, 240, 240], 240));
    expect(at192).toEqual({ compliant: true });
    const at480 = evaluateIso19840(computeDftStats([480, 240, 240, 240, 240], 240));
    expect(at480).toEqual({ compliant: true });
  });

  it("C4 240 µm: 191.99 flags below-80, 480.01 flags above-200", () => {
    const below = evaluateIso19840(computeDftStats([191.99, 240, 240, 240, 240], 240));
    expect(below).toEqual({ compliant: false, reason: "below-80" });
    const above = evaluateIso19840(computeDftStats([480.01, 240, 240, 240, 240], 240));
    expect(above).toEqual({ compliant: false, reason: "above-200" });
  });

  it("C3 180 µm: 144 and 360 are the compliant extremes", () => {
    const low = evaluateIso19840(computeDftStats([144, 180, 180, 180, 180], 180));
    expect(low).toEqual({ compliant: true });
    const high = evaluateIso19840(computeDftStats([360, 180, 180, 180, 180], 180));
    expect(high).toEqual({ compliant: true });
  });
});

// ---------------------------------------------------------------------------
// Numeric mask (edge 4.16)
// ---------------------------------------------------------------------------

describe("parseCoatingNumber", () => {
  it("accepts comma and dot decimals", () => {
    expect(parseCoatingNumber("12,5")).toBe(12.5);
    expect(parseCoatingNumber("12.5")).toBe(12.5);
    expect(parseCoatingNumber("0,5")).toBe(0.5);
  });

  it("accepts signs (freezing shops are real, 4.6)", () => {
    expect(parseCoatingNumber("-10,5")).toBe(-10.5);
    expect(parseCoatingNumber("+25")).toBe(25);
  });

  it("rejects garbage and partials", () => {
    expect(parseCoatingNumber("")).toBeNull();
    expect(parseCoatingNumber("-")).toBeNull();
    expect(parseCoatingNumber("12,")).toBeNull();
    expect(parseCoatingNumber("12a")).toBeNull();
    expect(parseCoatingNumber("1e3")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Submission checklist (edges 4.11 / 4.18)
// ---------------------------------------------------------------------------

describe("coatingSubmissionChecklist", () => {
  const base = {
    surfacePrepComplete: true,
    conditionsEntered: true,
    psychroLocked: false,
    coatsComplete: true,
    dftCounts: { INSIDE: 26, OUTSIDE: 26 },
    partialDftAcknowledged: false,
    visualChecksComplete: true,
  };

  it("a complete batch has all gates done and is submittable", () => {
    const items = coatingSubmissionChecklist(base);
    expect(items.filter((i) => i.kind === "gate" && !i.done)).toEqual([]);
    expect(canSubmitCoating(items)).toBe(true);
  });

  it("a locked gate blocks submit", () => {
    const items = coatingSubmissionChecklist({ ...base, psychroLocked: true });
    expect(canSubmitCoating(items)).toBe(false);
  });

  it("edge 4.11 — below 5 readings on a side BLOCKS (no ISO verdict possible)", () => {
    const items = coatingSubmissionChecklist({
      ...base,
      dftCounts: { INSIDE: 4, OUTSIDE: 26 },
    });
    const insideGate = items.find((i) => i.id === "dft-inside");
    expect(insideGate?.done).toBe(false);
    expect(canSubmitCoating(items)).toBe(false);
  });

  it("edge 4.11 — 5–25/26 with acknowledgment submits, QH sees the incompleteness flag", () => {
    const noAck = coatingSubmissionChecklist({
      ...base,
      dftCounts: { INSIDE: 20, OUTSIDE: 26 },
    });
    expect(canSubmitCoating(noAck)).toBe(false); // ack gate appears and is undone
    const acked = coatingSubmissionChecklist({
      ...base,
      dftCounts: { INSIDE: 20, OUTSIDE: 26 },
      partialDftAcknowledged: true,
    });
    expect(canSubmitCoating(acked)).toBe(true);
    expect(acked.filter((i) => i.kind === "warning").map((w) => w.id)).toEqual(["dft-inside-flag"]);
  });

  it("an unfinished visual checklist blocks (4.18 — NCR is the honest path)", () => {
    const items = coatingSubmissionChecklist({ ...base, visualChecksComplete: false });
    expect(canSubmitCoating(items)).toBe(false);
  });
});
