import { reportFileName } from "@/lib/api/review";
import type { ReportData } from "@/lib/api/review";
import { FORMAT_META } from "@/lib/print";
import type { FormatMeta } from "@/lib/print";

/**
 * Report metadata helpers (Phase 6) — live outside the component tree so the
 * sheet files stay component-only (react-refresh) and these stay unit-
 * testable.
 */

/** QMS file name for a report (report-export-spec §7) — also the title stamp. */
export function fileNameFor(data: ReportData): string {
  return reportFileName(
    data.workflow === "DIMENSIONAL" ? "ST/QC/02" : "ST/QC/04",
    data.header.itemCode,
    data.header.deliveryBatchCode,
    data.header.inspectionDate,
  );
}

export function formatMetaFor(data: ReportData): FormatMeta {
  return FORMAT_META[data.workflow === "DIMENSIONAL" ? "ST/QC/02" : "ST/QC/04"];
}

export function sheetTitle(data: ReportData): string {
  return data.workflow === "DIMENSIONAL"
    ? "Dimensional Inspection Report"
    : "Surface Preparation & Protective Coating Report";
}
