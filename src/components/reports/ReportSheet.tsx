import type { ReactNode } from "react";
import { X } from "lucide-react";
import { SignOffBlock } from "@/components/ui/SignOffBlock";
import { Button } from "@/components/ui/Button";
import type { ReportData, ReportHeader, ReportSignOff } from "@/lib/api/review";
import { FORMAT_META } from "@/lib/print";
import type { FormatMeta } from "@/lib/print";

/**
 * Report sheet scaffold — report-export-spec §1/§3/§4 + execution-plan
 * Phase 6 steps 2/3. ONE component tree prints and previews both controlled
 * formats: the QH reviewing the screen and the auditor reading the paper see
 * the same layout (technology-stack §3.8 — the reviewed record and the
 * printed record can never diverge).
 *
 * The sheet is styled for print at all times (WYSIWYG); `data-print-hide`
 * marks the screen-only affordances (close/export) that the @media print
 * layer strips, and `data-report-actions` hides the overlay toolbar.
 */

export function ReportLetterhead({ meta }: { meta: FormatMeta }): React.ReactElement {
  return (
    <div className="print-letterhead">
      <div className="flex items-center gap-3">
        {/* Logo slot: client's high-resolution SVG lands at the §6 fidelity
            session — a placeholder keeps the geometry stable until then. */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          aria-hidden
          className="shrink-0"
          data-print-logo
        >
          <rect x="1" y="1" width="38" height="38" fill="none" stroke="#1a1d21" strokeWidth="2" />
          <path d="M10 30 L20 10 L30 30 Z" fill="none" stroke="#1a1d21" strokeWidth="2" />
        </svg>
        <div>
          <div className="text-[13pt] font-semibold leading-tight">Simran Technocrats (I) Pvt. Ltd.</div>
          <div className="text-[8.5pt] text-ink-500">
            Inspection Automation &amp; Quality Intelligence Platform
          </div>
        </div>
      </div>
      <div />
      <table className="text-[8.5pt]" data-print-format-block>
        <tbody>
          <tr>
            <td className="pr-2 text-right text-ink-500">Format No.</td>
            <td className="measurement font-medium">{meta.format}</td>
          </tr>
          <tr>
            <td className="pr-2 text-right text-ink-500">Rev. No.</td>
            <td className="measurement font-medium">{meta.rev}</td>
          </tr>
          <tr>
            <td className="pr-2 text-right text-ink-500">Date</td>
            <td className="measurement font-medium">{meta.issueDate}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReportHeaderFields({
  header,
  title,
}: {
  header: ReportHeader;
  title: string;
}): React.ReactElement {
  const fields: Array<[string, string]> = [
    ["Item code", header.itemCode],
    ["Drawing no.", header.drawingNumber],
    ["Revision", header.revision],
    ["Customer", header.customer],
    ["PO number", header.poNumber],
    ["Delivery batch", header.deliveryBatchCode],
    ["Lot quantity", `${String(header.lotQty)} pcs`],
    ["Inspection date", header.inspectionDate],
  ];
  return (
    <div className="mt-3">
      <div className="print-section-title">{title}</div>
      <table className="print-field-table">
        <tbody>
          {Array.from({ length: 4 }, (_, row) => (
            <tr key={row}>
              {fields.slice(row * 2, row * 2 + 2).map(([label, value]) => (
                <FragmentCell key={label} label={label} value={value} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <>
      <th scope="row" className="w-[12%]">
        {label}
      </th>
      <td className="measurement w-[38%]">{value}</td>
    </>
  );
}

export function ReportSignOffs({ signOffs, nace }: { signOffs: ReportSignOff[]; nace?: boolean }): React.ReactElement {
  const inspector = signOffs.find((s) => s.role === "INSPECTOR") ?? null;
  const qh = signOffs.find((s) => s.role === "QUALITY_HEAD") ?? null;
  return (
    <div className="print-signoff mt-6 grid grid-cols-2 gap-6">
      <div>
        <div className="print-section-title">{nace ? "NACE CIP Level 2 Inspector" : "Inspected by"}</div>
        <SignOffBlock
          role={nace ? "NACE CIP Level 2 Inspector" : "Inspector"}
          name={inspector?.name ?? null}
          cert={nace ? "NACE CIP Level 2" : null}
          signedAtIso={inspector?.signedAtIso ?? null}
        />
      </div>
      <div>
        <div className="print-section-title">Checked / approved by — Quality Head</div>
        <SignOffBlock role="Quality Head" name={qh?.name ?? null} signedAtIso={qh?.signedAtIso ?? null} />
      </div>
    </div>
  );
}

export function ReportFooter({
  data,
  auditRef,
}: {
  data: ReportData;
  auditRef: string | null;
}): React.ReactElement {
  const meta = FORMAT_META[data.workflow === "DIMENSIONAL" ? "ST/QC/02" : "ST/QC/04"];
  return (
    <div className="print-footer mt-6">
      <span>
        {meta.format} · {meta.rev} · {meta.issueDate} · {meta.governedBy}
      </span>
      <span className="measurement">
        {data.header.batchId.slice(0, 8)} · exported {new Date().toISOString().slice(0, 10)}
        {auditRef !== null ? ` · ref ${auditRef.slice(0, 8)}` : ""}
      </span>
    </div>
  );
}

export function ReportRejectionComments({ signOffs }: { signOffs: ReportSignOff[] }): React.ReactElement | null {
  const rejections = signOffs.filter((s) => s.role === "QUALITY_HEAD" && s.decision === "REJECT" && s.comments);
  if (rejections.length === 0) return null;
  return (
    <div className="print-keep mt-4">
      <div className="print-section-title">Quality Head remarks (history)</div>
      {rejections.map((r, i) => (
        <p key={i} className="mb-1 text-[9pt]">
          <span className="measurement text-ink-500">
            {r.signedAtIso === null ? "" : new Date(r.signedAtIso).toISOString().slice(0, 10)} —{" "}
          </span>
          {r.comments}
        </p>
      ))}
    </div>
  );
}

/**
 * Full-screen overlay that hosts the sheet OUTSIDE the app chrome (which is
 * marked `data-app-chrome` and hidden by the print layer).
 */
export function ReportOverlay({
  fileName,
  printing,
  exportState,
  onExport,
  onClose,
  children,
}: {
  fileName: string;
  printing: boolean;
  exportState: "idle" | "exporting" | "blocked";
  onExport: () => void;
  onClose: () => void;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-paper-sunken/60 px-4 py-6 print:static print:bg-white print:p-0">
      <div
        data-report-actions
        data-print-hide
        className="mx-auto mb-3 flex max-w-[210mm] items-center justify-between"
      >
        <span className="measurement text-xs text-ink-500">{fileName}</span>
        <div className="flex items-center gap-2">
          {exportState === "blocked" ? (
            <span className="text-xs font-medium text-status-fail-fg">
              ✕ Export is gated on APPROVED
            </span>
          ) : (
            <Button onClick={onExport} disabled={exportState === "exporting" || printing}>
              {exportState === "exporting" ? "Exporting…" : printing ? "Printing…" : "Export / print"}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} aria-label="Close report">
            <X size={14} />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
