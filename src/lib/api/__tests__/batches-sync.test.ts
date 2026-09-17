import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { drainSync } from "../batches";
import { db } from "@/lib/dexie/db";

/**
 * Offline drain tests — execution-plan.md Phase 3 step 11 + offline doc §3.
 * The sender is injected, so the truth table is pinned without a network:
 * resolve ⇒ applied+delete · retryable throw ⇒ attempts+1, keep ·
 * fatal (BT_ errors and revision conflicts) ⇒ mark frozen, keep for review (edge 3.14).
 */

describe("drainSync (Phase 3 step 11)", () => {
  beforeEach(async () => {
    await Promise.all([db.drafts.clear(), db.pendingSync.clear()]);
  });

  it("applies records in FIFO order and deletes them from the queue", async () => {
    const seen: string[] = [];
    await db.pendingSync.bulkAdd([
      {
        table: "submit_batch",
        operation: "insert",
        payload: { n: 1 },
        createdAt: "2026-09-16T10:00:00Z",
        attempts: 0,
      },
      {
        table: "submit_batch",
        operation: "insert",
        payload: { n: 2 },
        createdAt: "2026-09-16T10:01:00Z",
        attempts: 0,
      },
    ]);
    const result = await drainSync(async (r) => {
      seen.push(String((r.payload as { n: number }).n));
      await Promise.resolve();
    });
    expect(seen).toEqual(["1", "2"]); // oldest first
    expect(result.applied).toBe(2);
    expect(result.retried).toBe(0);
    expect(await db.pendingSync.count()).toBe(0);
  });

  it("keeps and increments attempts for retryable failures", async () => {
    await db.pendingSync.add({
      table: "submit_batch",
      operation: "insert",
      payload: {},
      createdAt: "2026-09-16T10:00:00Z",
      attempts: 0,
    });
    const result = await drainSync(async () => {
      await Promise.resolve();
      throw new Error("network unreachable");
    });
    expect(result.retried).toBe(1);
    const record = await db.pendingSync.toArray();
    expect(record[0]?.attempts).toBe(1);
  });

  it("marks fatal BT_* rejections frozen for review instead of retrying (edge 3.14)", async () => {
    await db.pendingSync.add({
      table: "submit_batch",
      operation: "insert",
      payload: { draft: { batchId: "b-1" } },
      createdAt: "2026-09-16T10:00:00Z",
      attempts: 0,
    });
    const result = await drainSync(async () => {
      await Promise.resolve();
      throw new Error("BT_STATE: batch already approved");
    });
    expect(result.failed).toBe(1);
    const record = await db.pendingSync.toArray();
    expect(record[0]?.attempts).toBe(999);
    expect((record[0]?.payload as { conflict?: string }).conflict).toContain("BT_STATE");
  });

  it("reports mixed outcomes across one drain", async () => {
    await db.pendingSync.bulkAdd([
      {
        table: "a",
        operation: "insert",
        payload: {},
        createdAt: "2026-09-16T10:00:00Z",
        attempts: 0,
      },
      {
        table: "b",
        operation: "insert",
        payload: {},
        createdAt: "2026-09-16T10:01:00Z",
        attempts: 0,
      },
      {
        table: "c",
        operation: "insert",
        payload: {},
        createdAt: "2026-09-16T10:02:00Z",
        attempts: 0,
      },
    ]);
    const result = await drainSync(async (r) => {
      await Promise.resolve();
      if (r.table === "a") return; // applied
      if (r.table === "b") throw new Error("timeout"); // retried
      throw new Error("BT_VALID: bad payload"); // failed
    });
    expect(result).toEqual({ applied: 1, retried: 1, failed: 1 });
  });
});
