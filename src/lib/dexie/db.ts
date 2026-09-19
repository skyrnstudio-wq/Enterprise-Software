import Dexie, { type EntityTable } from "dexie";

/**
 * Offline persistence — technology-stack.md §3.6 + offline-sync doc §2.
 * Dexie (IndexedDB) is the primary draft store; the Zustand stores hydrate
 * from here on app start and write through (debounced ~300 ms). The
 * pendingSync queue drains oldest-first on reconnect (§3).
 */

export interface PendingSyncRecord {
  id?: number;
  table: string;
  operation: "insert" | "update";
  payload: unknown;
  createdAt: string;
  attempts: number;
}

/** One inspection draft — the unit of autosave (PRD DIM-07, edge 3.11). */
export interface DimensionDraft {
  /** Client-generated uuid — stable across offline queue replay (FKs hold). */
  batchId: string;
  /** Batch header per batchHeaderSchema + item/revision linkage. */
  header: {
    item_id: string;
    revision_id: string;
    item_code: string;
    po_number: string;
    delivery_batch_code: string;
    inspection_date: string;
    lot_quantity: number;
  };
  /** Grid rows in serial order; samples[i] is sample i+1 (null = empty). */
  rows: {
    dimension_row_id: string;
    serial: number;
    label: string;
    symbol: string | null;
    is_reference: boolean;
    nominal: number;
    tol_plus: number;
    tol_minus: number;
    instrument_id: string | null;
    samples: (number | null)[];
  }[];
  /** Last keyboard position — restored on resume (edges 2.13/3.13). */
  cursor: { row: number; sample: number } | null;
  /** ISO timestamp of the last COMPLETED write (display uses local Δ, edge 3.19). */
  savedAt: string;
}

/**
 * The five visual defects (COAT-07, migration 007 `batch_visual_checks`).
 * null = not yet answered; "pass" = checked, defect absent; "fail" =
 * checked, defect present (the Draft-NCR path).
 */
export type VisualCheckValue = "pass" | "fail" | null;
export type VisualCheckState = Record<
  "pinholes" | "sagging" | "gloss_loss" | "peel_off" | "blisters",
  VisualCheckValue
>;

/**
 * One coating draft — sections mirror migration 007 (`batch_coating`,
 * `batch_visual_checks`) plus the coat logs / DFT readings the submit RPC
 * ingests. Wizard step 0–4 = sections A–E (execution-plan Phase 4 step 10).
 */
export interface CoatingDraft {
  batchId: string;
  header: {
    item_id: string;
    revision_id: string;
    item_code: string;
    po_number: string;
    delivery_batch_code: string;
    inspection_date: string;
    lot_quantity: number;
  };
  /** Section A — surface prep: presets (defaults per PRD) + profile + gauge. */
  surfacePrep: {
    steelGrade: string;
    blastMethod: string;
    blastGrade: string;
    gritSize: string;
    weldEdgeOk: boolean;
    solventCleanOk: boolean;
    waterBreakPass: boolean;
    comparatorGrade: "fine" | "medium" | "coarse" | null;
    /** Comparator-tape profile reading (µm) — single per-batch value. */
    profileUm: number | null;
    /** Edge 4.12: one profile gauge per batch, shown on both DFT panels. */
    gaugeInstrumentId: string | null;
  };
  /** Section B — psychrometrics; gate verdicts are DERIVED, never stored. */
  conditions: {
    steelTempC: number | null;
    ambientTempC: number | null;
    relativeHumidity: number | null;
  };
  /** Section C — one coat log per coat; WFT readings ride along (COAT-04). */
  coats: {
    coatNo: number;
    product: string;
    mfgDate: string | null;
    partABatch: string;
    partBBatch: string;
    thinnerPercent: number | null;
    wftUm: (number | null)[]; // WFT wet-film readings (µm)
  }[];
  /** Section D — 26-point ISO 19840 grids per side (null = empty). */
  dft: {
    INSIDE: (number | null)[]; // 26
    OUTSIDE: (number | null)[]; // 26
  };
  /** Section E — the five visual checks. */
  visual: VisualCheckState;
  /** Wizard position (0–4), restored on resume like the dimensional cursor. */
  step: number;
  /** ISO timestamp of the last COMPLETED write (edge 3.19 discipline). */
  savedAt: string;
}

export const db = new Dexie("simran-qc") as Dexie & {
  pendingSync: EntityTable<PendingSyncRecord, "id">;
  drafts: EntityTable<DimensionDraft, "batchId">;
  coatingDrafts: EntityTable<CoatingDraft, "batchId">;
};

db.version(1).stores({
  // Schema per Dexie: only indexed fields listed; payloads are stored wholesale.
  pendingSync: "++id, table, createdAt",
});

db.version(2).stores({
  pendingSync: "++id, table, createdAt",
  drafts: "batchId, savedAt",
});

db.version(3).stores({
  pendingSync: "++id, table, createdAt",
  drafts: "batchId, savedAt",
  coatingDrafts: "batchId, savedAt",
});
