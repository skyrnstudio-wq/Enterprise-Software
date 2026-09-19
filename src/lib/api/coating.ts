import { supabase } from "../supabase/client";
import { db } from "@/lib/dexie/db";
import type { CoatingDraft, VisualCheckState } from "@/lib/dexie/db";
import type { Json } from "@/lib/supabase/database.types";
import { computeDftStats } from "@/domain/dft-stats";

/**
 * Coating batch API — execution-plan.md Phase 4 steps 1/8 + offline doc §3/§5.
 *
 * - Creation inserts the batch (workflow COATING) plus the Section A defaults
 *   row (migration 007 `batch_coating`), mirroring the paper form's presets.
 * - Submission syncs coat logs + DFT readings through `upsert_batch_draft`
 *   (the same RPC the dimensional flow uses — server wins on status drift),
 *   then calls `submit_batch`, which RECOMPUTES the psychrometric lock and
 *   the ISO 19840 80/200 verdicts server-side (BT_LOCK on any breach).
 * - Offline: same pendingSync queue + drainSync as the dimensional flow.
 */

export interface CoatingSpecView {
  substrate: string;
  blast_grade: string;
  blast_profile_um_min: number;
  blast_profile_um_max: number;
  system_inside: string;
  system_outside: string;
  dft_nominal_um_inside: number;
  dft_nominal_um_outside: number;
}

/** Coating spec for a revision — drives DFT panel nominals + profile band. */
export async function getCoatingSpec(revisionId: string): Promise<CoatingSpecView | null> {
  const { data, error } = await supabase
    .from("coating_specs")
    .select(
      "substrate, blast_grade, blast_profile_um_min, blast_profile_um_max, system_inside, system_outside, dft_nominal_um_inside, dft_nominal_um_outside",
    )
    .eq("revision_id", revisionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CreateCoatingBatchInput {
  item_id: string;
  revision_id: string;
  po_number: string;
  delivery_batch_code: string;
  inspection_date: string;
  lot_quantity: number;
}

/** Create a DRAFT coating batch + its Section A defaults row. */
export async function createCoatingBatch(input: CreateCoatingBatchInput): Promise<string> {
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
      workflow: "COATING",
    })
    .select("id")
    .single();
  if (error) throw error;

  // Section A presets (steel grade, blast method/grade, grit) — migration 007
  // defaults match the PRD; the row exists so the wizard edits, not creates.
  // Explicit values keep the hand-written Insert type happy (no DB defaults).
  const { error: sectionError } = await supabase.from("batch_coating").insert({
    batch_id: data.id,
    steel_grade: "MS Sheet Fabrication",
    weld_edge_ok: false,
    solvent_clean_ok: false,
    water_break_pass: false,
    blast_method: "Abrasive Blast Cleaning",
    blast_grade: "Sa 2.5",
    grit_size: "G-40",
    comparator_grade: null,
    profile_um: null,
    profile_gauge_instrument_id: null,
  });
  if (sectionError) throw sectionError;

  return data.id;
}

/**
 * Fill any field added after a draft was persisted (Dexie stores schema-less
 * JSON — a draft saved by an older build would otherwise submit with
 * `undefined` sections and the sync would drop them silently).
 */
export function normalizeCoatingDraft(raw: CoatingDraft): CoatingDraft {
  // Casts keep the `??` real for TS (no-unnecessary-condition): older drafts
  // genuinely may lack these keys at runtime even though the type says no.
  const surface = raw.surfacePrep as Partial<CoatingDraft["surfacePrep"]> | undefined;
  const visual = raw.visual as Partial<VisualCheckState> | undefined;
  // Cast the ACCESS (not the result): older persisted drafts genuinely may
  // lack the key at runtime even though the type says it is always present.
  const coats =
    (raw as { coats?: Array<Partial<CoatingDraft["coats"][number]> & { coatNo: number }> }).coats ??
    [];
  return {
    ...raw,
    surfacePrep: {
      steelGrade: surface?.steelGrade ?? "MS Sheet Fabrication",
      blastMethod: surface?.blastMethod ?? "Abrasive Blast Cleaning",
      blastGrade: surface?.blastGrade ?? "Sa 2.5",
      gritSize: surface?.gritSize ?? "G-40",
      comparatorGrade: surface?.comparatorGrade ?? null,
      weldEdgeOk: surface?.weldEdgeOk ?? false,
      solventCleanOk: surface?.solventCleanOk ?? false,
      waterBreakPass: surface?.waterBreakPass ?? false,
      profileUm: surface?.profileUm ?? null,
      gaugeInstrumentId: surface?.gaugeInstrumentId ?? null,
    },
    coats: coats.map((c) => ({
      coatNo: c.coatNo,
      product: c.product ?? "",
      mfgDate: c.mfgDate ?? null,
      partABatch: c.partABatch ?? "",
      partBBatch: c.partBBatch ?? "",
      thinnerPercent: c.thinnerPercent ?? null,
      wftUm: c.wftUm ?? [null, null, null],
    })),
    visual: {
      pinholes: visual?.pinholes ?? null,
      sagging: visual?.sagging ?? null,
      gloss_loss: visual?.gloss_loss ?? null,
      peel_off: visual?.peel_off ?? null,
      blisters: visual?.blisters ?? null,
    },
  };
}

export type CoatingSubmitResult =
  | { kind: "submitted"; batchId: string }
  | { kind: "queued-offline"; batchId: string }
  | { kind: "blocked"; message: string };

/**
 * Coat-log payload per the RPC contract (migration 005): product + Part A
 * batch mandatory; WFT averaged from the entered readings; the coat's
 * condition stamp comes from Section B. `part_a_mfg` carries the
 * manufacturing date the shelf-life chip validated; `part_b_batch` is the
 * hardener batch (COAT-04); thinner % is advisory and stays client-side.
 */
function coatLogPayload(draft: CoatingDraft): Record<string, unknown>[] {
  const conditions = draft.conditions;
  const hasConditions =
    conditions.ambientTempC !== null &&
    conditions.relativeHumidity !== null &&
    conditions.steelTempC !== null;
  return draft.coats
    .filter((c) => c.product.trim() !== "" && c.partABatch.trim() !== "")
    .map((c) => {
      const wft = c.wftUm.filter((w): w is number => w !== null);
      return {
        coat_no: c.coatNo,
        product: c.product,
        part_a_batch: c.partABatch,
        part_a_mfg: c.mfgDate,
        part_b_batch: c.partBBatch.trim() === "" ? null : c.partBBatch,
        wft_um: wft.length > 0 ? wft.reduce((s, v) => s + v, 0) / wft.length : null,
        ...(hasConditions
          ? {
              ambient_c: conditions.ambientTempC,
              rh_pct: conditions.relativeHumidity,
              steel_c: conditions.steelTempC,
            }
          : {}),
      };
    });
}

/** DFT points per the RPC contract: only entered values — never zeros. */
function dftPayload(draft: CoatingDraft): Record<string, unknown>[] {
  const sides = ["INSIDE", "OUTSIDE"] as const;
  return sides.flatMap((side) =>
    draft.dft[side]
      .map((value, i) => ({ value, point: i + 1 }))
      .filter((p): p is { value: number; point: number } => p.value !== null)
      .map((p) => ({ side, point_no: p.point, value_um: p.value })),
  );
}

/** ISO 19840 80/200 breach count per side — the client mirror of the
 * RPC's BT_LOCK; the wizard's checklist gates on this being zero. */
export function dftBreachCounts(
  draft: CoatingDraft,
  spec: Pick<CoatingSpecView, "dft_nominal_um_inside" | "dft_nominal_um_outside">,
): { INSIDE: number; OUTSIDE: number } {
  const insideStats = computeDftStats(draft.dft.INSIDE, spec.dft_nominal_um_inside);
  const outsideStats = computeDftStats(draft.dft.OUTSIDE, spec.dft_nominal_um_outside);
  return {
    INSIDE: insideStats.belowCount + insideStats.aboveCount,
    OUTSIDE: outsideStats.belowCount + outsideStats.aboveCount,
  };
}

async function syncCoatingContents(draft: CoatingDraft): Promise<void> {
  // Same signature as the dimensional sync (migration 005): p_batch carries
  // the batch id — see the note in batches.ts.
  const { error } = await supabase.rpc("upsert_batch_draft", {
    p_batch: { id: draft.batchId, ...draft.header } as unknown as Json,
    p_readings: [] as unknown as Json,
    p_coat_logs: coatLogPayload(draft) as unknown as Json,
    p_dft_readings: dftPayload(draft) as unknown as Json,
  });
  if (error !== null) throw error;
}

/**
 * Section A sync — `upsert_batch_draft` has a fixed 4-param signature
 * (header/readings/coat logs/DFT), so Section A rides as a direct
 * RLS-governed upsert (migration 007 policy: owner + DRAFT only).
 */
async function syncSectionA(draft: CoatingDraft): Promise<void> {
  const a = draft.surfacePrep;
  const { error } = await supabase.from("batch_coating").upsert(
    {
      batch_id: draft.batchId,
      steel_grade: a.steelGrade,
      weld_edge_ok: a.weldEdgeOk,
      solvent_clean_ok: a.solventCleanOk,
      water_break_pass: a.waterBreakPass,
      blast_method: a.blastMethod,
      blast_grade: a.blastGrade,
      grit_size: a.gritSize,
      comparator_grade: a.comparatorGrade,
      profile_um: a.profileUm,
      profile_gauge_instrument_id: a.gaugeInstrumentId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "batch_id" },
  );
  if (error !== null) throw error;
}

/** Section E sync — five fixed defect rows, checked/present semantics (4.18). */
async function syncSectionE(draft: CoatingDraft): Promise<void> {
  const rows = Object.entries(draft.visual).map(([defect, value]) => ({
    batch_id: draft.batchId,
    defect,
    checked: value !== null,
    present: value === "fail",
  }));
  const { error } = await supabase
    .from("batch_visual_checks")
    .upsert(rows, { onConflict: "batch_id,defect" });
  if (error !== null) throw error;
}

/**
 * Submit a completed coating draft (Phase 4 step 8). The wizard's checklist
 * has already gated the UI; the server re-derives dew point per coat log and
 * the 80/200 verdicts inside the transaction (client gates = UX, server =
 * truth — backend-architecture.md §5.1).
 */
export async function submitCoatingBatch(
  draft: CoatingDraft,
  spec: Pick<CoatingSpecView, "dft_nominal_um_inside" | "dft_nominal_um_outside">,
): Promise<CoatingSubmitResult> {
  const batchId = draft.batchId;

  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!online) {
    await db.pendingSync.add({
      table: "submit_coating_batch",
      operation: "insert",
      payload: { draft, spec },
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    return { kind: "queued-offline", batchId };
  }

  try {
    await syncCoatingContents(draft);
    await syncSectionA(draft);
    await syncSectionE(draft);
    const { error } = await supabase.rpc("submit_batch", {
      p_batch_id: batchId,
      p_client_stats: {
        client: "coating-wizard",
        saved_at: draft.savedAt,
        client_stats: {
          dft_inside: computeDftStats(draft.dft.INSIDE, spec.dft_nominal_um_inside),
          dft_outside: computeDftStats(draft.dft.OUTSIDE, spec.dft_nominal_um_outside),
        },
      } as unknown as Json,
    });
    if (error !== null) return { kind: "blocked", message: error.message };
    await db.coatingDrafts.delete(batchId);
    return { kind: "submitted", batchId };
  } catch (err) {
    return { kind: "blocked", message: err instanceof Error ? err.message : "Submission failed" };
  }
}

/** Replays a queued coating submission exactly as the online path would. */
export async function replayCoatingSubmission(payload: {
  draft: CoatingDraft;
  spec: Pick<CoatingSpecView, "dft_nominal_um_inside" | "dft_nominal_um_outside">;
}): Promise<void> {
  await syncCoatingContents(payload.draft);
  await syncSectionA(payload.draft);
  await syncSectionE(payload.draft);
  const { error } = await supabase.rpc("submit_batch", {
    p_batch_id: payload.draft.batchId,
    p_client_stats: {
      client: "coating-wizard",
      saved_at: payload.draft.savedAt,
      replayed: true,
    } as unknown as Json,
  });
  if (error !== null) throw error;
  await db.coatingDrafts.delete(payload.draft.batchId);
}
