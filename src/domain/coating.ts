/**
 * Coating verdict layer — execution-plan.md Phase 4 steps 2–8, edge cases
 * 4.1–4.18. Pure functions: no React, no DB. Every gate here has a matching
 * server-side check in the submit RPC (client gates = UX; server = truth,
 * backend-architecture.md §5.1).
 */
import { evaluateDeltaT, MIN_DELTA_T_C } from "./dew-point";
import { evaluateTolerance } from "./measurement";
import type { Celsius, PercentRH } from "./measurement";
import { psychrometricSchema } from "./schemas";

// ---------------------------------------------------------------------------
// Shelf-life engine (step 7, edge 4.14) — calendar-date arithmetic, never
// timestamps, mirroring the instrument-status boundary discipline.
// ---------------------------------------------------------------------------

export type ShelfLifeStatus =
  | { state: "ok" }
  | { state: "expiring"; /** Days until expiry (0 = expires today, 4.14). */ daysLeft: number }
  | { state: "expired" }
  | { state: "unknown" }; // mfg date absent — chip renders dimmed, not a block

/** Amber window: warn when the product expires within this many days. */
export const SHELF_LIFE_AMBER_DAYS = 30;

/**
 * Shelf-life from the manufacturing date and the product's interval.
 * `mfgDate`/`today` are ISO `YYYY-MM-DD`; expiry = mfg + interval, so
 * `expires === today` ⇒ `expiring` with daysLeft 0 (▲ expires today, 4.14)
 * and anything past is a hard block (COAT-04).
 */
export function shelfLifeStatus(
  mfgDate: string | null,
  intervalMonths: number,
  today: string,
): ShelfLifeStatus {
  if (mfgDate === null || mfgDate === "") return { state: "unknown" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mfgDate);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (m === null || t === null) return { state: "unknown" };

  const expiryUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1 + intervalMonths, Number(m[3]));
  const todayUtc = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
  const daysLeft = Math.round((expiryUtc - todayUtc) / 86_400_000);

  if (daysLeft < 0) return { state: "expired" };
  if (daysLeft <= SHELF_LIFE_AMBER_DAYS) return { state: "expiring", daysLeft };
  return { state: "ok" };
}

/** Expired product hard-blocks coat-log entry (COAT-04 / edge 4.14). */
export function shelfLifeBlocks(status: ShelfLifeStatus): boolean {
  return status.state === "expired";
}

// ---------------------------------------------------------------------------
// Range verdicts (steps 2/4) — all reuse evaluateTolerance so the band
// semantics (at-limit = warn, §4.3 10 % band) stay identical everywhere.
// ---------------------------------------------------------------------------

/** Surface-profile working range (COAT-02: Medium / 45–75 µm via comparator G). */
export const PROFILE_UM_MIN = 45;
export const PROFILE_UM_MAX = 75;
/** WFT working range (COAT-04: 80–100 µm; edge 4.15 — no unit conversion). */
export const WFT_UM_MIN = 80;
export const WFT_UM_MAX = 100;

/**
 * Blast-profile verdict. Positive-only mask: a negative profile is
 * physically impossible and rejected at the input boundary (edge 4.10).
 */
export function evaluateProfileUm(value: number): "pass" | "warn" | "fail" {
  if (value < 0) return "fail";
  return evaluateTolerance(value, PROFILE_UM_MIN, PROFILE_UM_MAX);
}

/** WFT verdict — mils readings simply land out-of-range and warn (4.15). */
export function evaluateWftUm(value: number): "pass" | "warn" | "fail" {
  if (value < 0) return "fail";
  return evaluateTolerance(value, WFT_UM_MIN, WFT_UM_MAX);
}

// ---------------------------------------------------------------------------
// Psychrometric lock-out gate (step 3, COAT-03) — the client mirror of the
// submit RPC's hard lock. Trips on EITHER clause (edge 4.4); both clauses
// use strict inequalities, pinned at the boundaries by tests.
// ---------------------------------------------------------------------------

/** %RH ceiling: application is prohibited when RH > 85 % (edge 4.4). */
export const MAX_RH_PERCENT = 85;

export type PsychroVerdict =
  | { locked: false; deltaT: number }
  | {
      locked: true;
      deltaT: number;
      reason: "delta-t" | "rh" | "invalid-input";
      /** Operator-facing margin copy (edge 4.2). */
      message: string;
    };

/**
 * Evaluate the lock-out gate. `ΔT < 3.0 °C` OR `RH > 85 %` ⇒ locked.
 * Edge 4.3: when steel is colder than ambient with RH near 100, ΔT goes
 * negative — the message names condensation present, not just the margin.
 */
export function evaluatePsychroGate(
  steelTempC: number,
  ambientTempC: number,
  rhPercent: number,
): PsychroVerdict {
  const parsed = psychrometricSchema.safeParse({
    steelTempC,
    ambientTempC,
    relativeHumidity: rhPercent,
  });
  if (!parsed.success) {
    return {
      locked: true,
      deltaT: Number.NaN,
      reason: "invalid-input",
      message: "Conditions out of physical range (−45…60 °C, 1–100 %RH).",
    };
  }

  const verdict = evaluateDeltaT(
    parsed.data.steelTempC as Celsius,
    parsed.data.ambientTempC as Celsius,
    parsed.data.relativeHumidity as PercentRH,
  );
  if (!verdict.compliant && verdict.reason === "invalid-input") {
    return {
      locked: true,
      deltaT: Number.NaN,
      reason: "invalid-input",
      message: "Conditions out of physical range.",
    };
  }

  const deltaT = verdict.deltaT as number;

  if (deltaT < MIN_DELTA_T_C) {
    const message =
      deltaT < 0
        ? `Condensation present: steel ${Math.abs(deltaT).toFixed(1)} °C below dew point — application prohibited.`
        : deltaT === 0
          ? "Steel at dew point — condensation risk, application prohibited."
          : `Steel is ${(MIN_DELTA_T_C - deltaT).toFixed(2)} °C below the required 3.0 °C margin — application prohibited.`;
    return { locked: true, deltaT, reason: "delta-t", message };
  }

  if (parsed.data.relativeHumidity > MAX_RH_PERCENT) {
    return {
      locked: true,
      deltaT,
      reason: "rh",
      message: `Humidity ${parsed.data.relativeHumidity.toFixed(1)} %RH exceeds the 85 % application ceiling — application prohibited.`,
    };
  }

  return { locked: false, deltaT };
}

// ---------------------------------------------------------------------------
// Numeric input mask (edge 4.16) — same normalization family as the
// dimensional 3.3 grammar, extended with a leading sign for psychrometrics.
// ---------------------------------------------------------------------------

/**
 * Accepts `12,5` and `12.5` (comma decimals, 4.16), an optional leading
 * `+`/`-` (steel colder than ambient is real, 4.6), and nothing else.
 * Returns null for empty/partial input ("", "-", "12,").
 */
export function parseCoatingNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === "+" || normalized === ".")
    return null;
  if (!/^[+-]?(\d+\.\d+|\d+|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Submission checklist (Phase 3 pattern applied to coating, edges 4.11/4.18).
// ---------------------------------------------------------------------------

export interface CoatingChecklistInput {
  surfacePrepComplete: boolean;
  conditionsEntered: boolean;
  psychroLocked: boolean;
  /** Coat logs with complete mandatory fields (product + part A batch). */
  coatsComplete: boolean;
  /** Entered point count per side (INSIDE / OUTSIDE). */
  dftCounts: { INSIDE: number; OUTSIDE: number };
  /** Edge 4.11: operator acknowledgment for submitting on a partial grid. */
  partialDftAcknowledged: boolean;
  visualChecksComplete: boolean;
}

export interface CoatingChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** Hard gates block submit; warnings only surface to QH as flags. */
  kind: "gate" | "warning";
}

/**
 * Edge 4.11: ISO 19840 needs ≥ 5 readings per area to form a verdict — a
 * side below 5 BLOCKS submit; 5–25/26 is submittable only with the operator
 * acknowledgment, and QH sees the incompleteness flag either way.
 */
export function coatingSubmissionChecklist(input: CoatingChecklistInput): CoatingChecklistItem[] {
  const inside = input.dftCounts.INSIDE;
  const outside = input.dftCounts.OUTSIDE;
  const insideOk = inside >= 5;
  const outsideOk = outside >= 5;
  const anyPartial = inside < 26 || outside < 26;

  const warning = (id: string, n: number, side: string): CoatingChecklistItem | null =>
    n > 0 && n < 26
      ? {
          id,
          label: `▲ ${side} grid: ${String(n)}/26 entered — incomplete; QH will see this flag`,
          done: false,
          kind: "warning",
        }
      : null;

  return [
    {
      id: "surface-prep",
      label: "Surface preparation recorded",
      done: input.surfacePrepComplete,
      kind: "gate",
    },
    {
      id: "conditions",
      label: "Psychrometric conditions entered",
      done: input.conditionsEntered,
      kind: "gate",
    },
    {
      id: "lock-out",
      label: "Application conditions compliant (ΔT ≥ 3.0 °C, RH ≤ 85 %)",
      done: !input.psychroLocked,
      kind: "gate",
    },
    {
      id: "coats",
      label: "Paint batch log complete for each coat",
      done: input.coatsComplete,
      kind: "gate",
    },
    {
      id: "dft-inside",
      label: `Inside grid: ≥ 5 readings for an ISO 19840 verdict (${String(inside)}/26)`,
      done: insideOk,
      kind: "gate",
    },
    {
      id: "dft-outside",
      label: `Outside grid: ≥ 5 readings for an ISO 19840 verdict (${String(outside)}/26)`,
      done: outsideOk,
      kind: "gate",
    },
    ...(anyPartial
      ? [
          {
            id: "dft-ack",
            label: "Operator acknowledged the partial DFT grids",
            done: input.partialDftAcknowledged,
            kind: "gate" as const,
          },
        ]
      : []),
    {
      id: "visual",
      label: "Visual inspection — all five checks answered",
      done: input.visualChecksComplete,
      kind: "gate",
    },
    ...[
      warning("dft-inside-flag", inside, "Inside"),
      warning("dft-outside-flag", outside, "Outside"),
    ].filter((w): w is CoatingChecklistItem => w !== null),
  ];
}

/** Submit is allowed only when every gate item is done; warnings never block. */
export function canSubmitCoating(items: CoatingChecklistItem[]): boolean {
  return items.every((i) => i.kind === "warning" || i.done);
}
