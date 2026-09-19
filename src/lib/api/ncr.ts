import { supabase } from "@/lib/supabase/client";

/**
 * NCR data layer (D2). The register is read by every signed-in user; opens
 * are batch-owner (or QH/Admin) writes on the DRAFT batch; dispositions are
 * QH/Admin updates. RLS (migration 008) is the control plane — these calls
 * simply speak its shape.
 */

export interface NcrRow {
  id: string;
  ncr_number: string;
  batch_id: string;
  created_by: string;
  description: string;
  source: "DIMENSIONAL" | "COATING" | "REVIEW";
  status: "OPEN" | "ACKNOWLEDGED" | "CLOSED";
  disposition: "REWORK" | "USE_AS_IS" | "REJECT" | "SORT" | "REPAIR" | null;
  closed_at: string | null;
  created_at: string;
}

const NCR_COLUMNS = `id, ncr_number, batch_id, created_by, description, source, status,
  disposition, closed_at, created_at`;

/** Full register, newest first (NCR register screen, §4.7). */
export async function listNcrs(): Promise<NcrRow[]> {
  const { data, error } = await supabase
    .from("ncrs")
    .select(NCR_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

/** NCRs linked to one batch (queue/detail rendering). */
export async function listNcrsForBatch(batchId: string): Promise<NcrRow[]> {
  const { data, error } = await supabase
    .from("ncrs")
    .select(NCR_COLUMNS)
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Open an NCR against a batch (inspector on their DRAFT, or QH/Admin).
 * `description` carries the finding; numbering is allocated by the DB trigger.
 */
export async function openNcr(input: {
  batchId: string;
  description: string;
  source: NcrRow["source"];
}): Promise<NcrRow> {
  const { data, error } = await supabase
    .from("ncrs")
    .insert({
      batch_id: input.batchId,
      description: input.description,
      source: input.source,
    })
    .select(NCR_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** QH/Admin lifecycle update: acknowledge, dispose, close. */
export async function updateNcr(
  id: string,
  patch: { status?: NcrRow["status"]; disposition?: NcrRow["disposition"] | null },
): Promise<void> {
  const update: Partial<NcrRow> = { ...patch };
  if (patch.status === "CLOSED") update.closed_at = new Date().toISOString();
  if (patch.status !== undefined && patch.status !== "CLOSED") update.closed_at = null;
  const { error } = await supabase.from("ncrs").update(update).eq("id", id);
  if (error) throw error;
}
