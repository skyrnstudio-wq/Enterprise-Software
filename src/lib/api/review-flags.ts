import { supabase } from "../supabase/client";
import { computeDftStats } from "@/domain/dft-stats";
import { rowStatus } from "@/domain/grid-model";
import type { RowStatus } from "@/domain/grid-model";

/**
 * Review flags — execution-plan.md Phase 5 (ui-ux-plan §6.8).
 *
 * Flags are computed client-side with the SAME domain engines the inspector's
 * grid used (single source of evaluation truth), over the exact recorded
 * values — S16's "read-only render of the record the inspector saw" is
 * therefore byte-identical to what was submitted. The server remains the
 * control plane: `decide_batch` re-validates role, AAL2, race, and separation
 * of duties inside the transaction.
 */

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
