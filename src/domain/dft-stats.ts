/**
 * Automated DFT Statistical Engine — PRD COAT-06.
 *
 * Real-time Min / Max / Average / Standard Deviation and ISO 19840
 * (80/200 rule) compliance over the 26-point DFT grid — replacing the
 * client's 26 hidden shadow columns (AK24:BJ27) with pure functions.
 */

export interface DftStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  /** Population standard deviation over all entered readings. */
  stdDev: number;
  /** Readings below 80% of nominal (ISO 19840 "80" rule). */
  belowCount: number;
  /** Readings above 200% of nominal (ISO 19840 "200" rule). */
  aboveCount: number;
}

export type Iso19840Compliance =
  | { compliant: true }
  | {
      compliant: false;
      reason: "below-80" | "above-200" | "insufficient-readings";
    };

/** ISO 19840 requires the mean of at least 5 readings per inspection area. */
export const ISO_19840_MIN_READINGS = 5;

/**
 * Compute live DFT statistics from the entered readings only —
 * empty points are skipped, never treated as zero.
 */
export function computeDftStats(
  readings: Array<number | null>,
  nominal: number,
): DftStats {
  const entered = readings.filter((r): r is number => r !== null && Number.isFinite(r));

  if (entered.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
      belowCount: 0,
      aboveCount: 0,
    };
  }

  const min = Math.min(...entered);
  const max = Math.max(...entered);
  const mean = entered.reduce((sum, v) => sum + v, 0) / entered.length;
  const variance =
    entered.reduce((sum, v) => sum + (v - mean) ** 2, 0) / entered.length;
  const stdDev = Math.sqrt(variance);

  const belowCount = entered.filter((v) => v < 0.8 * nominal).length;
  const aboveCount = entered.filter((v) => v > 2 * nominal).length;

  return { count: entered.length, min, max, mean, stdDev, belowCount, aboveCount };
}

/**
 * ISO 19840 (80/200 rule) verification: no reading below 80% of nominal,
 * no reading above 200% of nominal, and at least 5 readings present.
 */
export function evaluateIso19840(stats: DftStats): Iso19840Compliance {
  if (stats.count < ISO_19840_MIN_READINGS) {
    return { compliant: false, reason: "insufficient-readings" };
  }
  if (stats.belowCount > 0) return { compliant: false, reason: "below-80" };
  if (stats.aboveCount > 0) return { compliant: false, reason: "above-200" };
  return { compliant: true };
}
