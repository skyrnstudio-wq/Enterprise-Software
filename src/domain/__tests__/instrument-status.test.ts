import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { daysBetween, instrumentStatus, nextDueAt } from "../instrument-status";

/**
 * EQ-02 status engine tests — execution-plan.md Phase 2 step 9, plan §3 row
 * "Instrument status: unit tests incl. exact-date edges".
 */

describe("nextDueAt", () => {
  it("adds the interval in whole months (EQ-01)", () => {
    expect(nextDueAt("2026-09-15", 12)).toBe("2027-09-15");
    expect(nextDueAt("2026-09-15", 6)).toBe("2027-03-15");
  });

  it("clamps month-end overflow — an anniversary never skips a month (edge 2.10)", () => {
    expect(nextDueAt("2026-01-31", 1)).toBe("2026-02-28"); // non-leap target
    expect(nextDueAt("2024-01-31", 1)).toBe("2024-02-29"); // leap-year target
    expect(nextDueAt("2026-03-31", 1)).toBe("2026-04-30"); // 30-day target
  });

  it("keeps a 29 Feb anniversary inside February (leap-day calibration)", () => {
    expect(nextDueAt("2024-02-29", 12)).toBe("2025-02-28");
    expect(nextDueAt("2024-02-29", 48)).toBe("2028-02-29"); // next leap year
    expect(nextDueAt("2026-08-31", 2)).toBe("2026-10-31");
  });

  it("never returns a date in the wrong month for any input (property)", () => {
    const isoDate = fc
      .integer({ min: 2020, max: 2040 })
      .chain((y) =>
        fc
          .integer({ min: 1, max: 12 })
          .chain((m) =>
            fc
              .integer({ min: 1, max: 28 })
              .map(
                (d) => `${String(y)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
              ),
          ),
      );
    fc.assert(
      fc.property(isoDate, fc.integer({ min: 1, max: 60 }), (lastCal, months) => {
        const due = nextDueAt(lastCal, months);
        // Same day-of-month unless clamped, and never invalid:
        expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const [, mm = 0] = due.split("-").map(Number);
        const [, lmm = 0] = lastCal.split("-").map(Number);
        const expectedMonth = ((lmm - 1 + months) % 12) + 1;
        expect(mm).toBe(expectedMonth);
        expect(daysBetween(lastCal, due)).toBeGreaterThan(0);
      }),
    );
  });
});

describe("daysBetween", () => {
  it("is signed and whole-day exact", () => {
    expect(daysBetween("2026-09-15", "2026-09-15")).toBe(0);
    expect(daysBetween("2026-09-15", "2026-09-16")).toBe(1);
    expect(daysBetween("2026-09-15", "2026-09-14")).toBe(-1);
  });

  it("crosses month and year boundaries as plain arithmetic (edge 2.12)", () => {
    expect(daysBetween("2026-12-25", "2027-01-02")).toBe(8);
    expect(daysBetween("2027-01-02", "2026-12-25")).toBe(-8);
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3); // leap Feb
  });
});

describe("instrumentStatus (EQ-02, edges 2.11 + 2.12)", () => {
  it("treats the due date itself as EXPIRED — expiry at 00:00 of due date", () => {
    expect(instrumentStatus("2026-09-15", "2026-09-15")).toBe("EXPIRED");
  });

  it("gives one day of grace window before the 15-day amber boundary", () => {
    expect(instrumentStatus("2026-09-15", "2026-09-16")).toBe("DUE_SOON");
    expect(instrumentStatus("2026-09-15", "2026-09-30")).toBe("DUE_SOON"); // day 15
    expect(instrumentStatus("2026-09-15", "2026-10-01")).toBe("ACTIVE"); // day 16
  });

  it("amber window survives month/year rollover (edge 2.12)", () => {
    // due 2027-01-02, today 2026-12-25 → 8 days, must be DUE_SOON
    expect(instrumentStatus("2026-12-25", "2027-01-02")).toBe("DUE_SOON");
    expect(instrumentStatus("2026-12-31", "2027-01-15")).toBe("DUE_SOON"); // 15 days
    expect(instrumentStatus("2026-12-31", "2027-01-16")).toBe("ACTIVE"); // 16 days
  });

  it("classifies far-future and past dates plainly", () => {
    expect(instrumentStatus("2026-09-15", "2031-01-01")).toBe("ACTIVE");
    expect(instrumentStatus("2026-09-15", "2020-01-01")).toBe("EXPIRED");
  });
});
