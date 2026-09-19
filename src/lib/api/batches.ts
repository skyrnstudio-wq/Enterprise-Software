import { supabase } from "../supabase/client";
import { db } from "@/lib/dexie/db";
import type { DimensionDraft } from "@/lib/dexie/db";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Batch lifecycle API — execution-plan.md Phase 3 steps 1/8/11 + offline doc §3/§5.
 *
 * - Creation is a server insert when online; the draft then lives in
 *   Dexie-only autosave until submit.
 * - Submission (step 8): sync the draft via `upsert_batch_draft` (offline
 *   doc §5 conflict semantics live server-side), then call `submit_batch`,
 *   whose transaction recomputes dew point / DFT verdicts server-side and
 *   enforces the state machine (edge 3.15's final gate is the RPC).
 * - Offline: operations append to `pendingSync`; `drainSync` replays them
 *   oldest-first when connectivity returns (step 11). The sender is injected
 *   so tests pin the drain semantics without a network.
 */

export interface CreateBatchInput {
  item_id: string;
  revision_id: string;
  po_number: string;
  delivery_batch_code: string;
  inspection_date: string;
  lot_quantity: number;
}

/** Create a DRAFT batch server-side; returns the server uuid. */
export async function createBatchDraft(input: CreateBatchInput): Promise<string> {
  const { data, error } = await supabase
    .from("batches")
    .insert({
      item_id: input.item_id,
      revision_id: input.revision_id,
      po_number: input.po_number,
      delivery_batch_code: input.delivery_batch_code,
      inspection_date: input.inspection_date,
      lot_qty: input.lot_quantity,
      status: "DRAFT",
      workflow: "DIMENSIONAL",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export type SubmitResult =
  | { kind: "submitted"; batchId: string }
  | { kind: "queued-offline"; batchId: string }
  | { kind: "blocked"; message: string };

/**
 * Submit a completed draft (Phase 3 step 8). The client checklist has already
 * gated the UI; the server re-checks everything inside the transaction.
 * Offline ⇒ queue for the drain (edge 3.14: capture continues, drain warns).
 */
export async function submitBatch(draft: DimensionDraft): Promise<SubmitResult> {
  const batchId = draft.batchId;

  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!online) {
    await enqueue({ table: "submit_batch", operation: "insert", payload: { draft } });
    return { kind: "queued-offline", batchId };
  }

  try {
    await syncDraftContents(draft);
    const { error } = await supabase.rpc("submit_batch", {
      p_batch_id: batchId,
      p_client_stats: { client: "dimensional-grid", saved_at: draft.savedAt },
    });
    if (error !== null) return { kind: "blocked", message: error.message };
    await db.drafts.delete(batchId);
    return { kind: "submitted", batchId };
  } catch (err) {
    return { kind: "blocked", message: err instanceof Error ? err.message : "Submission failed" };
  }
}

/** Push header + readings through the draft-upsert RPC (offline doc §5). */
async function syncDraftContents(draft: DimensionDraft): Promise<void> {
  const readings: Record<string, unknown>[] = draft.rows.flatMap((r) =>
    r.samples
      .map((value, i) => ({ value, sampleNo: i + 1 }))
      .filter((s): s is { value: number; sampleNo: number } => s.value !== null)
      .map((s) => ({
        batch_id: draft.batchId,
        dimension_row_id: r.dimension_row_id,
        sample_no: s.sampleNo,
        value_mm: s.value,
        instrument_id: r.instrument_id,
      })),
  );
  // Migration 005's signature: upsert_batch_draft(p_batch, p_readings,
  // p_coat_logs, p_dft_readings). p_batch MUST carry the batch id — the
  // function derives the target row from `p_batch ->> 'id'` and raises
  // BT_VALID without it.
  const { error } = await supabase.rpc("upsert_batch_draft", {
    p_batch: { id: draft.batchId, ...draft.header } as unknown as Json,
    p_readings: readings as unknown as Json,
    p_coat_logs: [] as unknown as Json,
    p_dft_readings: [] as unknown as Json,
  });
  if (error !== null) throw error;
}

async function enqueue(record: {
  table: string;
  operation: "insert" | "update";
  payload: unknown;
}): Promise<void> {
  await db.pendingSync.add({
    table: record.table,
    operation: record.operation,
    payload: record.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
}

/**
 * Drain the offline queue — Phase 3 step 11 (offline doc §3). Injected
 * `sender` replays one record; truth-table:
 * - resolves      → delete the record (applied)
 * - throws retryable → attempts+1, keep (retried next drain)
 * - throws fatal (409 revision drift, validation) → mark-and-keep with
 *   attempts frozen; the review UI surfaces the conflict (edge 3.14).
 */
export async function drainSync(
  sender: (record: { table: string; payload: unknown }) => Promise<void>,
): Promise<{
  applied: number;
  retried: number;
  failed: number;
}> {
  const queue = await db.pendingSync.orderBy("createdAt").toArray();
  let applied = 0;
  let retried = 0;
  let failed = 0;

  for (const record of queue) {
    try {
      await sender({ table: record.table, payload: record.payload });
      await db.pendingSync.delete(record.id);
      applied += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isFatal = message.includes("BT_") || message.includes("revision");
      await db.pendingSync.update(record.id, {
        attempts: isFatal ? 999 : record.attempts + 1,
        payload: isFatal ? { ...(record.payload as object), conflict: message } : record.payload,
      });
      if (isFatal) failed += 1;
      else retried += 1;
    }
  }
  return { applied, retried, failed };
}

/** Replays a queued submission exactly as the online path would. */
export async function replaySubmission(payload: { draft: DimensionDraft }): Promise<void> {
  await syncDraftContents(payload.draft);
  const { error } = await supabase.rpc("submit_batch", {
    p_batch_id: payload.draft.batchId,
    p_client_stats: { client: "dimensional-grid", saved_at: payload.draft.savedAt, replayed: true },
  });
  if (error !== null) throw error;
  await db.drafts.delete(payload.draft.batchId);
}

// ————————————————————————————————————————————————————— Grid bootstrap

export interface DimensionRowRecord {
  id: string;
  serial: number;
  label: string;
  symbol: string | null;
  is_reference: boolean;
  nominal: number;
  tol_plus: number;
  tol_minus: number;
}

/** Dimension rows for a revision, in serial order (grid bootstrap). */
export async function listDimensionRows(revisionId: string): Promise<DimensionRowRecord[]> {
  const { data, error } = await supabase
    .from("dimension_rows")
    .select("id, serial, label, symbol, is_reference, nominal, tol_plus, tol_minus")
    .eq("revision_id", revisionId)
    .order("serial", { ascending: true });
  if (error) throw error;
  return data;
}

/** Batch header for the grid screen's draft bootstrap. */
export interface BatchHeader {
  id: string;
  item_id: string;
  revision_id: string;
  po_number: string;
  delivery_batch_code: string;
  inspection_date: string;
  lot_qty: number;
  status: string;
  item_code: string;
}

/**
 * Batch header lookup that keeps "no such batch" and "could not ask"
 * distinct. The distinction is load-bearing: a transport failure must never be
 * reported to the operator as "Batch not found", or an offline refresh reads
 * as a deleted/approved batch and the draft in front of them looks lost.
 */
export type BatchHeaderProbe =
  | { kind: "ok"; header: BatchHeader }
  | { kind: "missing" }
  | { kind: "unreachable" };

export async function probeBatchHeader(batchId: string): Promise<BatchHeaderProbe> {
  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, item_id, revision_id, po_number, delivery_batch_code, inspection_date, lot_qty, status, items ( item_code )",
    )
    .eq("id", batchId)
    .single();
  if (error !== null) {
    // PGRST116 = "JSON object requested, multiple (or no) rows returned" — the
    // only answer that genuinely means the batch is not there.
    return error.code === "PGRST116" ? { kind: "missing" } : { kind: "unreachable" };
  }
  const row = data as unknown as Record<string, unknown>;
  return {
    kind: "ok",
    header: {
      id: row.id as string,
      item_id: row.item_id as string,
      revision_id: row.revision_id as string,
      po_number: row.po_number as string,
      delivery_batch_code: row.delivery_batch_code as string,
      inspection_date: row.inspection_date as string,
      lot_qty: row.lot_qty as number,
      status: row.status as string,
      item_code: (row.items as { item_code: string } | null)?.item_code ?? "—",
    },
  };
}

/** Header lookup for callers that only care whether the batch is usable. */
export async function getBatchHeader(batchId: string): Promise<BatchHeader | null> {
  const probe = await probeBatchHeader(batchId);
  return probe.kind === "ok" ? probe.header : null;
}

/** Revision metadata for the new-batch flow. */
export async function latestRevisionForItem(
  itemId: string,
): Promise<{ id: string; rev: string } | null> {
  const { data, error } = await supabase
    .from("drawing_revisions")
    .select("id, rev")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

// ——————————————————————————————————————————————————————— Dashboard data

export interface BatchListRow {
  id: string;
  status: "DRAFT" | "SUBMITTED" | "REJECTED" | "APPROVED";
  workflow: "DIMENSIONAL" | "COATING";
  item_code: string;
  po_number: string;
  delivery_batch_code: string;
  inspection_date: string;
  updated_at: string;
}

/** Dashboard list (A4 strip + rejected pinning live in the route). */
export async function listBatches(): Promise<BatchListRow[]> {
  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, status, workflow, po_number, delivery_batch_code, inspection_date, updated_at, items ( item_code )",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = data as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as BatchListRow["status"],
    workflow: r.workflow as BatchListRow["workflow"],
    item_code: (r.items as { item_code: string } | null)?.item_code ?? "—",
    po_number: r.po_number as string,
    delivery_batch_code: r.delivery_batch_code as string,
    inspection_date: r.inspection_date as string,
    updated_at: r.updated_at as string,
  }));
}

/**
 * ⌘K batch search (ui-ux-plan §2.1) — reaches ANY batch by item code, PO,
 * or lot (the dashboard list caps at 100 rows; search does not). Ilike
 * matching server-side; RLS scopes results to the caller's visibility.
 */
export async function searchBatches(term: string): Promise<BatchListRow[]> {
  // Commas are the .or() list separator — strip them from user input.
  const q = term.trim().replace(/,/g, "");
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, status, workflow, po_number, delivery_batch_code, inspection_date, updated_at, items ( item_code )",
    )
    .or(
      `po_number.ilike.%${q}%,delivery_batch_code.ilike.%${q}%,items.item_code.ilike.%${q}%`,
    )
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = data as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as BatchListRow["status"],
    workflow: r.workflow as BatchListRow["workflow"],
    item_code: (r.items as { item_code: string } | null)?.item_code ?? "—",
    po_number: r.po_number as string,
    delivery_batch_code: r.delivery_batch_code as string,
    inspection_date: r.inspection_date as string,
    updated_at: r.updated_at as string,
  }));
}
