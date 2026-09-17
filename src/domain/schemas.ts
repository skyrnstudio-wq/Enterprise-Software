/**
 * Zod schemas — the single source of truth for validation
 * (technology-stack.md §3.3). The same shapes validate client input,
 * mirror Postgres constraints, and generate Playwright fixtures.
 */
import { z } from "zod";

/** Batch header metadata (PRD DIM-02). */
export const batchHeaderSchema = z.object({
  poNumber: z.string().min(1, "PO Number is required"),
  deliveryBatchCode: z.string().regex(/^\d{4}-\d{2}$/, "Expected format: 2604-02 (YYMM-lot)"),
  inspectionDate: z.iso.date(),
  lotQuantity: z.number().int().positive(),
});
export type BatchHeader = z.infer<typeof batchHeaderSchema>;

/** Psychrometric inputs (PRD COAT-03) — bounds enforced at the UI boundary. */
export const psychrometricSchema = z.object({
  ambientTempC: z.number().min(-45).max(60),
  relativeHumidity: z.number().min(1).max(100),
  steelTempC: z.number().min(-45).max(60),
  /**
   * Client-claimed dew point / ΔT for display and the local lock-out gate.
   * The submit RPC recomputes both server-side and never trusts these
   * (backend-architecture.md §5.1) — they are transported for audit
   * comparison only.
   */
  dewPointC: z.number().optional(),
  deltaTC: z.number().optional(),
});
export type PsychrometricInput = z.infer<typeof psychrometricSchema>;

/** Dimensional sample reading for one row (PRD DIM-03). */
export const dimensionReadingSchema = z.object({
  rowSerial: z.number().int().positive(),
  instrumentId: z.string().min(1, "Instrument is required"),
  samples: z
    .array(z.number().nullable())
    .length(5)
    .refine(
      (arr) => arr.every((v) => v === null || Number.isFinite(v)),
      "Sample values must be finite numbers",
    ),
});

/** Instrument registry entry (PRD EQ-01). */
export const instrumentSchema = z.object({
  instrumentId: z.string().min(1),
  description: z.string().min(1),
  makeModel: z.string().min(1),
  range: z.string().min(1),
  lastCalibrationDate: z.iso.date(),
  /** Calibration interval in months. */
  intervalMonths: z.number().int().min(1).max(60),
});
export type Instrument = z.infer<typeof instrumentSchema>;
