import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getReportData, logExport } from "@/lib/api/review";
import { printSheet, usePrintMode } from "@/lib/print";
import { ReportOverlay } from "@/components/reports/ReportSheet";
import { fileNameFor, formatMetaFor } from "@/lib/report-meta";
import { ReportDim } from "@/components/reports/ReportDim";
import { ReportCoating } from "@/components/reports/ReportCoating";
import { Caption } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/_authenticated/reports/$batchId")({
  component: ReportPage,
});

/**
 * Controlled-report route (Phase 6 steps 2–4) — hosts the sheet OUTSIDE the
 * app chrome and owns the export gate (PDF-01 + edge 6.9):
 * - the sheet previews read-only at any status;
 * - Export calls `log_export` FIRST — the server RPC refuses non-APPROVED
 *   batches (BT_STATE) and writes the auditable EXPORT entry; only on
 *   success does the print pipeline run.
 */
function ReportPage() {
  const params: { batchId: string } = Route.useParams();
  const { batchId } = params;
  const printing = usePrintMode();
  const [exportState, setExportState] = useState<"idle" | "exporting" | "blocked">("idle");
  const [auditRef, setAuditRef] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["report-data", batchId],
    queryFn: () => getReportData(batchId),
  });

  if (detail.isLoading || detail.data === undefined) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-paper-sunken/60">
        <Caption>{detail.isError ? "✕ report unavailable" : "loading report…"}</Caption>
      </div>
    );
  }

  const data = detail.data;
  const approved = data.header.status === "APPROVED";
  const meta = formatMetaFor(data);

  async function onExport(): Promise<void> {
    setExportState("exporting");
    try {
      // Gate + audit FIRST (server is the control plane); print only on a
      // logged export — an unlogged print would be an unaudited QMS act.
      const res = await logExport(batchId, "PRINT", { format: meta.format });
      if (res.kind === "blocked") {
        setExportState("blocked");
        return;
      }
      setAuditRef(res.auditId);
      await printSheet(fileNameFor(data));
      setExportState("idle");
    } catch {
      setExportState("blocked");
    }
  }

  return (
    <ReportOverlay
      fileName={fileNameFor(data)}
      printing={printing}
      exportState={approved ? exportState : "blocked"}
      onExport={() => void onExport()}
      onClose={() => {
        window.history.back();
      }}
    >
      {data.workflow === "DIMENSIONAL" ? (
        <ReportDim data={data} auditRef={auditRef} />
      ) : (
        <ReportCoating data={data} auditRef={auditRef} />
      )}
    </ReportOverlay>
  );
}
