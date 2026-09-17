/**
 * Database types — hand-written to mirror migrations 001–005 exactly.
 *
 * Regenerate with `npm run db:types` once the local Supabase stack is
 * available (Docker); this file must stay drop-in compatible with the
 * generated output (same Tables/Functions/Enums shape). A schema-parity
 * test asserts the migration surface this file mirrors.
 */

export type Json = Record<string, unknown> | string | number | boolean | null;

export type BatchStatus = "DRAFT" | "SUBMITTED" | "REJECTED" | "APPROVED";
export type Workflow = "DIMENSIONAL" | "COATING";
export type AppRole = "ADMIN" | "QC_INSPECTOR" | "NACE_INSPECTOR" | "QUALITY_HEAD";
export type DftSide = "INSIDE" | "OUTSIDE";
export type SignOffRole = "INSPECTOR" | "QUALITY_HEAD";
export type Decision = "SUBMIT" | "APPROVE" | "REJECT";

export interface Table<_Row, Insert, Update> {
  Row: _Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

interface Profiles {
  Row: {
    id: string;
    full_name: string;
    role: AppRole;
    mfa_enforced: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: { id: string; full_name: string; role?: AppRole; mfa_enforced?: boolean };
  Update: Partial<Profiles["Insert"]>;
}
interface Customer {
  Row: { id: string; name: string; created_at: string };
  Insert: { id?: string; name: string };
  Update: Partial<Customer["Insert"]>;
}
interface Item {
  Row: {
    id: string;
    item_code: string;
    drawing_number: string;
    description: string;
    customer_id: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    item_code: string;
    drawing_number: string;
    description: string;
    customer_id: string;
  };
  Update: Partial<Item["Insert"]>;
}
interface DrawingRevision {
  Row: { id: string; item_id: string; rev: string; released_at: string | null; created_at: string };
  Insert: { id?: string; item_id: string; rev: string; released_at?: string | null };
  Update: Partial<DrawingRevision["Insert"]>;
}
interface DimensionRow {
  Row: {
    id: string;
    revision_id: string;
    serial: number;
    label: string;
    nominal: number;
    tol_plus: number;
    tol_minus: number;
    symbol: string | null;
    is_reference: boolean;
    created_at: string;
  };
  Insert: {
    id?: string;
    revision_id: string;
    serial: number;
    label: string;
    nominal: number;
    tol_plus: number;
    tol_minus: number;
    symbol?: string | null;
    is_reference?: boolean;
  };
  Update: Partial<DimensionRow["Insert"]>;
}
interface CoatingSpec {
  Row: {
    id: string;
    revision_id: string;
    substrate: string;
    blast_grade: string;
    blast_profile_um_min: number;
    blast_profile_um_max: number;
    system_inside: string;
    system_outside: string;
    dft_nominal_um_inside: number;
    dft_nominal_um_outside: number;
    created_at: string;
  };
  Insert: Omit<CoatingSpec["Row"], "id" | "created_at"> & { id?: string };
  Update: Partial<CoatingSpec["Insert"]>;
}
interface Batch {
  Row: {
    id: string;
    item_id: string;
    revision_id: string;
    created_by: string;
    po_number: string;
    delivery_batch_code: string;
    lot_qty: number;
    inspection_date: string;
    status: BatchStatus;
    workflow: Workflow;
    created_at: string;
    updated_at: string;
  };
  Insert: Omit<Batch["Row"], "id" | "created_at" | "updated_at" | "status" | "created_by"> & {
    id?: string;
    status?: BatchStatus;
    created_by?: string; // defaulted to auth.uid() (migration 001)
  };
  Update: Partial<Batch["Insert"]>;
}
interface Reading {
  Row: {
    id: string;
    batch_id: string;
    dimension_row_id: string;
    sample_no: number;
    value_mm: number;
    instrument_id: string;
    created_at: string;
  };
  Insert: Omit<Reading["Row"], "id" | "created_at"> & { id?: string };
  Update: Partial<Reading["Insert"]>;
}
interface CoatLog {
  Row: {
    id: string;
    batch_id: string;
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
    created_at: string;
  };
  Insert: Omit<CoatLog["Row"], "id" | "created_at" | "dew_point_c" | "delta_t_c"> & {
    id?: string;
    dew_point_c?: number | null;
    delta_t_c?: number | null;
  };
  Update: Partial<CoatLog["Insert"]>;
}
interface DftReading {
  Row: {
    id: string;
    batch_id: string;
    side: DftSide;
    point_no: number;
    value_um: number;
    created_at: string;
  };
  Insert: Omit<DftReading["Row"], "id" | "created_at"> & { id?: string };
  Update: Partial<DftReading["Insert"]>;
}
interface SignOff {
  Row: {
    id: string;
    batch_id: string;
    role: SignOffRole;
    user_id: string;
    decision: Decision;
    comments: string | null;
    signed_at: string;
  };
  Insert: Omit<SignOff["Row"], "id" | "signed_at"> & { id?: string };
  Update: Partial<SignOff["Insert"]>;
}
interface Instrument {
  Row: {
    id: string;
    instrument_code: string;
    description: string;
    make_model: string;
    range: string;
    last_cal_at: string;
    interval_months: number;
    retired_at: string | null;
    created_at: string;
    next_due_at: string;
  };
  Insert: {
    id?: string;
    instrument_code: string;
    description: string;
    make_model: string;
    range: string;
    last_cal_at: string;
    interval_months: number;
    retired_at?: string | null;
  };
  Update: Partial<Instrument["Insert"]>;
}
interface AuditLog {
  Row: {
    id: string;
    actor: string | null;
    entity: string;
    entity_id: string | null;
    action: string;
    payload: Json;
    at: string;
  };
  Insert: never; // trigger/SECURITY DEFINER only
  Update: never;
}
interface BatchCoating {
  Row: {
    batch_id: string;
    steel_grade: string;
    weld_edge_ok: boolean;
    solvent_clean_ok: boolean;
    water_break_pass: boolean;
    blast_method: string;
    blast_grade: string;
    grit_size: string;
    profile_um: number | null;
    profile_gauge_instrument_id: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: Omit<BatchCoating["Row"], "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<BatchCoating["Insert"]>;
}
interface BatchVisualCheck {
  Row: {
    batch_id: string;
    defect: string;
    checked: boolean;
    present: boolean;
    created_at: string;
  };
  Insert: Omit<BatchVisualCheck["Row"], "created_at"> & { created_at?: string };
  Update: Partial<BatchVisualCheck["Insert"]>;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profiles["Row"], Profiles["Insert"], Profiles["Update"]>;
      customers: Table<Customer["Row"], Customer["Insert"], Customer["Update"]>;
      items: Table<Item["Row"], Item["Insert"], Item["Update"]>;
      drawing_revisions: Table<
        DrawingRevision["Row"],
        DrawingRevision["Insert"],
        DrawingRevision["Update"]
      >;
      dimension_rows: Table<DimensionRow["Row"], DimensionRow["Insert"], DimensionRow["Update"]>;
      coating_specs: Table<CoatingSpec["Row"], CoatingSpec["Insert"], CoatingSpec["Update"]>;
      /** Functions map — declareDbFunctions helper has no stable export; the
       * client calls RPCs by name, so no per-function type is needed here. */
      batches: Table<Batch["Row"], Batch["Insert"], Batch["Update"]>;
      readings: Table<Reading["Row"], Reading["Insert"], Reading["Update"]>;
      coat_logs: Table<CoatLog["Row"], CoatLog["Insert"], CoatLog["Update"]>;
      dft_readings: Table<DftReading["Row"], DftReading["Insert"], DftReading["Update"]>;
      sign_offs: Table<SignOff["Row"], SignOff["Insert"], SignOff["Update"]>;
      instruments: Table<Instrument["Row"], Instrument["Insert"], Instrument["Update"]>;
      audit_log: Table<AuditLog["Row"], AuditLog["Insert"], AuditLog["Update"]>;
      batch_coating: Table<BatchCoating["Row"], BatchCoating["Insert"], BatchCoating["Update"]>;
      batch_visual_checks: Table<
        BatchVisualCheck["Row"],
        BatchVisualCheck["Insert"],
        BatchVisualCheck["Update"]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      submit_batch: { Args: { p_batch_id: string; p_payload: Json }; Returns: Json };
      decide_batch: {
        Args: { p_batch_id: string; p_decision: string; p_comments: string | null };
        Returns: Json;
      };
      upsert_batch_draft: {
        Args: { p_header: Json; p_readings: Json; p_coat_logs: Json; p_dft_readings: Json };
        Returns: Json;
      };
      log_export: {
        Args: { p_batch_id: string; p_channel: string; p_meta: Json };
        Returns: string;
      };
    };
    Enums: { batch_status: BatchStatus };
    CompositeTypes: { [_ in never]: never };
  };
}
