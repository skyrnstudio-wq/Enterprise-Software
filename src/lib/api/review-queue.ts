import { supabase } from "../supabase/client";
import type { Json } from "@/lib/supabase/database.types";

/**
 * QH worklist + review-detail fetchers — execution-plan.md Phase 5 steps 1–3.
 * Every read renders the record exactly as the inspector submitted it; the
 * server remains the control plane for decisions.
 */

// ---------------------------------------------------------------------------
// Queue (step 1 — table with a flags column, ui-ux §6.8)
// ---------------------------------------------------------------------------

export interface ReviewRow {
  id: string;
  workflow: "DIMENSIONAL" | "COATING";
  item_code: string;
  po_number: string;
  delivery_batch_code: string;
  inspection_date: string;
  submitted_at: string;
}

/** SUBMITTED batches, newest first — the QH worklist. */
export async function listReviewQueue(): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, workflow, po_number, delivery_batch_code, inspection_date, updated_at, items ( item_code )",
    )
    .eq("status", "SUBMITTED")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    workflow: r.workflow as ReviewRow["workflow"],
    item_code: (r.items as { item_code: string } | null)?.item_code ?? "—",
    po_number: r.po_number as string,
    delivery_batch_code: r.delivery_batch_code as string,
    inspection_date: r.inspection_date as string,
    submitted_at: r.updated_at as string,
  }));
}

// ---------------------------------------------------------------------------
// Review detail (step 2 — read-only render of the inspector's record)
// ---------------------------------------------------------------------------

export interface ReviewDetail {
  id: string;
  workflow: "DIMENSIONAL" | "COATING";
  item_code: string;
  po_number: string;
  delivery_batch_code: string;
  inspection_date: string;
  lot_qty: number;
  /** Batch author — powers the edge-5.9 "never offer the button" UI mirror. */
  created_by: string;
  inspector_name: string | null;
  inspector_signed_at: string | null;
  revision_id: string;
}

export async function getReviewDetail(batchId: string): Promise<ReviewDetail | null> {
  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, workflow, po_number, delivery_batch_code, inspection_date, lot_qty, revision_id, created_by, items ( item_code ), profiles ( full_name ), sign_offs ( role, signed_at )",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (error) return null;
  const row = data as unknown as Record<string, unknown> | null;
  if (row === null) return null;
  const signOffs = (row.sign_offs ?? []) as Array<{ role: string; signed_at: string }>;
  const inspector = signOffs.find((s) => s.role === "INSPECTOR") ?? null;
  return {
    id: row.id as string,
    workflow: row.workflow as ReviewDetail["workflow"],
    item_code: (row.items as { item_code: string } | null)?.item_code ?? "—",
    po_number: row.po_number as string,
    delivery_batch_code: row.delivery_batch_code as string,
    inspection_date: row.inspection_date as string,
    lot_qty: row.lot_qty as number,
    created_by: row.created_by as string,
    inspector_name: (row.profiles as { full_name: string } | null)?.full_name ?? null,
    inspector_signed_at: inspector?.signed_at ?? null,
    revision_id: row.revision_id as string,
  };
}

/** Dimensional rows + readings as recorded (no recomputation server-side). */
export async function getDimensionalReview(
  batchId: string,
): Promise<
  {
    id: string;
    serial: number;
    label: string;
    nominal: number;
    tol_plus: number;
    tol_minus: number;
    instrument_id: string | null;
    values: (number | null)[];
  }[]
> {
  const { data, error } = await supabase
    .from("readings")
    .select(
      "value_mm, sample_no, dimension_rows ( id, serial, label, nominal, tol_plus, tol_minus, instrument_id )",
    )
    .eq("batch_id", batchId)
    .order("sample_no", { ascending: true });
  if (error) throw error;
  const rows = data as unknown as Array<{
    value_mm: number;
    sample_no: number;
    dimension_rows: {
      id: string;
      serial: number;
      label: string;
      nominal: number;
      tol_plus: number;
      tol_minus: number;
      instrument_id: string | null;
    };
  }>;
  const byRow = new Map<
    string,
    {
      id: string;
      serial: number;
      label: string;
      nominal: number;
      tol_plus: number;
      tol_minus: number;
      instrument_id: string | null;
      values: (number | null)[];
    }
  >();
  for (const r of rows) {
    const dr = r.dimension_rows;
    let entry = byRow.get(dr.id);
    if (entry === undefined) {
      entry = { ...dr, values: [] };
      byRow.set(dr.id, entry);
    }
    entry.values[r.sample_no - 1] = r.value_mm;
  }
  return [...byRow.values()].sort((a, b) => a.serial - b.serial);
}

/** DFT grids as recorded, keyed by side. */
export async function getCoatingReview(
  batchId: string,
): Promise<{
  INSIDE: (number | null)[];
  OUTSIDE: (number | null)[];
  visual: Record<string, boolean>;
}> {
  const [dftRes, visualRes] = await Promise.all([
    supabase
      .from("dft_readings")
      .select("side, point_no, value_um")
      .eq("batch_id", batchId)
      .order("point_no"),
    supabase.from("batch_visual_checks").select("defect, checked, present").eq("batch_id", batchId),
  ]);
  if (dftRes.error) throw dftRes.error;
  const dft: { INSIDE: (number | null)[]; OUTSIDE: (number | null)[] } = {
    INSIDE: Array(26).fill(null),
    OUTSIDE: Array(26).fill(null),
  };
  for (const r of dftRes.data as Array<{ side: string; point_no: number; value_um: number }>) {
    const grid = r.side === "INSIDE" ? dft.INSIDE : dft.OUTSIDE;
    grid[r.point_no - 1] = r.value_um;
  }
  const visual: Record<string, boolean> = {};
  for (const r of (visualRes.data ?? []) as Array<{
    defect: string;
    checked: boolean;
    present: boolean;
  }>) {
    visual[r.defect] = r.present;
  }
  return { ...dft, visual };
}

/**
 * QH rejection comments per rejected batch (SO-03: the inspector must see
 * WHY a batch came back — pinned on the dashboard next to the batch).
 */
export async function listRejectionComments(
  batchIds: string[],
): Promise<Record<string, { comments: string; signedAt: string }>> {
  const result: Record<string, { comments: string; signedAt: string }> = {};
  if (batchIds.length === 0) return result;
  const { data, error } = await supabase
    .from("sign_offs")
    .select("batch_id, comments, signed_at")
    .in("batch_id", batchIds)
    .eq("role", "QUALITY_HEAD")
    .eq("decision", "REJECT");
  if (error) throw error;
  for (const r of data as Array<{ batch_id: string; comments: string | null; signed_at: string }>) {
    if (r.comments !== null) {
      result[r.batch_id] = { comments: r.comments, signedAt: r.signed_at };
    }
  }
  return result;
}

/**
 * Controlled-document export — report-export-spec §7 + Phase 6 step 4.
 * The server refuses non-APPROVED batches (BT_STATE, edge 6.9) and writes
 * the EXPORT audit entry with the actor; the return value is the audit id.
 */
export async function logExport(
  batchId: string,
  channel: "PRINT" | "EMAIL",
  meta: Record<string, unknown> = {},
): Promise<{ kind: "logged"; auditId: string } | { kind: "blocked"; message: string }> {
  const { data, error } = await supabase.rpc("log_export", {
    p_batch_id: batchId,
    p_channel: channel,
    p_meta: meta as unknown as Json,
  });
  if (error !== null) return { kind: "blocked", message: error.message };
  return { kind: "logged", auditId: data };
}

/** Expired instrument ids for the EQ-03 flag + mandatory acknowledgement. */
export async function getExpiredInstrumentIds(today: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("instruments")
    .select("id")
    .lt("calibration_due", today);
  if (error) throw error;
  return new Set((data as Array<{ id: string }>).map((r) => r.id));
}

// ---------------------------------------------------------------------------
// Decisions (steps 3/4) — thin wrapper over the server-side control plane
// ---------------------------------------------------------------------------

export type DecisionResult =
  | { kind: "decided" }
  | { kind: "mfa-required"; message: string }
  | { kind: "blocked"; message: string };

/**
 * Approve or reject. The server owns every guard (role, AAL2, race,
 * separation of duties); this wrapper only translates the BT_* error
 * contract into UI states:
 * - `BT_MFA`   → re-challenge prompt, decision form preserved (edge 5.5)
 * - `BT_STATE` → decision race lost; caller refreshes (edges 5.2/5.3)
 * - offline    → blocked by design (edge 5.6: sign-off integrity needs
 *   server timestamps — the offline queue holds NOTHING for decisions)
 */
export async function decideBatch(
  batchId: string,
  decision: "APPROVE" | "REJECT",
  comments: string | null,
): Promise<DecisionResult> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!online) {
    return {
      kind: "blocked",
      message:
        "Decisions require a live connection — sign-off integrity needs server timestamps (offline doc §3). Reconnect to decide.",
    };
  }
  const { error } = await supabase.rpc("decide_batch", {
    p_batch_id: batchId,
    p_decision: decision,
    p_comments: comments,
  });
  if (error === null) return { kind: "decided" };
  if (error.message.includes("BT_MFA")) {
    return { kind: "mfa-required", message: error.message };
  }
  return { kind: "blocked", message: error.message };
}

/**
 * UI mirror of the RPC's separation-of-duties guard (edge 5.9): the author
 * never sees the Approve/Reject buttons. Cosmetic only — the server is the
 * control plane.
 */
export function canDecide(batch: { created_by: string } | null, userId: string | null): boolean {
  if (batch === null || userId === null) return false;
  return batch.created_by !== userId;
}
