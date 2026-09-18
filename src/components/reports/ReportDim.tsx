import { FORMAT_META } from "@/lib/print";
import { sheetTitle } from "@/lib/report-meta";
import { rowStatus } from "@/domain/grid-model";
import type { RowStatus } from "@/domain/grid-model";
import { evaluateTolerance } from "@/domain/measurement";
import type { ReportData, ReportDimRow } from "@/lib/api/review";
import {
  ReportFooter,
  ReportHeaderFields,
  ReportLetterhead,
  ReportRejectionComments,
  ReportSignOffs,
} from "./ReportSheet";

/**
 * ST/QC/02 — Dimensional Inspection Report (report-export-spec §3).
 * Prints from the same evaluation engines as the review screen: row verdict
 * via `rowStatus`, per-sample treatment via `evaluateTolerance` — the printed
 * ✓/!/✗ is the exact record the QH reviewed.
 *
 * Edges: 6.1 (thead repeats, rows never split), 6.2 (labels wrap between
 * tokens), 6.3 (sign-off never orphaned), 6.5 (glyph + border survive B/W).
 */

/** 6.2: label tokens wrap BETWEEN tokens, never inside a symbol+value pair. */
function LabelTokens({ row }: { row: ReportDimRow }): React.ReactElement {
  return (
    <span className="print-label">
      {row.label.split(" ").map((tok, i) => (
        <span key={i} className="tok">
          {tok}
          {" "}
        </span>
      ))}
    </span>
  );
}

const GLYPH: Record<RowStatus, string> = {
  pass: "✓",
  warn: "!",
  fail: "✗",
  empty: "—",
  mixed: "—",
  incomplete: "—",
};

/** Per-sample treatment — mirrors the cell chips the inspector saw. */
function sampleStatus(value: number | null, nominal: number, tolPlus: number, tolMinus: number): RowStatus | "empty" {
  if (value === null) return "empty";
  return evaluateTolerance(value, nominal - tolMinus, nominal + tolPlus);
}

export function ReportDim({
  data,
  auditRef = null,
}: {
  data: Extract<ReportData, { workflow: "DIMENSIONAL" }>;
  auditRef?: string | null;
}): React.ReactElement {
  const meta = FORMAT_META["ST/QC/02"];
  return (
    <article
      id="print-preview"
      className="print-sheet mx-auto max-w-[210mm] bg-white px-[14mm] py-[10mm] shadow-lg print:shadow-none"
    >
      <ReportLetterhead meta={meta} />
      <h1 className="mt-4 text-center text-[12pt] font-semibold uppercase tracking-[0.08em]">
        {sheetTitle(data)}
      </h1>
      <ReportHeaderFields header={data.header} title="Batch details" />

      <div className="print-keep mt-4">
        <div className="print-section-title">Measurement record</div>
      </div>
      <table className="print-repeat w-full">
        <thead>
          <tr>
            <th className="w-[5%]">Sr.</th>
            <th className="w-[22%]">Parameter</th>
            <th className="w-[15%]">Nominal ± tol</th>
            <th className="w-[11%]">Equipment</th>
            <th className="w-[8%]">01</th>
            <th className="w-[8%]">02</th>
            <th className="w-[8%]">03</th>
            <th className="w-[8%]">04</th>
            <th className="w-[8%]">05</th>
            <th className="w-[7%]">Result</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const status = rowStatus(r.values, r.nominal, r.tolPlus, r.tolMinus);
            return (
              <tr key={r.serial}>
                <td className="measurement">{String(r.serial)}</td>
                <td>
                  <LabelTokens row={r} />
                  {r.isReference ? <span className="text-ink-500"> (ref)</span> : null}
                </td>
                <td className="measurement">
                  {r.symbol !== null ? `${r.symbol} ` : ""}
                  {String(r.nominal)} ±{String(r.tolPlus)}/{String(r.tolMinus)}
                </td>
                <td className="measurement">{r.instrumentCode ?? "—"}</td>
                {r.values.slice(0, 5).map((v, i) => {
                  const st = sampleStatus(v, r.nominal, r.tolPlus, r.tolMinus);
                  return (
                    <td
                      key={i}
                      className={`measurement print-chip ${
                        st === "fail"
                          ? "bg-status-fail-bg text-status-fail-fg"
                          : st === "warn"
                            ? "bg-status-warn-bg text-status-warn-fg"
                            : ""
                      }`}
                    >
                      {v === null ? "—" : String(v)}
                    </td>
                  );
                })}
                <td className="measurement print-chip">
                  {status === "pass" || status === "warn" || status === "fail"
                    ? GLYPH[status]
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[8pt] text-ink-500">
        ✓ within tolerance · ! within 10 % of a limit · ✗ out of tolerance. Tolerance verdicts
        recomputed from recorded values (ST/QC/02 Rev {meta.rev.replace("Rev ", "")}).
      </p>

      <ReportRejectionComments signOffs={data.signOffs} />
      <ReportSignOffs signOffs={data.signOffs} />
      <ReportFooter data={data} auditRef={auditRef} />
    </article>
  );
}
