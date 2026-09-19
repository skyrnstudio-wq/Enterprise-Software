import { describe, expect, it } from "vitest";
import { FORMAT_META } from "../print";

/**
 * Controlled-format metadata (report-export-spec §2) — the letterhead and
 * footer print these verbatim; a wrong value here prints on every QMS
 * document the client issues, so they are pinned.
 */
describe("FORMAT_META — controlled format blocks", () => {
  it("matches the audited ST/QC/02 Rev 02 issue date", () => {
    expect(FORMAT_META["ST/QC/02"]).toEqual({
      format: "ST/QC/02",
      rev: "Rev 02",
      issueDate: "01-09-23",
      governedBy: "ISO 9001 QMS",
    });
  });

  it("matches the ST/QC/04 Rev 01 block (no audited issue date — P-06)", () => {
    // The source workbook has no date of release, so the block prints
    // "Not stated" — mirrors the original instead of inventing a date.
    expect(FORMAT_META["ST/QC/04"]).toEqual({
      format: "ST/QC/04",
      rev: "Rev 01",
      issueDate: "Not stated",
      governedBy: "ISO 12944 / 8501 · NACE",
    });
  });
});
