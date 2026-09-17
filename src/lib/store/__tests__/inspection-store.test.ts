import "fake-indexeddb/auto"; // must precede any dexie import/use in tests
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useInspectionStore, setWriteThrottleForTests } from "../inspection-store";
import { db } from "@/lib/dexie/db";
import type { DimensionDraft } from "@/lib/dexie/db";

/**
 * Autosave store tests — execution-plan.md Phase 3 step 7, edges 3.11/3.12.
 * Runs on fake-indexeddb (jsdom has no IndexedDB).
 */

function makeDraft(overrides: Partial<DimensionDraft> = {}): DimensionDraft {
  return {
    batchId: "b-1",
    header: {
      item_id: "i-1",
      revision_id: "r-1",
      item_code: "ST-0265",
      po_number: "PO-1001",
      delivery_batch_code: "2609-01",
      inspection_date: "2026-09-16",
      lot_quantity: 25,
    },
    rows: Array.from({ length: 3 }, (_, i) => ({
      dimension_row_id: `dr-${String(i + 1)}`,
      serial: i + 1,
      label: `DIM-${String(i + 1)}`,
      symbol: null,
      is_reference: false,
      nominal: 10,
      tol_plus: 0.5,
      tol_minus: 0.5,
      instrument_id: i === 0 ? "inst-1" : null,
      samples: [null, null, null, null, null],
    })),
    cursor: null,
    savedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("inspection store (Phase 3 step 7)", () => {
  beforeEach(async () => {
    useInspectionStore.setState({
      draft: null,
      hydrated: false,
      lastWriteAt: null,
      stolenByOtherTab: false,
      cursor: null,
    });
    await Promise.all([db.drafts.clear(), db.pendingSync.clear()]);
    // Real timers: fake-indexeddb settles IDB transactions off the macrotask
    // queue, which frozen fake timers deadlock (the previous run timed out
    // 8/8 because of exactly this). Near-zero window ≈ instant debounce.
    setWriteThrottleForTests(1);
  });

  afterEach(() => {
    setWriteThrottleForTests(300);
  });

  it("hydrate loads the persisted draft and restores the cursor (edges 2.13/3.13)", async () => {
    const draft = makeDraft({ cursor: { row: 2, sample: 3 } });
    await db.drafts.put(draft);
    const loaded = await useInspectionStore.getState().hydrate("b-1");
    expect(loaded?.cursor).toEqual({ row: 2, sample: 3 });
    expect(useInspectionStore.getState().cursor).toEqual({ row: 2, sample: 3 });
    expect(useInspectionStore.getState().hydrated).toBe(true);
  });

  it("hydrate of an unknown batch yields null and still marks hydrated", async () => {
    const loaded = await useInspectionStore.getState().hydrate("missing");
    expect(loaded).toBeNull();
    expect(useInspectionStore.getState().hydrated).toBe(true);
  });

  it("setSample writes through after the debounce and advances savedAt on COMPLETION (edge 3.11)", async () => {
    useInspectionStore.getState().load(makeDraft());
    useInspectionStore.getState().setSample(0, 2, 10.05);
    await new Promise((r) => setTimeout(r, 50)); // settle debounce + IDB commit
    const persisted = await db.drafts.get("b-1");
    expect(persisted?.rows[0]?.samples[2]).toBe(10.05);
    expect(persisted?.savedAt).not.toBe(new Date(0).toISOString());
    expect(useInspectionStore.getState().lastWriteAt).not.toBeNull();
  });

  it("rapid mutations coalesce into one debounced write (edge 3.11 race)", async () => {
    useInspectionStore.getState().load(makeDraft());
    const store = useInspectionStore.getState();
    store.setSample(0, 0, 10.1);
    store.setSample(0, 0, 10.2);
    store.setSample(0, 0, 9.9);
    await new Promise((r) => setTimeout(r, 50));
    const persisted = await db.drafts.get("b-1");
    expect(persisted?.rows[0]?.samples[0]).toBe(9.9); // last completed write wins
  });

  it("zero is a value: setSample(…, 0) persists 0, not null (edge 3.17)", async () => {
    useInspectionStore.getState().load(makeDraft());
    useInspectionStore.getState().setSample(1, 3, 0);
    await new Promise((r) => setTimeout(r, 50));
    const persisted = await db.drafts.get("b-1");
    expect(persisted?.rows[1]?.samples[3]).toBe(0);
  });

  it("cursor changes persist for resume-on-load (edge 2.13)", async () => {
    useInspectionStore.getState().load(makeDraft());
    useInspectionStore.getState().setCursor(4, 1);
    await new Promise((r) => setTimeout(r, 50));
    const persisted = await db.drafts.get("b-1");
    expect(persisted?.cursor).toEqual({ row: 4, sample: 1 });
  });

  it("claimConflict makes the grid read-only: setSample becomes a no-op (edge 3.12)", async () => {
    useInspectionStore.getState().load(makeDraft());
    useInspectionStore.getState().setSample(0, 0, 10);
    await new Promise((r) => setTimeout(r, 50)); // baseline write lands
    useInspectionStore.getState().claimConflict();
    expect(useInspectionStore.getState().stolenByOtherTab).toBe(true);
    useInspectionStore.getState().setSample(0, 0, 99); // must be ignored
    await new Promise((r) => setTimeout(r, 50));
    const persisted = await db.drafts.get("b-1");
    expect(persisted?.rows[0]?.samples[0]).toBe(10); // unchanged by the losing tab
  });

  it("purge cancels pending writes, deletes the draft, resets state (post-submit)", async () => {
    useInspectionStore.getState().load(makeDraft());
    useInspectionStore.getState().setSample(0, 0, 10); // schedules a write
    await useInspectionStore.getState().purge("b-1"); // before the debounce fires
    const persisted = await db.drafts.get("b-1");
    expect(persisted).toBeUndefined(); // write was cancelled
    expect(useInspectionStore.getState().draft).toBeNull();
    expect(useInspectionStore.getState().hydrated).toBe(false);
  });
});
