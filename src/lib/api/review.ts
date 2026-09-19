/**
 * QH review API — facade.
 *
 * Split into focused modules by concern (E2):
 * - `review-flags`  — flag computation (same engines the inspector used)
 * - `review-queue`  — worklist, review-detail fetchers, decisions, exports
 * - `report-data`   — controlled report contract + file naming
 *
 * Re-exported here so the ~12 existing import sites stay untouched.
 */
export * from "./review-flags";
export * from "./review-queue";
export * from "./report-data";
