import type { z } from "zod";
import { supabase } from "../supabase/client";
import { instrumentSchema } from "@/domain/schemas";
import { instrumentStatus } from "@/domain/instrument-status";
import { parseDimension } from "@/domain/tolerance-parser";
import type { InstrumentStatus } from "@/domain/instrument-status";

/**
 * Admin data layer (IM-01…06, EQ-01…02). RLS is the control plane — these
 * calls run as the signed-in ADMIN; the database rejects anyone else.
 */

// ————————————————————————————————————————————————————— Instruments (EQ-01)

export interface InstrumentRowView {
  id: string;
  instrument_code: string;
  description: string;
  make_model: string;
  range: string;
  last_cal_at: string;
  interval_months: number;
  next_due_at: string;
  retired_at: string | null;
  status: InstrumentStatus;
}

/** Registry list with the EQ-02 status derived at read time (pure `now` passed by caller). */
export async function listInstruments(todayIso: string): Promise<InstrumentRowView[]> {
  const { data, error } = await supabase
    .from("instruments")
    .select("*")
    .order("instrument_code", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    ...r,
    status: r.retired_at ? ("EXPIRED" as const) : instrumentStatus(todayIso, r.next_due_at),
  }));
}

/**
 * Create/update an instrument (EQ-01). Zod validates the same shape the DB
 * CHECKs enforce; edge 2.10 (next_due before last_cal / interval 0) is
 * rejected here — the schema's `intervalMonths.min(1)` carries it.
 */
export const instrumentFormSchema = instrumentSchema;
export type InstrumentForm = z.infer<typeof instrumentFormSchema>;

export async function saveInstrument(form: InstrumentForm): Promise<{ id: string }> {
  const parsed = instrumentFormSchema.parse(form); // throws ZodError → form shows field errors
  const { data, error } = await supabase
    .from("instruments")
    .upsert(
      {
        ...(parsed.instrumentId ? {} : {}),
        instrument_code: parsed.instrumentId,
        description: parsed.description,
        make_model: parsed.makeModel,
        range: parsed.range,
        last_cal_at: parsed.lastCalibrationDate,
        interval_months: parsed.intervalMonths,
      },
      { onConflict: "instrument_code" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

/** Soft retire only — readings keep FK references (edge 1.13). */
export async function retireInstrument(id: string): Promise<void> {
  const { error } = await supabase
    .from("instruments")
    .update({ retired_at: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————— Instrument usage recall (EQ-04)

export interface InstrumentUsageRow {
  batch_id: string;
  delivery_batch_code: string;
  po_number: string;
  inspection_date: string;
  item_code: string;
  batch_status: string;
  kind: "DIMENSIONAL" | "PROFILE";
  sample_count: number;
}

interface UsageEmbed {
  batch_id: string;
  batches: {
    delivery_batch_code: string;
    po_number: string;
    inspection_date: string;
    status: string;
    items: { item_code: string } | null;
  } | null;
}

/**
 * Every batch on which this instrument recorded data — readings (dimensional
 * samples, with counts) plus profile-gauge assignments (batch_coating). This
 * is the EQ-04 audit recall: given a suspect calibration, list what it touched.
 */
export async function getInstrumentUsage(instrumentId: string): Promise<InstrumentUsageRow[]> {
  const [readingsRes, profileRes] = await Promise.all([
    supabase
      .from("readings")
      .select(
        "batch_id, batches ( delivery_batch_code, po_number, inspection_date, status, items ( item_code ) )",
      )
      .eq("instrument_id", instrumentId),
    supabase
      .from("batch_coating")
      .select(
        "batch_id, batches ( delivery_batch_code, po_number, inspection_date, status, items ( item_code ) )",
      )
      .eq("profile_gauge_instrument_id", instrumentId),
  ]);
  if (readingsRes.error) throw readingsRes.error;
  if (profileRes.error) throw profileRes.error;

  const usage = new Map<string, InstrumentUsageRow>();
  const upsert = (row: UsageEmbed, kind: InstrumentUsageRow["kind"], count: number): void => {
    const b = row.batches;
    if (b === null) return;
    const existing = usage.get(row.batch_id);
    if (existing !== undefined && existing.kind === kind) {
      existing.sample_count += count;
      return;
    }
    usage.set(row.batch_id, {
      batch_id: row.batch_id,
      delivery_batch_code: b.delivery_batch_code,
      po_number: b.po_number,
      inspection_date: b.inspection_date,
      item_code: b.items?.item_code ?? "—",
      batch_status: b.status,
      kind,
      sample_count: count,
    });
  };

  // Count readings per batch client-side (grouped server-side would need a view).
  const perBatch = new Map<string, number>();
  for (const r of readingsRes.data as unknown as UsageEmbed[]) {
    perBatch.set(r.batch_id, (perBatch.get(r.batch_id) ?? 0) + 1);
  }
  const seen = new Set<string>();
  for (const r of readingsRes.data as unknown as UsageEmbed[]) {
    if (seen.has(r.batch_id)) continue;
    seen.add(r.batch_id);
    upsert(r, "DIMENSIONAL", perBatch.get(r.batch_id) ?? 0);
  }
  for (const r of profileRes.data as unknown as UsageEmbed[]) {
    upsert(r, "PROFILE", 1);
  }

  return [...usage.values()].sort((a, b) => b.inspection_date.localeCompare(a.inspection_date));
}

// —————————————————————————————————————————————————————————— Items (IM-01…05)

export interface ItemListRow {
  id: string;
  item_code: string;
  drawing_number: string;
  description: string;
  customer_name: string;
  latest_rev: string | null;
  dimension_count: number;
}

/**
 * Item Master list (IM-06): one search box across item code / drawing no. /
 * customer / description. The OR filter is server-side; `ilike` mirrors the
 * plan's "search across all fields simultaneously".
 */
export async function listItems(search: string): Promise<ItemListRow[]> {
  let query = supabase
    .from("items")
    .select(
      `id, item_code, drawing_number, description,
       customers ( name ),
       drawing_revisions ( id, rev, dimension_rows ( count ) )`,
    )
    .order("item_code", { ascending: true })
    .limit(200);
  const q = search.trim();
  if (q !== "") {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `item_code.ilike.${like},drawing_number.ilike.${like},description.ilike.${like},customers.name.ilike.${like}`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;

  const rows = data as unknown as ItemListQueryRow[];
  return rows.map((it) => {
    const revs = [...(it.drawing_revisions ?? [])];
    // Latest by natural order of insertion is not guaranteed — pick max rev string.
    revs.sort((a, b) => b.rev.localeCompare(a.rev));
    const latest: RevisionEmbed | null = revs[0] ?? null;
    const dimCount = latest ? (latest.dimension_rows[0]?.count ?? 0) : 0;
    return {
      id: it.id,
      item_code: it.item_code,
      drawing_number: it.drawing_number,
      description: it.description,
      customer_name: it.customers?.name ?? "—",
      latest_rev: latest?.rev ?? null,
      dimension_count: dimCount,
    };
  });
}

/** Shape of the items list join query (embeds cannot be expressed by the
 * hand-written DB types; cast at the single boundary, validated by tests). */
interface ItemListQueryRow {
  id: string;
  item_code: string;
  drawing_number: string;
  description: string;
  customers: { name: string } | null;
  drawing_revisions: { id: string; rev: string; dimension_rows: { count: number }[] }[] | null;
}

type RevisionEmbed = NonNullable<ItemListQueryRow["drawing_revisions"]>[number];

export async function listCustomers(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("customers").select("id, name").order("name");
  if (error) throw error;
  return data;
}

/** Full editor state for one item (latest revision), IM-04/05. */
export interface ItemEditorData {
  item_id: string;
  item_code: string;
  drawing_number: string;
  description: string;
  customer_id: string;
  rev: string;
  released_at: string | null;
  rows: PastedRow[];
  coating: PublishItemInput["coating"];
}

/**
 * Load an item for the editor — item header + latest revision's rows and
 * coating spec. Embeds are cast at this single boundary (same discipline as
 * listItems; the upsert path in publishItem is the validator).
 */
export async function getItemForEdit(itemId: string): Promise<ItemEditorData | null> {
  const { data, error } = await supabase
    .from("items")
    .select(
      `id, item_code, drawing_number, description, customer_id,
       drawing_revisions ( id, rev, released_at,
         dimension_rows ( serial, label, symbol, is_reference, nominal, tol_plus, tol_minus ),
         coating_specs ( substrate, blast_grade, blast_profile_um_min, blast_profile_um_max,
           system_inside, system_outside, dft_nominal_um_inside, dft_nominal_um_outside ) )`,
    )
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;

  const it = data as unknown as {
    id: string;
    item_code: string;
    drawing_number: string;
    description: string;
    customer_id: string;
    drawing_revisions:
      | {
          id: string;
          rev: string;
          released_at: string | null;
          dimension_rows:
            | {
                serial: number;
                label: string;
                symbol: string | null;
                is_reference: boolean;
                nominal: number;
                tol_plus: number;
                tol_minus: number;
              }[]
            | null;
          coating_specs:
            | {
                substrate: string;
                blast_grade: string;
                blast_profile_um_min: number;
                blast_profile_um_max: number;
                system_inside: string;
                system_outside: string;
                dft_nominal_um_inside: number;
                dft_nominal_um_outside: number;
              }[]
            | null;
        }[]
      | null;
  };
  const revs = [...(it.drawing_revisions ?? [])].sort((a, b) => b.rev.localeCompare(a.rev));
  const latest = revs[0] ?? null;
  const spec = latest?.coating_specs?.[0] ?? null;
  return {
    item_id: it.id,
    item_code: it.item_code,
    drawing_number: it.drawing_number,
    description: it.description,
    customer_id: it.customer_id,
    rev: latest?.rev ?? "",
    released_at: latest?.released_at ?? null,
    rows: (latest?.dimension_rows ?? [])
      .map((r) => ({
        serial: r.serial,
        label: r.label,
        raw: String(r.nominal),
        nominal: r.nominal,
        tolPlus: r.tol_plus,
        tolMinus: r.tol_minus,
        symbol: r.symbol,
        isReference: r.is_reference,
      }))
      .sort((a, b) => a.serial - b.serial),
    coating:
      spec === null
        ? null
        : {
            substrate: spec.substrate,
            blast_grade: spec.blast_grade,
            blast_profile_um_min: spec.blast_profile_um_min,
            blast_profile_um_max: spec.blast_profile_um_max,
            system_inside: spec.system_inside,
            system_outside: spec.system_outside,
            dft_nominal_um_inside: spec.dft_nominal_um_inside,
            dft_nominal_um_outside: spec.dft_nominal_um_outside,
          },
  };
}

// —————————————————————————————— Excel paste-import (the migration accelerant)

export interface PastedRow {
  serial: number;
  label: string;
  raw: string;
  nominal: number;
  tolPlus: number;
  tolMinus: number;
  symbol: string | null;
  isReference: boolean;
}

export interface PasteImportResult {
  rows: PastedRow[];
  /** Duplicates were collapsed to the first occurrence (edge 2.6). */
  duplicates: number[];
  /** Lines that produced no parseable dimension (edge 2.7) — 1-based. */
  failedLines: { line: number; text: string }[];
}

const SYMBOL_TEXT: Record<string, string> = {
  diameter: "Ø",
  angle: "°",
  radius: "R",
  runout: "↗",
};

/**
 * Parse pasted Excel content (one dimension per line; tab- or space-
 * separated; merged cells already flatten to repeated text). Grammar follows
 * data-dictionary §6: `[serial.] label raw-dimension`. Rows that parse feed
 * the editor pre-filled; failures are listed, never dropped silently.
 */
export function parsePastedDimensions(text: string): PasteImportResult {
  const rows: PastedRow[] = [];
  const duplicates: number[] = [];
  const failedLines: { line: number; text: string }[] = [];
  const seen = new Set<number>();
  let autoSerial = 1;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed === "") return;

    // Leading serial ("12. SHAFT DIA Ø25±0.2" / "12\tSHAFT…").
    const m = trimmed.match(/^(\d{1,3})[.\s)-]+(.*)$/);
    let serial: number | null = null;
    let rest = trimmed;
    const serialText = m?.[1];
    const remainderText = m?.[2];
    if (m !== null && serialText !== undefined && remainderText !== undefined) {
      serial = Number(serialText);
      rest = remainderText.trim();
    }

    // Split `rest` into label prefix + dimension tail. The dimension starts
    // at the FIRST token containing a digit (label words on drawings are
    // non-numeric by convention); everything from there on — including
    // tolerance suffixes like "±0.5" — belongs to the dimension. No numeric
    // token ⇒ the whole line is reported as failed (edge 2.7), never dropped
    // silently.
    const tokens = rest.split(/\s+/);
    const dimStart = tokens.findIndex((t) => /\d/.test(t));
    const labelTokens = dimStart === -1 ? [] : tokens.slice(0, dimStart);
    const dimRaw = dimStart === -1 ? rest : tokens.slice(dimStart).join(" ");

    const parsed = parseDimension(dimRaw);
    if (!parsed) {
      failedLines.push({ line: idx + 1, text: trimmed });
      return;
    }

    const effectiveSerial = serial ?? autoSerial;
    autoSerial = Math.max(autoSerial, effectiveSerial) + 1;
    if (seen.has(effectiveSerial)) {
      duplicates.push(effectiveSerial);
      return; // first occurrence wins; duplicates reported (edge 2.6)
    }
    seen.add(effectiveSerial);

    rows.push({
      serial: effectiveSerial,
      label: labelTokens.join(" ") || `DIM-${String(effectiveSerial).padStart(2, "0")}`,
      raw: dimRaw,
      nominal: parsed.nominal,
      tolPlus: parsed.tolerancePlus ?? 0,
      tolMinus: parsed.toleranceMinus ?? 0,
      symbol: parsed.symbol ? (SYMBOL_TEXT[parsed.symbol] ?? null) : null,
      isReference: parsed.isReference,
    });
  });

  rows.sort((a, b) => a.serial - b.serial);
  return { rows, duplicates: [...new Set(duplicates)].sort((a, b) => a - b), failedLines };
}

// ———————————————————————————————————————————————— Item publishing (IM-05)

export interface PublishItemInput {
  item_code: string;
  drawing_number: string;
  description: string;
  customer_id: string;
  rev: string;
  released_at: string | null;
  rows: PastedRow[];
  coating: {
    substrate: string;
    blast_grade: string;
    blast_profile_um_min: number;
    blast_profile_um_max: number;
    system_inside: string;
    system_outside: string;
    dft_nominal_um_inside: number;
    dft_nominal_um_outside: number;
  } | null;
}

/**
 * Publish an item + revision + dimension rows (+ optional coating spec).
 * Sequential client inserts (RLS admin-only); edge 2.8's in-flight-batch
 * warning is surfaced in the wizard before this runs. Revisions are immutable
 * once batches reference them (IM-05) — publishing a fix means a new rev.
 */
export async function publishItem(
  input: PublishItemInput,
): Promise<{ item_id: string; revision_id: string }> {
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .upsert(
      {
        item_code: input.item_code,
        drawing_number: input.drawing_number,
        description: input.description,
        customer_id: input.customer_id,
      },
      { onConflict: "item_code" },
    )
    .select("id")
    .single();
  if (itemErr) throw itemErr;

  const { data: rev, error: revErr } = await supabase
    .from("drawing_revisions")
    .upsert(
      { item_id: item.id, rev: input.rev, released_at: input.released_at },
      { onConflict: "item_id,rev" },
    )
    .select("id")
    .single();
  if (revErr) throw revErr;

  if (input.rows.length > 0) {
    const { error: rowsErr } = await supabase.from("dimension_rows").upsert(
      input.rows.map((r) => ({
        revision_id: rev.id,
        serial: r.serial,
        label: r.label,
        nominal: r.nominal,
        tol_plus: r.tolPlus,
        tol_minus: r.tolMinus,
        symbol: r.symbol,
        is_reference: r.isReference,
      })),
      { onConflict: "revision_id,serial" },
    );
    if (rowsErr) throw rowsErr;
  }

  if (input.coating) {
    const { error: specErr } = await supabase
      .from("coating_specs")
      .upsert({ revision_id: rev.id, ...input.coating }, { onConflict: "revision_id" });
    if (specErr) throw specErr;
  }

  return { item_id: item.id, revision_id: rev.id };
}
