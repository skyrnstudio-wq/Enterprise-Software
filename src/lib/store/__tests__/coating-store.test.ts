import "fake-indexeddb/auto"; // must precede any dexie import/use in tests
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useCoatingStore, setCoatingWriteThrottleForTests } from "../coating-store";
import { db } from "@/lib/dexie/db";
import type { CoatingDraft } from "@/lib/dexie/db";

/**
 * Coating autosave store tests — Phase 4 persistence (COAT-01…05), reusing
 * the inspection-store discipline: Dexie truth, completed-write savedAt,
 * tab-claim read-only. Runs on fake-indexeddb (jsdom has no IndexedDB).
 */

function makeDraft(overrides: Partial<CoatingDraft> = {}): CoatingDraft {
  return {
    batchId: "cb-1",
    header: {
      item_id: "i-1",
      revision_id: "r-1",
      item_code: "ST-0265",
      po_number: "PO-1001",
      delivery_batch_code: "2609-01",
      inspection_date: "2026-09-16",
      lot_quantity: 25,
    },
    fxGrade: "C3",
    surfacePrep: {
      steelGrade: "MS Sheet Fabrication",
      blastMethod: "Abrasive Blast Cleaning",
      blastGrade: "Sa 2.5",
      gritSize: "G-40",
      weldEdgeOk: false,
      solventCleanOk: false,
      waterBreakPass: false,
      comparatorGrade: null,
      profileUm: null,
      gaugeInstrumentId: null,
    },
    conditions: { steelTempC: null, ambientTempC: null, relativeHumidity: null },
    coats: [],
    dft: { INSIDE: Array(26).fill(null), OUTSIDE: Array(26).fill(null) },
    visual: {
      pinholes: null,
      sagging: null,
      gloss_loss: null,
      peel_off: null,
      blisters: null,
    },
    step: 0,
    savedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50)); // debounce + IDB commit
}

describe("coating store (Phase 4 persistence)", () => {
  beforeEach(async () => {
    useCoatingStore.setState({
      draft: null,
      hydrated: false,
      lastWriteAt: null,
      stolenByOtherTab: false,
    });
    await Promise.all([db.coatingDrafts.clear(), db.pendingSync.clear()]);
    // Real timers: fake-indexeddb settles IDB transactions off the macrotask
    // queue, which frozen fake timers deadlock. Near-zero window ≈ instant.
    setCoatingWriteThrottleForTests(1);
  });

  afterEach(() => {
    setCoatingWriteThrottleForTests(300);
  });

  it("hydrate loads the persisted draft and wizard step (edge 2.13 for coating)", async () => {
    const draft = makeDraft({ step: 3 });
    await db.coatingDrafts.put(draft);
    const loaded = await useCoatingStore.getState().hydrate("cb-1");
    expect(loaded?.step).toBe(3);
    expect(useCoatingStore.getState().hydrated).toBe(true);
  });

  it("hydrate of an unknown batch yields null and still marks hydrated", async () => {
    const loaded = await useCoatingStore.getState().hydrate("missing");
    expect(loaded).toBeNull();
    expect(useCoatingStore.getState().hydrated).toBe(true);
  });

  it("setConditions writes through after the debounce and advances savedAt on COMPLETION", async () => {
    useCoatingStore.getState().load(makeDraft());
    useCoatingStore.getState().setConditions({ steelTempC: 22.5, relativeHumidity: 60 });
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.conditions.steelTempC).toBe(22.5);
    expect(persisted?.savedAt).not.toBe(new Date(0).toISOString());
    expect(useCoatingStore.getState().lastWriteAt).not.toBeNull();
  });

  it("setCoat upserts by coat number and keeps coats sorted", async () => {
    useCoatingStore.getState().load(makeDraft());
    const store = useCoatingStore.getState();
    store.setCoat({
      coatNo: 2,
      product: "PRIMER-B",
      mfgDate: "2026-08-01",
      partABatch: "PB-77",
      partBBatch: "HB-77",
      thinnerPercent: 5,
      wftUm: [null, null, null],
    });
    store.setCoat({
      coatNo: 1,
      product: "PRIMER-A",
      mfgDate: "2026-08-01",
      partABatch: "PA-11",
      partBBatch: "HB-11",
      thinnerPercent: 0,
      wftUm: [90, null, null],
    });
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.coats.map((c) => c.coatNo)).toEqual([1, 2]);
    expect(persisted?.coats[0]?.wftUm[0]).toBe(90);
  });

  it("setDft persists a single cell; zero is a value, not empty (edge 3.17 discipline)", async () => {
    useCoatingStore.getState().load(makeDraft());
    useCoatingStore.getState().setDft("OUTSIDE", 7, 0);
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.dft.OUTSIDE[7]).toBe(0);
    expect(persisted?.dft.INSIDE.every((v) => v === null)).toBe(true);
  });

  it("setDft ignores out-of-grid indices", async () => {
    useCoatingStore.getState().load(makeDraft());
    useCoatingStore.getState().setDft("INSIDE", 5, 50); // baseline write lands
    await settle();
    useCoatingStore.getState().setDft("INSIDE", 26, 50); // out of grid — must be ignored
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.dft.INSIDE[5]).toBe(50);
    expect(persisted?.dft.INSIDE[26]).toBeUndefined();
    expect(persisted?.dft.INSIDE.filter((v) => v !== null)).toHaveLength(1);
  });

  it("setVisualCheck and setSurfacePrep write through", async () => {
    useCoatingStore.getState().load(makeDraft());
    const store = useCoatingStore.getState();
    store.setVisualCheck("pinholes", "fail");
    store.setSurfacePrep({ comparatorGrade: "medium", profileUm: 60 });
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.visual.pinholes).toBe("fail");
    expect(persisted?.surfacePrep.comparatorGrade).toBe("medium");
    expect(persisted?.surfacePrep.profileUm).toBe(60);
  });

  it("rapid mutations coalesce into one debounced write (edge 3.11 race)", async () => {
    useCoatingStore.getState().load(makeDraft());
    const store = useCoatingStore.getState();
    store.setConditions({ steelTempC: 20 });
    store.setConditions({ steelTempC: 21 });
    store.setConditions({ steelTempC: 22.5 });
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.conditions.steelTempC).toBe(22.5); // last completed write wins
  });

  it("claimConflict makes the wizard read-only: mutations become no-ops (edge 3.12)", async () => {
    useCoatingStore.getState().load(makeDraft());
    useCoatingStore.getState().setConditions({ steelTempC: 22.5 });
    await settle(); // baseline write lands
    useCoatingStore.getState().claimConflict();
    expect(useCoatingStore.getState().stolenByOtherTab).toBe(true);
    useCoatingStore.getState().setConditions({ steelTempC: 99 }); // must be ignored
    useCoatingStore.getState().setStep(4); // must be ignored
    await settle();
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted?.conditions.steelTempC).toBe(22.5);
    expect(persisted?.step).toBe(0);
  });

  it("purge cancels pending writes, deletes the draft, resets state (post-submit)", async () => {
    useCoatingStore.getState().load(makeDraft());
    useCoatingStore.getState().setConditions({ steelTempC: 22.5 }); // schedules a write
    await useCoatingStore.getState().purge("cb-1"); // before the debounce fires
    const persisted = await db.coatingDrafts.get("cb-1");
    expect(persisted).toBeUndefined(); // write was cancelled
    expect(useCoatingStore.getState().draft).toBeNull();
    expect(useCoatingStore.getState().hydrated).toBe(false);
  });
});
