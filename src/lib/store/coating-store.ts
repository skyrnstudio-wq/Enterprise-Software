import { create } from "zustand";
import { db } from "@/lib/dexie/db";
import { createDebouncedWriter, createTabChannel } from "./draft-persist";
import type { CoatingDraft, VisualCheckState, VisualCheckValue } from "@/lib/dexie/db";

/**
 * Coating store — execution-plan.md Phase 4 (COAT-01…05, offline doc §2).
 * Same discipline as the inspection store: the store is the working set,
 * Dexie is the truth on disk, `savedAt` only advances on a COMPLETED write
 * (edge 3.11), and a BroadcastChannel tab-claim flips the loser read-only
 * (edge 3.12 semantics reused for coating drafts).
 */

export interface CoatingState {
  draft: CoatingDraft | null;
  /** True once hydration from Dexie finished (prevents wizard flash). */
  hydrated: boolean;
  /** Timestamp (ms, caller clock) of the last COMPLETED Dexie write. */
  lastWriteAt: number | null;
  /** Timestamp of the newest mutation (drives the "saving…" indicator, G6). */
  mutatedAt: number | null;
  /** Another tab claimed this draft — wizard renders read-only. */
  stolenByOtherTab: boolean;

  hydrate: (batchId: string) => Promise<CoatingDraft | null>;
  load: (draft: CoatingDraft) => void;
  /** Section A — surface profile. */
  setSurfacePrep: (section: Partial<CoatingDraft["surfacePrep"]>) => void;
  /** Section B — psychrometric conditions. */
  setConditions: (section: Partial<CoatingDraft["conditions"]>) => void;
  /** Section C — upsert one coat log by coat number. */
  setCoat: (coat: CoatingDraft["coats"][number]) => void;
  /** Section D — one DFT cell. */
  setDft: (side: "INSIDE" | "OUTSIDE", index: number, value: number | null) => void;
  /** Section E — one visual check. */
  setVisualCheck: (id: keyof VisualCheckState, value: VisualCheckValue) => void;
  /** Wizard position (0–4), persisted like the dimensional cursor (2.13). */
  setStep: (step: number) => void;
  claimConflict: () => void;
  purge: (batchId: string) => Promise<void>;
}

const writer = createDebouncedWriter<CoatingDraft>((draft) => db.coatingDrafts.put(draft));

/** Debounce window override for tests (see draft-persist for the why). */
export function setCoatingWriteThrottleForTests(ms: number): void {
  writer.setThrottleMs(ms);
}

const tabChannel = createTabChannel("simran-qc-coating");

export const useCoatingStore = create<CoatingState>()((set, get) => ({
  draft: null,
  hydrated: false,
  lastWriteAt: null,
  mutatedAt: null,
  stolenByOtherTab: false,

  hydrate: async (batchId) => {
    // Dexie yields `undefined` for a miss; normalise once so the guards below
    // read as plain null checks.
    const existing = (await db.coatingDrafts.get(batchId)) ?? null;
    const current = get().draft;
    // Mirror of the inspection store: a draft already open for THIS batch
    // wins, so a double-invoked effect (StrictMode) can never blank a live
    // working set and collapse the page into "Batch not found".
    if (existing === null && current !== null && current.batchId === batchId) {
      set({ hydrated: true });
      return current;
    }
    set({
      draft: existing,
      hydrated: true,
      stolenByOtherTab: false,
    });
    return existing;
  },

  load: (draft) => {
    set({ draft, hydrated: true, stolenByOtherTab: false });
    tabChannel?.postMessage(draft.batchId);
  },

  setSurfacePrep: (section) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const batchId = state.draft.batchId;
    set({
      draft: { ...state.draft, surfacePrep: { ...state.draft.surfacePrep, ...section } },
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

  setConditions: (section) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const batchId = state.draft.batchId;
    set({
      draft: { ...state.draft, conditions: { ...state.draft.conditions, ...section } },
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

  setCoat: (coat) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const coats = [...state.draft.coats];
    const idx = coats.findIndex((c) => c.coatNo === coat.coatNo);
    if (idx >= 0) coats[idx] = coat;
    else coats.push(coat);
    coats.sort((a, b) => a.coatNo - b.coatNo);
    const batchId = state.draft.batchId;
    set({ draft: { ...state.draft, coats }, mutatedAt: Date.now() });
    writer.schedule(
      batchId,
      () => get().draft,
      () => {
        set({ lastWriteAt: Date.now() });
      },
    );
  },

  setDft: (side, index, value) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    if (index < 0 || index >= 26) return;
    const grid = [...state.draft.dft[side]];
    grid[index] = value;
    const batchId = state.draft.batchId;
    set({
      draft: { ...state.draft, dft: { ...state.draft.dft, [side]: grid } },
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

  setVisualCheck: (id, value) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const batchId = state.draft.batchId;
    set({
      draft: { ...state.draft, visual: { ...state.draft.visual, [id]: value } },
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

  setStep: (step) => {
    const state = get();
    if (state.draft === null || state.stolenByOtherTab) return;
    const batchId = state.draft.batchId;
    set({ draft: { ...state.draft, step }, mutatedAt: Date.now() });
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
    await db.coatingDrafts.delete(batchId);
    set({ draft: null, hydrated: false, lastWriteAt: null, mutatedAt: null });
  },
}));

// After the store exists: an inbound ping marks the matching local draft
// stolen — the OTHER tab keeps working; this one becomes read-only.
if (tabChannel !== null) {
  tabChannel.onmessage = (event: MessageEvent<string>) => {
    const state = useCoatingStore.getState();
    if (state.draft !== null && event.data === state.draft.batchId) state.claimConflict();
  };
}
