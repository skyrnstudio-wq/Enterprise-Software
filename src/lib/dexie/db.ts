import Dexie, { type EntityTable } from "dexie";

/**
 * Offline persistence — technology-stack.md §3.6.
 * Dexie (IndexedDB) is the primary draft store; the Zustand inspection store
 * hydrates from here on app start and writes on every keystroke batch.
 * localStorage remains only a belt-and-braces mirror of the active draft.
 */

export interface PendingSyncRecord {
  id?: number;
  table: string;
  operation: "insert" | "update";
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export const db = new Dexie("simran-qc") as Dexie & {
  pendingSync: EntityTable<PendingSyncRecord, "id">;
};

db.version(1).stores({
  // Schema per Dexie: only indexed fields listed; payloads are stored wholesale.
  pendingSync: "++id, table, createdAt",
});
