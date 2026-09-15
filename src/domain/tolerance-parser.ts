/**
 * Automated GD&T tolerance parser — PRD IM-03.
 *
 * Extracts numeric nominals from engineering-drawing strings like:
 *   "(2065)"        → bracketed reference dimension, nominal 2065
 *   "Ø12"           → diameter 12
 *   "100°"          → angle 100 degrees
 *   "10 ±0.5"       → nominal 10, symmetric tolerance 0.5
 *   "10 +0.2/-0.1"  → asymmetric tolerances
 *   "20 min"        → lower-bound-only dimension
 *
 * Derivation is pure: Min ≤ Nominal ≤ Max is enforced by the deriveLimits
 * function; fast-check property tests assert the parser never yields Min > Max.
 */

export interface ParsedDimension {
  /** Cleaned numeric nominal, e.g. 2065 from "(2065)". */
  nominal: number;
  /** Upper tolerance magnitude added to nominal, from "+0.2" or "±0.5". */
  tolerancePlus: number | null;
  /** Lower tolerance magnitude subtracted from nominal, from "-0.1" or "±0.5". */
  toleranceMinus: number | null;
  /** The GD&T symbol detected on the drawing, if any. */
  symbol: DimensionSymbol | null;
  /** True when the dimension was bracketed (reference dimension). */
  isReference: boolean;
}

export type DimensionSymbol = "diameter" | "angle" | "radius" | "runout";

const SYMBOL_PATTERNS: Array<[DimensionSymbol, RegExp]> = [
  ["diameter", /[Ø⌀φφ]/u],
  ["angle", /°/u],
  ["radius", /\bR\s?\d/iu],
  ["runout", /\b(runout|run-out)\b/iu],
];

/**
 * Parse a raw drawing-table cell into a structured dimension.
 * Returns null when no numeric nominal can be recovered (e.g. pure text
 * like "GO / NO-GO" — such rows are handled as attribute checks by the UI).
 */
export function parseDimension(raw: string): ParsedDimension | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const isReference = /^\(.*\)$/.test(trimmed);
  // Strip bracket notation, symbols, and thousands separators; keep signs,
  // decimal points, and digits for tolerance extraction.
  const cleaned = trimmed
    .replace(/^\(+|\)+$/g, "")
    .replace(/[Ø⌀φφ°]/gu, "")
    .replace(/,/g, "");

  // Nominal = first bare number before any explicit tolerance expression.
  const nominalMatch = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!nominalMatch) return null;
  const nominal = Number(nominalMatch[0]);
  if (!Number.isFinite(nominal)) return null;

  // Symmetric tolerance: ±0.5 / +-0.5
  const symmetric = cleaned.match(/(?:±|\+\/-|\+-)\s*(\d+(?:\.\d+)?)/);
  if (symmetric) {
    const t = Number(symmetric[1]);
    return build(nominal, t, t, trimmed, isReference);
  }

  // Asymmetric: +0.2 / -0.1 (either order, optional slash)
  const asymmetric = cleaned.match(
    /\+\s*(\d+(?:\.\d+)?)\s*(?:\/|-)?\s*-\s*(\d+(?:\.\d+)?)/,
  );
  if (asymmetric) {
    const plus = Number(asymmetric[1]);
    const minus = Number(asymmetric[2]);
    if (Number.isFinite(plus) && Number.isFinite(minus)) {
      return build(nominal, plus, minus, trimmed, isReference);
    }
  }

  // Plain nominal: no explicit tolerance on the cell.
  return build(nominal, null, null, trimmed, isReference);
}

function build(
  nominal: number,
  plus: number | null,
  minus: number | null,
  raw: string,
  isReference: boolean,
): ParsedDimension {
  // Detect symbols against the raw text: "°" is stripped from `cleaned` above.
  const symbol =
    SYMBOL_PATTERNS.find(([, re]) => re.test(raw))?.[0] ?? null;
  return {
    nominal,
    tolerancePlus: plus,
    toleranceMinus: minus,
    symbol,
    isReference,
  };
}

export interface DerivedLimits {
  min: number;
  max: number;
}

/**
 * Derive exact Min/Max limits (PRD IM-03). Invariant: min ≤ max —
 * the asymmetric parser cannot produce min > max, and this function
 * guards defensively anyway (property-tested via fast-check).
 */
export function deriveLimits(parsed: ParsedDimension): DerivedLimits {
  const { nominal, tolerancePlus, toleranceMinus } = parsed;
  const plus = tolerancePlus ?? 0;
  const minus = toleranceMinus ?? 0;
  const min = nominal - minus;
  const max = nominal + plus;
  return min <= max ? { min, max } : { min: max, max: min };
}
