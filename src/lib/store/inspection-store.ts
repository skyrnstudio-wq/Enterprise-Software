import { create } from "zustand";
import { db } from "@/lib/dexie/db";
import { createDebouncedWriter, createTabChannel } from "./draft-persist";
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
  /** Timestamp of the newest mutation (drives the "saving…" indicator, G6). */
  mutatedAt: number | null;
  /** Another tab claimed this draft (edge 3.12) — grid renders read-only. */
  stolenByOtherTab: boolean;
  cursor: { row: number; sample: number } | null;

  hydrate: (batchId: string) => Promise<DimensionDraft | null>;
  load: (draft: DimensionDraft) => void;
  setSample: (row: number, sample: number, value: number | null) => void;
  setInstrument: (row: number, instrumentId: string | null) => void;
  /** DIM-06 bulk apply: set one instrument on every unlocked row. */
  applyInstrumentToAll: (instrumentId: string | null) => void;
  setCursor: (row: number, sample: number) => void;
  /** Another tab announced ownership of this batch — go read-only. */
  claimConflict: () => void;
  purge: (batchId: string) => Promise<void>;
}

const writer = createDebouncedWriter<DimensionDraft>((draft) => db.drafts.put(draft));

/** Debounce window override for tests (see draft-persist for the why). */
export function setWriteThrottleForTests(ms: number): void {
  writer.setThrottleMs(ms);
}

/** Tab-guard channel — null in environments without BroadcastChannel (tests). */
const tabChannel = createTabChannel("simran-qc-drafts");

export const useInspectionStore = create<InspectionState>()((set, get) => ({
  draft: null,
  hydrated: false,
  lastWriteAt: null,
  mutatedAt: null,
  stolenByOtherTab: false,
  cursor: null,

  hydrate: async (batchId) => {
    // Dexie yields `undefined` for a miss; normalise once so the guards below
    // read as plain null checks.
    const existing = (await db.drafts.get(batchId)) ?? null;
    const current = get().draft;
    // A draft already open for THIS batch wins. The route effect is
    // double-invoked under StrictMode, so the second pass must not blank a
    // working set that the first pass just loaded — otherwise an offline
    // header re-fetch (which returns null on any network error) turns a live
    // draft into a spurious "Batch not found".
    if (existing === null && current !== null && current.batchId === batchId) {
      set({ hydrated: true });
      return current;
    }
    set({
      draft: existing,
      hydrated: true,
      cursor: existing?.cursor ?? null,
      stolenByOtherTab: false,
    });
    return existing;
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
    set({ draft: { ...state.draft, rows }, mutatedAt: Date.now() });
    writer.schedule(
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
    set({ draft: { ...state.draft, rows }, mutatedAt: Date.now() });
    writer.schedule(
      batchId,
      () => get().draft,
      () => {
        set({ lastWriteAt: Date.now() });
      },
    );
  },

  applyInstrumentToAll: (instrumentId) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const rows = state.draft.rows.map((r) => ({ ...r, instrument_id: instrumentId }));
    const batchId = state.draft.batchId;
    set({ draft: { ...state.draft, rows }, mutatedAt: Date.now() });
    writer.schedule(
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
    set({
      cursor: { row, sample },
      draft: { ...state.draft, cursor: { row, sample } },
      mutatedAt: Date.now(),
    });
    writer.schedule(
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
    writer.clearPending(batchId);
    await db.drafts.delete(batchId);
    set({ draft: null, cursor: null, hydrated: false, lastWriteAt: null, mutatedAt: null });
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
