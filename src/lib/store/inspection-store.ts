import { create } from "zustand";
import { db } from "@/lib/dexie/db";
import type { DimensionDraft } from "@/lib/dexie/db";

/**
 * Inspection store — execution-plan.md Phase 3 step 7 (DIM-07, offline doc §2).
 *
 * - The store is the working set; **Dexie is the truth on disk**. Every
 *   mutation schedules a debounced (~300 ms) write-through; `savedAt` only
 *   advances when the write COMPLETES (edge 3.11 — "saved 12s ago" shows the
 *   last completed write, monotonic local delta for display, edge 3.19).
 * - Tab policy (edge 3.12): a `BroadcastChannel` announces the active batch —
 *   when two tabs hold the same draft, the OTHER tab flips to read-only with
 *   a warning instead of silently last-write-winning. Pinned by test.
 */

export interface InspectionState {
  draft: DimensionDraft | null;
  /** True once hydration from Dexie finished (prevents blank-grid flash). */
  hydrated: boolean;
  /** Timestamp (ms, caller clock) of the last COMPLETED Dexie write. */
  lastWriteAt: number | null;
  /** Another tab claimed this draft (edge 3.12) — grid renders read-only. */
  stolenByOtherTab: boolean;
  cursor: { row: number; sample: number } | null;

  hydrate: (batchId: string) => Promise<DimensionDraft | null>;
  load: (draft: DimensionDraft) => void;
  setSample: (row: number, sample: number, value: number | null) => void;
  setInstrument: (row: number, instrumentId: string | null) => void;
  setCursor: (row: number, sample: number) => void;
  /** Another tab announced ownership of this batch — go read-only. */
  claimConflict: () => void;
  purge: (batchId: string) => Promise<void>;
}

/** Timer handle per live draft — module scope so writes debounce across calls. */
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounce window. Overridable for tests — fake-indexeddb drives IDB
 * transactions off the macrotask queue, which frozen fake timers would
 * deadlock; tests run real timers with a near-zero window instead.
 */
let writeThrottleMs = 300;
export function setWriteThrottleForTests(ms: number): void {
  writeThrottleMs = ms;
}

function scheduleWrite(
  batchId: string,
  getDraft: () => DimensionDraft | null,
  onDone: () => void,
): void {
  const existing = pendingWrites.get(batchId);
  if (existing !== undefined) clearTimeout(existing);
  pendingWrites.set(
    batchId,
    setTimeout(() => {
      pendingWrites.delete(batchId);
      const draft = getDraft();
      if (draft === null) return;
      void db.drafts
        .put({ ...draft, savedAt: new Date().toISOString() })
        .then(onDone)
        .catch(() => {
          // Edge 3.11: a failed write is retried on the next mutation; the
          // completed-write timestamp does not advance on failure.
        });
    }, writeThrottleMs),
  );
}

/** Tab-guard channel — null in environments without BroadcastChannel (tests). */
const tabChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("simran-qc-drafts") : null;

export const useInspectionStore = create<InspectionState>()((set, get) => ({
  draft: null,
  hydrated: false,
  lastWriteAt: null,
  stolenByOtherTab: false,
  cursor: null,

  hydrate: async (batchId) => {
    const existing = await db.drafts.get(batchId);
    set({
      draft: existing ?? null,
      hydrated: true,
      cursor: existing?.cursor ?? null,
      stolenByOtherTab: false,
    });
    return existing ?? null;
  },

  load: (draft) => {
    set({ draft, hydrated: true, cursor: draft.cursor, stolenByOtherTab: false });
    tabChannel?.postMessage(draft.batchId);
  },

  setSample: (row, sample, value) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const rows = state.draft.rows.map((r, i) =>
      i === row ? { ...r, samples: r.samples.map((s, j) => (j === sample ? value : s)) } : r,
    );
    const batchId = state.draft.batchId;
    set({ draft: { ...state.draft, rows } });
    scheduleWrite(
      batchId,
      () => get().draft,
      () => {
        set({ lastWriteAt: Date.now() });
      },
    );
  },

  setInstrument: (row, instrumentId) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const rows = state.draft.rows.map((r, i) =>
      i === row ? { ...r, instrument_id: instrumentId } : r,
    );
    const batchId = state.draft.batchId;
    set({ draft: { ...state.draft, rows } });
    scheduleWrite(
      batchId,
      () => get().draft,
      () => {
        set({ lastWriteAt: Date.now() });
      },
    );
  },

  setCursor: (row, sample) => {
    const state = get();
    if (state.draft === null) return;
    const batchId = state.draft.batchId;
    set({ cursor: { row, sample }, draft: { ...state.draft, cursor: { row, sample } } });
    scheduleWrite(
      batchId,
      () => get().draft,
      () => {
        set({ lastWriteAt: Date.now() });
      },
    );
  },

  claimConflict: () => {
    set({ stolenByOtherTab: true });
  },

  purge: async (batchId) => {
    const existing = pendingWrites.get(batchId);
    if (existing !== undefined) {
      clearTimeout(existing);
      pendingWrites.delete(batchId);
    }
    await db.drafts.delete(batchId);
    set({ draft: null, cursor: null, hydrated: false, lastWriteAt: null });
  },
}));

// Wiring lives AFTER the store exists (no TDZ dance). An inbound ping marks
// the matching local draft stolen — the OTHER tab keeps working; this one
// becomes read-only (edge 3.12: explicit warning over silent last-write-wins).
if (tabChannel !== null) {
  tabChannel.onmessage = (event: MessageEvent<string>) => {
    const state = useInspectionStore.getState();
    if (state.draft !== null && event.data === state.draft.batchId) state.claimConflict();
  };
}
