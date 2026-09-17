import { describe, expect, it } from "vitest";
import { canTransition, nextStatus } from "../batch-state";

/**
 * Batch state-machine parity tests (findings F-07, Phase 3 closure) — the UI
 * gate (`batch-state.ts`) must mirror the DB trigger (migration 003) exactly:
 * the 4 legal edges exist, everything else is refused, and APPROVED is
 * terminal (SO-04 immutability).
 */

describe("batch state machine (F-07)", () => {
  it("allows exactly the four legal edges", () => {
    expect(canTransition("DRAFT", "submit")).toBe(true);
    expect(canTransition("SUBMITTED", "reject")).toBe(true);
    expect(canTransition("SUBMITTED", "approve")).toBe(true);
    expect(canTransition("REJECTED", "revise")).toBe(true);
  });

  it("refuses every illegal edge", () => {
    expect(canTransition("DRAFT", "approve")).toBe(false);
    expect(canTransition("DRAFT", "reject")).toBe(false);
    expect(canTransition("DRAFT", "revise")).toBe(false);
    expect(canTransition("SUBMITTED", "submit")).toBe(false);
    expect(canTransition("REJECTED", "approve")).toBe(false);
    expect(canTransition("APPROVED", "reject")).toBe(false);
    expect(canTransition("APPROVED", "revise")).toBe(false);
  });

  it("APPROVED is terminal — no transition exists out of it (SO-04)", () => {
    for (const via of ["submit", "reject", "approve", "revise"] as const) {
      expect(canTransition("APPROVED", via)).toBe(false);
      expect(nextStatus("APPROVED", via)).toBeNull();
    }
  });

  it("nextStatus returns the target status for legal edges only", () => {
    expect(nextStatus("DRAFT", "submit")).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "approve")).toBe("APPROVED");
    expect(nextStatus("SUBMITTED", "reject")).toBe("DRAFT");
    expect(nextStatus("REJECTED", "revise")).toBe("DRAFT");
    expect(nextStatus("DRAFT", "approve")).toBeNull();
  });
});
