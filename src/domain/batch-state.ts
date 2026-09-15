/**
 * Batch state machine — mirrors application-flow.md.
 * The database trigger enforces the same transitions server-side
 * (technology-stack.md §3.7); this module drives UI gating.
 */

import type { BatchStatus } from "@/lib/supabase/database.types";

export type BatchTransition =
  | "submit" // DRAFT → SUBMITTED (Inspector)
  | "reject" // SUBMITTED → DRAFT (QH, with mandatory comments)
  | "approve" // SUBMITTED → APPROVED (QH, immutable lock)
  | "revise"; // REJECTED → DRAFT (Inspector rework)

const ALLOWED: Record<BatchStatus, Partial<Record<BatchTransition, BatchStatus>>> = {
  DRAFT: { submit: "SUBMITTED" },
  SUBMITTED: { reject: "DRAFT", approve: "APPROVED" },
  REJECTED: { revise: "DRAFT" },
  // SO-04: approved batches are immutable — no transitions exist.
  APPROVED: {},
};

export function canTransition(from: BatchStatus, via: BatchTransition): boolean {
  return ALLOWED[from][via] !== undefined;
}

export function nextStatus(from: BatchStatus, via: BatchTransition): BatchStatus | null {
  return ALLOWED[from][via] ?? null;
}
