import { useEffect, useState } from "react";

/**
 * Print-mode primitives — execution-plan.md Phase 6 steps 1–3 +
 * report-export-spec §1/§5.
 *
 * The two controlled QMS formats print from the SAME components as the
 * review screens; these hooks are the print-only branch plumbing:
 * - `usePrintMode`  — true while the browser print pipeline is active
 *   (beforeprint/afterprint + the `print` media query, so Ctrl+P and the
 *   Export button behave identically).
 * - `usePrintGuard` — report-export-spec §1: "a printed report must be
 *   indistinguishable from the audited originals". Printing anything that is
 *   NOT a report route would produce an uncontrolled document — the guard
 *   lets the app shell swap to a blocking notice instead (edge: Ctrl+P on a
 *   random screen prints garbage).
 * - `printSheet`    — the explicit-button path (spec §5: `window.print()`
 *   invoked from an explicit button, never ambient). Stamps the document
 *   title with the QMS file name (§7) and raises `data-printing` on <html>
 *   BEFORE the print pipeline snapshots, so the print-CSS layer (which is
 *   gated on that attribute) is guaranteed present even if the
 *   beforeprint → React commit race loses.
 */

/** True while a print dialog/pipeline is active for this window. */
export function usePrintMode(): boolean {
  const [printing, setPrinting] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia("print").matches,
  );

  useEffect(() => {
    const onBefore = (): void => {
      setPrinting(true);
    };
    const onAfter = (): void => {
      setPrinting(false);
    };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);

    // Safari/older engines don't always fire beforeprint — watch the media
    // query too; whichever fires first wins (state is idempotent).
    const mq = window.matchMedia("print");
    const onMq = (e: MediaQueryListEvent): void => {
      setPrinting(e.matches);
    };
    mq.addEventListener("change", onMq);
    setPrinting(mq.matches);

    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  return printing;
}

/**
 * Print guard signal: true when a print pipeline is active but the current
 * view is NOT a controlled report — the shell must swap to the blocking
 * notice (report-export-spec §1: only the report layouts may print).
 */
export function usePrintGuard(isReportRoute: boolean): boolean {
  const printing = usePrintMode();
  return printing && !isReportRoute;
}

/** Wait two frames — React commits the print-only branches (inputs → text). */
function nextPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    } else {
      setTimeout(resolve, 50);
    }
  });
}

/**
 * Print the current report view as a controlled document.
 * - Document title becomes the QMS file name → the browser's "Save as PDF"
 *   suggests exactly `reportFileName()` (spec §7) with zero dependencies.
 * - `data-printing` is set synchronously so the print stylesheet is active
 *   for the snapshot; removed after the dialog closes (Chrome's
 *   `window.print()` blocks until then; Safari fires `afterprint`).
 */
export async function printSheet(fileName: string): Promise<void> {
  const previousTitle = document.title;
  document.title = fileName;
  document.documentElement.setAttribute("data-printing", "");
  await nextPaint();
  window.print();
  document.documentElement.removeAttribute("data-printing");
  document.title = previousTitle;
}

// ---------------------------------------------------------------------------
// Controlled-format metadata (report-export-spec §2/§3/§4) — the letterhead
// format block and the footer print these verbatim; they are the QMS
// identity of each document, so they live in exactly one place.
// ---------------------------------------------------------------------------

export type ReportFormat = "ST/QC/02" | "ST/QC/04";

export interface FormatMeta {
  /** Format number as printed, e.g. `ST/QC/02`. */
  format: ReportFormat;
  /** Controlled revision, e.g. `Rev 02`. */
  rev: string;
  /** Issue date as printed on the audited original (`DD-MM-YY`). */
  issueDate: string;
  /** Governing standard line under the format block. */
  governedBy: string;
}

/** From the audited originals (workbook-audit-analysis.md §3). */
export const FORMAT_META: Record<ReportFormat, FormatMeta> = {
  "ST/QC/02": {
    format: "ST/QC/02",
    rev: "Rev 02",
    issueDate: "01-09-23",
    governedBy: "ISO 9001 QMS",
  },
  "ST/QC/04": {
    format: "ST/QC/04",
    rev: "Rev 01",
    // The audited Painting report.xlsx carries NO date of release (audit
    // finding P-06) — there is no value to copy. "Not stated" mirrors the
    // original honestly rather than inventing a date; the client QH may assign
    // a real release date at the fidelity session, which is a one-line change.
    issueDate: "Not stated",
    governedBy: "ISO 12944 / 8501 · NACE",
  },
};
