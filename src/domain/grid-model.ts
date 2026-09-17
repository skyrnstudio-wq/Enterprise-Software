/**
 * Pure grid model — execution-plan.md Phase 3 steps 3/5/6/8 and edge cases
 * 3.1/3.2/3.3/3.6/3.8/3.15/3.16/3.17. No React, no DB: fully unit-testable.
 *
 * Evaluation semantics (pinned by tests):
 * - `null` samples are EMPTY; `0` is a VALUE (edge 3.17).
 * - Cell treatment = `evaluateTolerance` — at-limit is amber (the §4.3 10%
 *   band starts at the edge). The PASS verdict is a separate, looser
 *   comparison made server-side by `submit_batch` (strict 0.8×/2.0×, on-limit
 *   passes) — the cell shows the more conservative treatment.
 * - No unit auto-conversion (edge 3.1): out-of-range magnitudes simply colour.
 */

import { evaluateTolerance } from "./measurement";
import type { ToleranceStatus } from "./measurement";

// —————————————————————————————————————————————— Input mask (edges 3.2/3.3)

/**
 * Normalize a raw cell string to a finite number, or null when it must be
 * rejected at the mask level. Decimal commas map to dots (tablet keypads,
 * edge 3.3); scientific notation is rejected (edge 3.2 — `1e3`, `0x10`);
 * surrounding whitespace is tolerated. Returns null for non-numbers — the
 * caller distinguishes "empty" (blank string) from "invalid" separately.
 */
export function parseCellInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, ".");
  if (cleaned === "") return null;
  // Decimal-only: optional sign, digits with optional single fractional part.
  if (!/^[+-]?(\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Split a multi-value paste into up to 5 cell strings (edge 3.8). */
export function splitPaste(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .slice(0, 5);
}

// ——————————————————————————————————————————————————— Row status (DIM-04)

export type RowStatus = ToleranceStatus | "empty" | "mixed" | "incomplete";

/**
 * Row status = worst cell treatment of the ENTERED samples (DIM-04: fail >
 * warn > pass). `incomplete` when some (not all) samples are entered —
 * submission is gated but the inspector sees real feedback meanwhile.
 * `0` counts as a value; `null` is empty (edge 3.17).
 */
export function rowStatus(
  samples: (number | null)[],
  nominal: number,
  tolPlus: number,
  tolMinus: number,
): RowStatus {
  const entered = samples.filter((s) => s !== null);
  if (entered.length === 0) return "empty";
  const min = nominal - tolMinus;
  const max = nominal + tolPlus;
  const rank: Record<ToleranceStatus, number> = { pass: 0, warn: 1, fail: 2 };
  let worst: ToleranceStatus = "pass";
  for (const s of entered) {
    const st = evaluateTolerance(s, min, max);
    if (rank[st] > rank[worst]) worst = st;
  }
  if (entered.length < samples.length) return entered.length === 0 ? "empty" : "incomplete";
  return worst;
}

/**
 * Edge 3.16: five identical readings on a narrow band row are suspicious
 * (possible fill error) — a warning chip, never a block; QH decides.
 */
export function isSuspiciousUniformity(samples: (number | null)[], toleranceSpan: number): boolean {
  const entered = samples.filter((s) => s !== null);
  if (entered.length < 5 || toleranceSpan > 0.01) return false;
  const first = entered[0] as number;
  return entered.every((s) => s === first);
}

// ——————————————————————————————————————————————————— Quick-fill (DIM-05)

/**
 * Edge 3.6: Copy-01→05 is disabled while sample 01 is empty; when 01 carries
 * warn/fail the copy is ALLOWED (the row's status follows the copied value).
 */
export function canCopyFirstSample(samples: (number | null)[]): boolean {
  return samples[0] !== null && samples[0] !== undefined;
}

/**
 * Edge 3.7: Fill Nominal is allowed on reference dimensions — a reference is
 * still a real reading and the row stays evaluated.
 */
export function canFillNominal(_isReference: boolean): boolean {
  return true;
}

// ——————————————————————————————————————————————————— Keyboard model (DIM-03)

export type NavKey = "Tab" | "Shift+Tab" | "Enter" | "ArrowDown" | "ArrowRight" | "ArrowLeft";

export interface GridPos {
  row: number;
  sample: number;
}

/**
 * Focus navigation — Tab→right (wrapping to the next row), Enter/↓→down in
 * the same sample column, Shift+Tab/←→ left. Clamped at grid corners: focus
 * is NEVER lost (DIM-03). Pure so the keyboard model is pinned by unit tests
 * independent of the virtualizer (edge 3.18 tests both Enter and the
 * double-tap path — the component maps double-tap onto "Enter").
 */
export function moveFocus(pos: GridPos, key: NavKey, rowCount: number, samplesPerRow = 5): GridPos {
  const lastRow = rowCount - 1;
  const lastSample = samplesPerRow - 1;
  switch (key) {
    case "Tab":
    case "ArrowRight": {
      if (pos.sample < lastSample) return { row: pos.row, sample: pos.sample + 1 };
      if (pos.row < lastRow) return { row: pos.row + 1, sample: 0 };
      return pos; // bottom-right corner clamps — focus is never lost
    }
    case "Shift+Tab":
    case "ArrowLeft": {
      if (pos.sample > 0) return { row: pos.row, sample: pos.sample - 1 };
      if (pos.row > 0) return { row: pos.row - 1, sample: lastSample };
      return pos; // top-left corner clamps
    }
    case "Enter":
    case "ArrowDown":
      return { row: Math.min(pos.row + 1, lastRow), sample: pos.sample };
  }
}

// ——————————————————————————————————————————————————— Checklist (step 8)

export interface ChecklistRow {
  serial: number;
  /** Caller-computed via `rowStatus()` — the checklist does not re-evaluate. */
  status: RowStatus;
  instrumentId: string | null;
  instrumentExpired: boolean;
  /** Caller-computed via `isSuspiciousUniformity()`. */
  suspicious: boolean;
}

export interface ChecklistItem {
  kind: "block" | "warn";
  glyph: "✕" | "▲";
  message: string;
}

/**
 * The A5 submission checklist (ui-ux §6.6): blocks are hard gates —
 * incomplete rows (missing samples) and expired instruments (edge 3.15:
 * status computed at submit time, so expiry between entry and submit gates
 * here, not retroactively). Warnings inform but never block.
 */
export function submissionChecklist(
  rows: ChecklistRow[],
  isReference: (serial: number) => boolean,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const plural = (n: number) => (n === 1 ? "row" : "rows");

  const incomplete = rows.filter((r) => !isReference(r.serial) && r.status === "incomplete");
  if (incomplete.length > 0) {
    items.push({
      kind: "block",
      glyph: "✕",
      message: `${String(incomplete.length)} ${plural(incomplete.length)} missing samples`,
    });
  }

  const noInstrument = rows.filter((r) => !isReference(r.serial) && r.instrumentId === null);
  if (noInstrument.length > 0) {
    items.push({
      kind: "block",
      glyph: "✕",
      message: `${String(noInstrument.length)} ${plural(noInstrument.length)} missing instrument`,
    });
  }

  // Edge 3.15: expired instruments block submission at submit time.
  const expired = rows.filter((r) => r.instrumentId !== null && r.instrumentExpired);
  if (expired.length > 0) {
    items.push({
      kind: "block",
      glyph: "✕",
      message: `${String(expired.length)} ${plural(expired.length)} on an expired instrument`,
    });
  }

  const suspicious = rows.filter((r) => !isReference(r.serial) && r.suspicious);
  if (suspicious.length > 0) {
    items.push({
      kind: "warn",
      glyph: "▲",
      message: `${String(suspicious.length)} ${plural(suspicious.length)} with possible fill error (identical samples)`,
    });
  }

  const outOfBand = rows.filter(
    (r) => !isReference(r.serial) && (r.status === "warn" || r.status === "fail"),
  );
  if (outOfBand.length > 0) {
    items.push({
      kind: "warn",
      glyph: "▲",
      message: `${String(outOfBand.length)} ${plural(outOfBand.length)} near or beyond limits`,
    });
  }

  return items;
}
