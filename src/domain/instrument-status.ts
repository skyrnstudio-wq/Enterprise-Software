/**
 * Equipment status engine (PRD EQ-02) — pure, timezone-explicit date math.
 *
 * Boundary decisions (execution-plan.md edge cases 2.10–2.12), pinned by tests:
 * - `nextDue === today` ⇒ EXPIRED (expires at 00:00 local time of the due date).
 * - Status is computed from **calendar dates**, never timestamps — no DST/TZ
 *   drift for a shop in one timezone; callers pass ISO `YYYY-MM-DD` strings.
 * - The 15-day amber window is pure date arithmetic (property-tested across
 *   month/year boundaries — edge 2.12).
 * - `nextDueAt` clamps month-end overflow (Jan 31 + 1 mo ⇒ Feb 28), because a
 *   calibration anniversary can never silently skip into the next month.
 */

export type InstrumentStatus = "ACTIVE" | "DUE_SOON" | "EXPIRED";

/** Amber window: instruments within this many days of expiry surface in alerts (A4). */
export const DUE_SOON_WINDOW_DAYS = 15;

const MS_PER_DAY = 86_400_000;

/** Parse `YYYY-MM-DD` as a UTC-midnight date — deterministic, DST-free. */
function toUtcDate(iso: string): Date {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is past). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcDate(toIso).getTime() - toUtcDate(fromIso).getTime()) / MS_PER_DAY);
}

/**
 * Next calibration due date: the anniversary of `lastCalIso` after
 * `intervalMonths`, clamped to the target month's length.
 */
export function nextDueAt(lastCalIso: string, intervalMonths: number): string {
  const [y = 0, m = 1, d = 1] = lastCalIso.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + intervalMonths;
  const ny = Math.floor(totalMonths / 12);
  const nm = totalMonths % 12; // 0-based target month
  const daysInTargetMonth = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, daysInTargetMonth);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(ny, 4)}-${pad(nm + 1)}-${pad(nd)}`;
}

/**
 * EQ-02 status. Pure function of two calendar dates:
 *   days ≤ 0            → EXPIRED  (due date reached at 00:00 — edge 2.11)
 *   days ≤ 15           → DUE_SOON (amber strip + A4 dashboard alert)
 *   otherwise           → ACTIVE
 */
export function instrumentStatus(todayIso: string, nextDueIso: string): InstrumentStatus {
  const days = daysBetween(todayIso, nextDueIso);
  if (days <= 0) return "EXPIRED";
  if (days <= DUE_SOON_WINDOW_DAYS) return "DUE_SOON";
  return "ACTIVE";
}
