/**
 * Automated Psychrometric Dew Point Engine — PRD COAT-03.
 *
 * Magnus-Tetens formula (valid for −45 °C ≤ T ≤ 60 °C, the full shop-floor
 * envelope). The same transform is re-implemented in the submission RPC on
 * the server (technology-stack.md §3.7: client-claimed statistics are never
 * trusted).
 */
import type { Celsius, PercentRH } from "./measurement";

const A = 17.62;
const B = 243.12; // °C — Magnus-Tetens constants (sonntag1990 variant)

/** Saturation vapour pressure helper γ(T, RH). */
function gamma(tempC: number, rhPercent: number): number {
  return Math.log((rhPercent / 100) * Math.exp(A * tempC / (B + tempC)));
}

/**
 * True dew point via Magnus-Tetens.
 * Returns null for physically impossible inputs (RH ≤ 0 or > 100) —
 * the Zod schema in the coating feature enforces the same bounds at the UI.
 */
export function dewPoint(
  ambient: Celsius,
  rh: PercentRH,
): Celsius | null {
  const t = ambient as number;
  const rhPct = rh as number;
  if (rhPct <= 0 || rhPct > 100) return null;
  if (!Number.isFinite(t)) return null;

  const g = gamma(t, rhPct);
  const td = (B * g) / (A - g);
  return td as Celsius;
}

/**
 * ISO 12944-7 / NACE safety margin: ΔT = T_steel − T_dew.
 * Compliance gate: application is PROHIBITED when ΔT < 3.0 °C.
 */
export const MIN_DELTA_T_C = 3.0;

export type DeltaTCompliance =
  | { compliant: true; deltaT: Celsius }
  | { compliant: false; deltaT: Celsius; reason: "below-minimum" }
  | { compliant: false; reason: "invalid-input" };

export function evaluateDeltaT(
  steelTemp: Celsius,
  ambient: Celsius,
  rh: PercentRH,
): DeltaTCompliance {
  const td = dewPoint(ambient, rh);
  if (td === null) return { compliant: false, reason: "invalid-input" };

  const deltaT = ((steelTemp as number) - (td as number)) as Celsius;
  if (deltaT < MIN_DELTA_T_C) {
    return {
      compliant: false,
      deltaT,
      reason: "below-minimum",
    };
  }
  return { compliant: true, deltaT };
}
