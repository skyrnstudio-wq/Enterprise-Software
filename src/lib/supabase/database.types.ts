/**
 * Placeholder database types for Phase 0.
 *
 * Replace with generated types once the first Supabase migration lands:
 *   npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/database.types.ts
 *
 * The relational shape (technology-stack.md §3.7):
 * customers → items → drawing_revisions → (dimension_rows | coating_specs)
 *   → batches → readings → sign-offs
 */
export type Json = Record<string, unknown> | string | number | boolean | null;

export type BatchStatus = "DRAFT" | "SUBMITTED" | "REJECTED" | "APPROVED";

export interface Database {
  public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      batch_status: BatchStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
