import { supabase } from "../supabase/client";
import { evaluatePsychroGate } from "@/domain/coating";

/**
 * Report data (Phase 6) — one fetch-shaped contract for the two controlled
 * renderers. REUSES the review queries (same rows the QH saw — spec §1: the
 * printed record and the reviewed record can never diverge) and adds the
 * print gaps: batch status (the export gate), instrument codes (the paper
 * form's EQUIPMENT ID column), coating Section A/per-coat psychrometrics,
 * sign-offs, and QH rejection comments (they print per the RejectModal's
 * stated contract).
 */

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
    // Instrument code rides the reading's own FK (readings.instrument_id →
    // instruments) — dimension_rows has no relationship to instruments, and
    // PostgREST 400s (PGRST200) if you ask it to invent one.
    const { data: readings, error: readingsError } = await supabase
      .from("readings")
      .select(
        "value_mm, sample_no, instruments ( instrument_code ), dimension_rows ( id, serial, label, symbol, is_reference, nominal, tol_plus, tol_minus )",
      )
      .eq("batch_id", batchId)
      .order("sample_no", { ascending: true });
    if (readingsError) throw readingsError;
    type ReadingRow = {
      value_mm: number;
      sample_no: number;
      instruments: { instrument_code: string } | null;
      dimension_rows: {
        id: string;
        serial: number;
        label: string;
        symbol: string | null;
        is_reference: boolean;
        nominal: number;
        tol_plus: number;
        tol_minus: number;
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
          instrumentCode: r.instruments?.instrument_code ?? null,
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
