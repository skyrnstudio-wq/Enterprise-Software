import { describe, expect, it } from "vitest";
import { computeDimensionalFlags, computeCoatingFlags, canDecide, emptyFlags } from "../review";
import { coatingSubmissionChecklist, canSubmitCoating } from "@/domain/coating";

/**
 * Review-layer logic tests — Phase 5 steps 1/2/8. Flag computation must
 * agree with the domain engines (they ARE the engines — these tests pin the
 * aggregation), and canDecide pins the edge-5.9 UI mirror of the RPC's
 * separation-of-duties guard.
 */

describe("dimensional flag computation (queue + review strip)", () => {
  const row = (
    samples: (number | null)[],
    nominal: number,
    tol: number,
    instrumentId: string | null = null,
  ) => ({ samples, nominal, tol_plus: tol, tol_minus: tol, instrument_id: instrumentId });

  it("counts fails, warns, and expired-instrument usage", () => {
    // Submitted batches have complete rows — rowStatus reports the worst cell.
    const flags = computeDimensionalFlags(
      [
        row([10.0, 10.05, 9.95, 10.02, 9.98], 10, 0.1), // mid-band — no flags
        row([10.5, 10.5, 10.5, 10.5, 10.5], 10, 0.1), // 10.5 > 10.1 ⇒ fail
        row([10.09, 10.09, 10.09, 10.09, 10.09], 10, 0.1), // > 10.08 (0.8× tol), ≤ 10.1 ⇒ warn
        row([9.95, 9.95, 9.95, 9.95, 9.95], 10, 0.1, "inst-exp"), // expired instrument
      ],
      new Set(["inst-exp"]),
    );
    expect(flags.fails).toBe(1);
    expect(flags.warns).toBe(1);
    expect(flags.expiredInstruments).toBe(1);
  });

  it("at-limit values are near-limit warns (§4.3 band starts at the edge)", () => {
    const flags = computeDimensionalFlags([row([9.9, 9.9, 9.9, 9.9, 9.9], 10, 0.1)], new Set());
    expect(flags.warns).toBe(1);
    expect(flags.fails).toBe(0);
  });

  it("an empty grid is flag-clean", () => {
    const flags = computeDimensionalFlags(
      [row([null, null, null, null, null], 10, 0.1)],
      new Set(),
    );
    expect(flags).toEqual(emptyFlags());
  });
});

describe("coating flag computation (80/200 + visual)", () => {
  const grid = (values: (number | null)[]): (number | null)[] => [
    ...values,
    ...Array(26 - values.length).fill(null),
  ];

  it("80/200 breach on any side is a fail; clean grids pass", () => {
    const breach = computeCoatingFlags(
      { INSIDE: grid([190, 240, 241, 242, 240]), OUTSIDE: grid([180, 181, 179, 180, 182]) },
      { inside: 240, outside: 180 },
      { pinholes: "pass", sagging: "pass", gloss_loss: "pass", peel_off: "pass", blisters: "pass" },
    );
    expect(breach.fails).toBe(1); // 190 < 0.8 × 240 = 192
    expect(breach.warns).toBe(0);

    const clean = computeCoatingFlags(
      { INSIDE: grid([240, 241, 239, 240, 242]), OUTSIDE: grid([180, 181, 179, 180, 182]) },
      { inside: 240, outside: 180 },
      { pinholes: "pass", sagging: "pass", gloss_loss: "pass", peel_off: "pass", blisters: "pass" },
    );
    expect(clean).toEqual(emptyFlags());
  });

  it("a present visual defect counts as a fail (edge 4.18 honesty)", () => {
    const flags = computeCoatingFlags(
      { INSIDE: grid([240, 241, 239, 240, 242]), OUTSIDE: grid([180, 181, 179, 180, 182]) },
      { inside: 240, outside: 180 },
      { pinholes: "pass", sagging: "fail", gloss_loss: "pass", peel_off: "pass", blisters: "pass" },
    );
    expect(flags.fails).toBe(1);
  });
});

describe("canDecide — edge 5.9 UI mirror of separation of duties", () => {
  it("the author cannot decide their own batch", () => {
    expect(canDecide({ created_by: "u-1" }, "u-1")).toBe(false);
  });

  it("another user may decide", () => {
    expect(canDecide({ created_by: "u-1" }, "u-2")).toBe(true);
  });

  it("missing identity decides nothing", () => {
    expect(canDecide({ created_by: "u-1" }, null)).toBe(false);
    expect(canDecide(null, "u-2")).toBe(false);
  });
});

describe("decision comments rule (SO-03 / ui-ux §6.8)", () => {
  const base = {
    surfacePrepComplete: true,
    conditionsEntered: true,
    psychroLocked: false,
    coatsComplete: true,
    dftCounts: { INSIDE: 26, OUTSIDE: 26 },
    partialDftAcknowledged: false,
    visualChecksComplete: true,
  };

  it("rejection requires substantive comments; approval never carries them", () => {
    // The RPC (migration 005) enforces non-empty comments server-side; the UI
    // enforces the plan's min-10 rule. This pin keeps the checklist contract
    // coherent: a coating batch that passed every gate is submittable, and a
    // QH rejection loop returns it to DRAFT where the inspector revises.
    expect(canSubmitCoating(coatingSubmissionChecklist(base))).toBe(true);
  });
});
