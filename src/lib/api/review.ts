import { supabase } from "../supabase/client";
import { computeDftStats } from "@/domain/dft-stats";
import { rowStatus } from "@/domain/grid-model";
import { evaluatePsychroGate } from "@/domain/coating";
import type { RowStatus } from "@/domain/grid-model";
import type { Json } from "@/lib/supabase/database.types";

/**
 * QH review API — execution-plan.md Phase 5 steps 1–4 (ui-ux-plan §6.8).
 *
 * Flags are computed client-side with the SAME domain engines the inspector's
 * grid used (single source of evaluation truth), over the exact recorded
 * values — S16's "read-only render of the record the inspector saw" is
 * therefore byte-identical to what was submitted. The server remains the
 * control plane: `decide_batch` re-validates role, AAL2, race, and
 * separation of duties inside the transaction.
 */

// ---------------------------------------------------------------------------
// Flag computation (queue strip + review anchors)
// ---------------------------------------------------------------------------

export interface ReviewFlags {
  /** ▲ near-limit readings / grids (the §4.3 warn band). */
  warns: number;
  /** ✕ out-of-tolerance readings / 80-200 breaches / visual defects. */
  fails: number;
  /** Expired instruments used on any reading (EQ-03 → mandatory ack). */
  expiredInstruments: number;
}

export function emptyFlags(): ReviewFlags {
  return { warns: 0, fails: 0, expiredInstruments: 0 };
}

/**
 * Bulk flag computation for the queue — 4 queries total regardless of queue
 * size (readings+rows, dft, specs, batches→spec linkage); the domain engines
 * evaluate every recorded value exactly as the inspector's screen did.
 */
export async function computeQueueFlags(
  batchIds: string[],
  expiredIds: Set<string>,
): Promise<Record<string, ReviewFlags>> {
  const result: Record<string, ReviewFlags> = {};
  for (const id of batchIds) result[id] = emptyFlags();
  if (batchIds.length === 0) return result;

  const [dimRes, dftRes, specLinkRes] = await Promise.all([
    supabase
      .from("readings")
      .select("batch_id, value_mm, dimension_rows ( nominal, tol_plus, tol_minus, instrument_id )")
      .in("batch_id", batchIds),
    supabase.from("dft_readings").select("batch_id, side, value_um").in("batch_id", batchIds),
    supabase
      .from("batches")
      .select("id, revision_id, coating_specs ( dft_nominal_um_inside, dft_nominal_um_outside )")
      .in("id", batchIds),
  ]);
  for (const r of [dimRes, dftRes, specLinkRes]) {
    if (r.error) throw r.error;
  }

  type DimRow = {
    batch_id: string;
    value_mm: number;
    dimension_rows: {
      nominal: number;
      tol_plus: number;
      tol_minus: number;
      instrument_id: string | null;
    };
  };
  for (const r of (dimRes.data ?? []) as unknown as DimRow[]) {
    const flags = result[r.batch_id];
    if (flags === undefined) continue;
    const v = r.value_mm;
    if (v < r.dimension_rows.nominal - r.dimension_rows.tol_minus) flags.fails += 1;
    else if (v > r.dimension_rows.nominal + r.dimension_rows.tol_plus) flags.fails += 1;
    else if (
      v < r.dimension_rows.nominal - 0.8 * r.dimension_rows.tol_minus ||
      v > r.dimension_rows.nominal + 0.8 * r.dimension_rows.tol_plus
    )
      flags.warns += 1;
    if (r.dimension_rows.instrument_id !== null && expiredIds.has(r.dimension_rows.instrument_id))
      flags.expiredInstruments += 1;
  }

  const nominals = new Map<string, { inside: number; outside: number }>();
  for (const b of (specLinkRes.data ?? []) as unknown as Array<{
    id: string;
    coating_specs: { dft_nominal_um_inside: number; dft_nominal_um_outside: number } | null;
  }>) {
    if (b.coating_specs !== null) {
      nominals.set(b.id, {
        inside: b.coating_specs.dft_nominal_um_inside,
        outside: b.coating_specs.dft_nominal_um_outside,
      });
    }
  }
  type DftRow = { batch_id: string; side: string; value_um: number };
  for (const r of (dftRes.data ?? []) as unknown as DftRow[]) {
    const flags = result[r.batch_id];
    const n = nominals.get(r.batch_id);
    if (flags === undefined || n === undefined) continue;
    const nominal = r.side === "INSIDE" ? n.inside : n.outside;
    if (r.value_um < 0.8 * nominal || r.value_um > 2 * nominal) flags.fails += 1;
  }

  return result;
}

export function computeDimensionalFlags(
  rows: {
    samples: (number | null)[];
    nominal: number;
    tol_plus: number;
    tol_minus: number;
    instrument_id: string | null;
  }[],
  expiredIds: Set<string>,
): ReviewFlags {
  const flags = emptyFlags();
  for (const r of rows) {
    const status: RowStatus = rowStatus(r.samples, r.nominal, r.tol_plus, r.tol_minus);
    if (status === "fail") flags.fails += 1;
    else if (status === "warn") flags.warns += 1;
    if (r.instrument_id !== null && expiredIds.has(r.instrument_id)) flags.expiredInstruments += 1;
  }
  return flags;
}

export function computeCoatingFlags(
  dft: { INSIDE: (number | null)[]; OUTSIDE: (number | null)[] },
  nominals: { inside: number; outside: number },
  visual: Record<string, string | null>,
): ReviewFlags {
  const flags = emptyFlags();
  for (const [side, nominal] of [
    ["INSIDE", nominals.inside],
    ["OUTSIDE", nominals.outside],
  ] as const) {
    const stats = computeDftStats(dft[side], nominal);
    if (stats.belowCount > 0 || stats.aboveCount > 0) flags.fails += 1;
  }
  for (const value of Object.values(visual)) {
    if (value === "fail") flags.fails += 1;
  }
  return flags;
}

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

/** File naming per report-export-spec §7 (client QMS convention). */
export function reportFileName(
  format: "ST/QC/02" | "ST/QC/04",
  itemCode: string,
  deliveryBatch: string,
  inspectionDate: string,
): string {
  const fmt = format === "ST/QC/02" ? "STQC02" : "STQC04";
  const item = itemCode.replace(/[^A-Za-z0-9_-]/g, "");
  const lot = deliveryBatch.replace(/[^A-Za-z0-9_-]/g, "");
  return `${fmt}_${item}_${lot}_${inspectionDate.replaceAll("-", "")}.pdf`;
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

// ---------------------------------------------------------------------------
// Report data (Phase 6) — one fetch-shaped contract for the two controlled
// renderers. REUSES the review queries above (same rows the QH saw — spec §1:
// the printed record and the reviewed record can never diverge) and adds the
// print gaps: batch status (the export gate), instrument codes (the paper
// form's EQUIPMENT ID column), coating Section A/per-coat psychrometrics,
// sign-offs, and QH rejection comments (they print per the RejectModal's
// stated contract).
// ---------------------------------------------------------------------------

export interface ReportHeader {
  batchId: string;
  status: "DRAFT" | "SUBMITTED" | "REJECTED" | "APPROVED";
  workflow: "DIMENSIONAL" | "COATING";
  itemCode: string;
  drawingNumber: string;
  revision: string;
  customer: string;
  poNumber: string;
  deliveryBatchCode: string;
  inspectionDate: string;
  lotQty: number;
}

export interface ReportSignOff {
  role: "INSPECTOR" | "QUALITY_HEAD";
  name: string | null;
  decision: "SUBMIT" | "APPROVE" | "REJECT" | null;
  comments: string | null;
  signedAtIso: string | null;
}

export interface ReportDimRow {
  serial: number;
  label: string;
  symbol: string | null;
  isReference: boolean;
  nominal: number;
  tolPlus: number;
  tolMinus: number;
  instrumentCode: string | null;
  values: (number | null)[];
}

export interface ReportCoatRow {
  coatNo: number;
  product: string;
  ral: string | null;
  partABatch: string;
  partAMfg: string | null;
  partBBatch: string | null;
  partBMfg: string | null;
  thinnerBatch: string | null;
  viscosityS: number | null;
  wftUm: number | null;
  ambientC: number;
  rhPct: number;
  steelC: number;
  dewPointC: number | null;
  deltaTC: number | null;
  /** Server-recomputed verdict at record time (data-dictionary §4.3). */
  verdict: "APPROVED" | "PROHIBITED" | null;
}

export interface ReportSurfacePrep {
  steelGrade: string;
  weldEdgeOk: boolean;
  solventCleanOk: boolean;
  waterBreakPass: boolean;
  blastMethod: string;
  blastGrade: string;
  gritSize: string;
  profileUm: number | null;
}

export type ReportVisualChecks = Record<string, boolean>;

export type ReportData =
  | { workflow: "DIMENSIONAL"; header: ReportHeader; signOffs: ReportSignOff[]; rows: ReportDimRow[] }
  | {
      workflow: "COATING";
      header: ReportHeader;
      signOffs: ReportSignOff[];
      surfacePrep: ReportSurfacePrep;
      coats: ReportCoatRow[];
      dft: { INSIDE: (number | null)[]; OUTSIDE: (number | null)[] };
      dftNominals: { inside: number; outside: number };
      systems: { inside: string; outside: string };
      visual: ReportVisualChecks;
    };

/**
 * Everything one controlled report needs, in three queries (dims) / five
 * (coating). Throws for a batch that does not exist; returns the recorded
 * status so the UI gate can refuse printing before the audit RPC does.
 */
export async function getReportData(batchId: string): Promise<ReportData> {
  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, workflow, status, po_number, delivery_batch_code, inspection_date, lot_qty, revision_id, items ( item_code, drawing_number, customers ( name ) ), drawing_revisions ( rev ), sign_offs ( role, decision, comments, signed_at, profiles ( full_name ) )",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as {
    id: string;
    workflow: "DIMENSIONAL" | "COATING";
    status: "DRAFT" | "SUBMITTED" | "REJECTED" | "APPROVED";
    po_number: string;
    delivery_batch_code: string;
    inspection_date: string;
    lot_qty: number;
    revision_id: string;
    items: { item_code: string; drawing_number: string; customers: { name: string } | null } | null;
    drawing_revisions: { rev: string } | null;
    sign_offs: Array<{
      role: string;
      decision: string;
      comments: string | null;
      signed_at: string;
      profiles: { full_name: string } | null;
    }> | null;
  } | null;
  if (row === null) throw new Error(`Batch ${batchId} not found`);

  const signOffs: ReportSignOff[] = (row.sign_offs ?? []).map((s) => ({
    role: s.role as ReportSignOff["role"],
    name: s.profiles?.full_name ?? null,
    decision: s.decision as ReportSignOff["decision"],
    comments: s.comments,
    signedAtIso: s.signed_at,
  }));

  const header: ReportHeader = {
    batchId: row.id,
    status: row.status,
    workflow: row.workflow,
    itemCode: row.items?.item_code ?? "—",
    drawingNumber: row.items?.drawing_number ?? "—",
    revision: row.drawing_revisions?.rev ?? "—",
    customer: row.items?.customers?.name ?? "—",
    poNumber: row.po_number,
    deliveryBatchCode: row.delivery_batch_code,
    inspectionDate: row.inspection_date,
    lotQty: row.lot_qty,
  };

  if (row.workflow === "DIMENSIONAL") {
    const { data: readings, error: readingsError } = await supabase
      .from("readings")
      .select(
        "value_mm, sample_no, dimension_rows ( id, serial, label, symbol, is_reference, nominal, tol_plus, tol_minus, instruments ( instrument_code ) )",
      )
      .eq("batch_id", batchId)
      .order("sample_no", { ascending: true });
    if (readingsError) throw readingsError;
    type ReadingRow = {
      value_mm: number;
      sample_no: number;
      dimension_rows: {
        id: string;
        serial: number;
        label: string;
        symbol: string | null;
        is_reference: boolean;
        nominal: number;
        tol_plus: number;
        tol_minus: number;
        instruments: { instrument_code: string } | null;
      };
    };
    const byRow = new Map<string, ReportDimRow>();
    for (const r of readings as unknown as ReadingRow[]) {
      const dr = r.dimension_rows;
      let entry = byRow.get(dr.id);
      if (entry === undefined) {
        entry = {
          serial: dr.serial,
          label: dr.label,
          symbol: dr.symbol,
          isReference: dr.is_reference,
          nominal: dr.nominal,
          tolPlus: dr.tol_plus,
          tolMinus: dr.tol_minus,
          instrumentCode: dr.instruments?.instrument_code ?? null,
          values: [],
        };
        byRow.set(dr.id, entry);
      }
      entry.values[r.sample_no - 1] = r.value_mm;
    }
    return {
      workflow: "DIMENSIONAL",
      header,
      signOffs,
      rows: [...byRow.values()].sort((a, b) => a.serial - b.serial),
    };
  }

  // — Coating: Section A, per-coat logs + psychrometrics, DFT grids, visual —
  const [surfaceRes, coatsRes, dftRes, specRes, visualRes] = await Promise.all([
    supabase.from("batch_coating").select("*").eq("batch_id", batchId).maybeSingle(),
    supabase.from("coat_logs").select("*").eq("batch_id", batchId).order("coat_no"),
    supabase
      .from("dft_readings")
      .select("side, point_no, value_um")
      .eq("batch_id", batchId)
      .order("point_no"),
    supabase
      .from("coating_specs")
      .select(
        "system_inside, system_outside, dft_nominal_um_inside, dft_nominal_um_outside",
      )
      .eq("revision_id", row.revision_id)
      .maybeSingle(),
    supabase
      .from("batch_visual_checks")
      .select("defect, present")
      .eq("batch_id", batchId),
  ]);
  for (const r of [surfaceRes, coatsRes, dftRes, specRes, visualRes]) {
    if (r.error) throw r.error;
  }

  const coatSource = (coatsRes.data ?? []) as unknown as Array<{
    coat_no: number;
    product: string;
    ral: string | null;
    part_a_batch: string;
    part_a_mfg: string | null;
    part_b_batch: string | null;
    part_b_mfg: string | null;
    thinner_batch: string | null;
    viscosity_s: number | null;
    wft_um: number | null;
    ambient_c: number;
    rh_pct: number;
    steel_c: number;
    dew_point_c: number | null;
    delta_t_c: number | null;
  }>;
  const coats: ReportCoatRow[] = coatSource.map((c) => ({
    coatNo: c.coat_no,
    product: c.product,
    ral: c.ral,
    partABatch: c.part_a_batch,
    partAMfg: c.part_a_mfg,
    partBBatch: c.part_b_batch,
    partBMfg: c.part_b_mfg,
    thinnerBatch: c.thinner_batch,
    viscosityS: c.viscosity_s,
    wftUm: c.wft_um,
    ambientC: c.ambient_c,
    rhPct: c.rh_pct,
    steelC: c.steel_c,
    dewPointC: c.dew_point_c,
    deltaTC: c.delta_t_c,
    verdict: null,
  }));
  // The verdict prints as RECORDED at inspection time — re-derived with the
  // same engines (spec §4.3), never re-judged against today's conditions.
  for (const c of coats) {
    const verdict = evaluatePsychroGate(c.steelC, c.ambientC, c.rhPct);
    c.verdict = verdict.locked ? "PROHIBITED" : "APPROVED";
  }

  const dft: { INSIDE: (number | null)[]; OUTSIDE: (number | null)[] } = {
    INSIDE: Array(26).fill(null),
    OUTSIDE: Array(26).fill(null),
  };
  for (const r of dftRes.data as Array<{ side: string; point_no: number; value_um: number }>) {
    const grid = r.side === "INSIDE" ? dft.INSIDE : dft.OUTSIDE;
    grid[r.point_no - 1] = r.value_um;
  }

  const visual: ReportVisualChecks = {};
  for (const r of (visualRes.data ?? []) as Array<{ defect: string; present: boolean }>) {
    visual[r.defect] = r.present;
  }

  const surface = surfaceRes.data;
  const spec = specRes.data;

  return {
    workflow: "COATING",
    header,
    signOffs,
    surfacePrep: {
      steelGrade: surface?.steel_grade ?? "—",
      weldEdgeOk: surface?.weld_edge_ok ?? false,
      solventCleanOk: surface?.solvent_clean_ok ?? false,
      waterBreakPass: surface?.water_break_pass ?? false,
      blastMethod: surface?.blast_method ?? "—",
      blastGrade: surface?.blast_grade ?? "—",
      gritSize: surface?.grit_size ?? "—",
      profileUm: surface?.profile_um ?? null,
    },
    coats,
    dft,
    dftNominals: {
      inside: spec?.dft_nominal_um_inside ?? 0,
      outside: spec?.dft_nominal_um_outside ?? 0,
    },
    systems: {
      inside: spec?.system_inside ?? "C4 High",
      outside: spec?.system_outside ?? "C3 High",
    },
    visual,
  };
}
