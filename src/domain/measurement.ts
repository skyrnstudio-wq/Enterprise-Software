/**
 * Branded measurement types — technology-stack.md §3.1.
 * Mixing an OD in mm with a DFT in µm is a compile-time impossibility.
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Millimetres — linear dimensions. */
export type Millimetre = Brand<number, "mm">;
/** Microns — surface profile, WFT/DFT. */
export type Micron = Brand<number, "µm">;
/** Degrees Celsius — ambient, steel, dew point temperatures. */
export type Celsius = Brand<number, "°C">;
/** Relative humidity, percent. */
export type PercentRH = Brand<number, "%RH">;
/** Degrees — angular dimensions. */
export type Degree = Brand<number, "°">;

export const mm = (n: number): Millimetre => n as Millimetre;
export const micron = (n: number): Micron => n as Micron;
export const celsius = (n: number): Celsius => n as Celsius;
export const percentRH = (n: number): PercentRH => n as PercentRH;
export const degree = (n: number): Degree => n as Degree;

/** Tolerance status of a measured value against its limits (PRD DIM-04). */
export type ToleranceStatus = "pass" | "warn" | "fail";

/**
 * Pure tolerance evaluation — runs inside the grid cell renderer as a
 * function of (value, min, max) with no component state (technology-stack §3.2).
 * Amber = within 10% of either tolerance edge ("Approaching Limit").
 */
export function evaluateTolerance(
  value: number,
  min: number,
  max: number,
): ToleranceStatus {
  if (value < min || value > max) return "fail";
  const band = (max - min) * 0.1;
  if (band > 0 && (value - min < band || max - value < band)) return "warn";
  return "pass";
}
