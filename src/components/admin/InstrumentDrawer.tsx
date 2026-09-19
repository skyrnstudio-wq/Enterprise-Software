import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download } from "lucide-react";
import {
  getInstrumentUsage,
  type InstrumentRowView,
  type InstrumentUsageRow,
} from "@/lib/api/admin";
import { nextDueAt } from "@/domain/instrument-status";
import { StatusChip, Caption } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";

/**
 * Instrument detail drawer (G10) with the EQ-04 audit-recall ledger (D3):
 * calibration identity + every batch the instrument touched. "Download CSV"
 * produces the recall attachment for the quality file — the mechanical,
 * error-prone paper-trail reconstruction this feature replaces.
 */
export function InstrumentDrawer({
  instrument,
  onClose,
}: {
  instrument: InstrumentRowView;
  onClose: () => void;
}): React.ReactElement {
  const { data: usage = [], isLoading } = useQuery({
    queryKey: ["instrument-usage", instrument.id],
    queryFn: () => getInstrumentUsage(instrument.id),
  });

  function downloadCsv(): void {
    const header = "delivery_batch,po,inspection_date,item_code,batch_status,usage_kind,samples";
    const lines = usage.map(
      (u: InstrumentUsageRow) =>
        [
          u.delivery_batch_code,
          u.po_number,
          u.inspection_date,
          u.item_code,
          u.batch_status,
          u.kind,
          String(u.sample_count),
        ]
          .map((v) => (v.includes(",") ? `"${v}"` : v))
          .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `instrument-recall_${instrument.instrument_code}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-ink-300 bg-paper-raised shadow-[-8px_0_32px_rgba(0,0,0,0.18)]">
          <header className="flex items-start justify-between border-b border-ink-200 px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold">
                <span className="measurement">{instrument.instrument_code}</span> —{" "}
                {instrument.description}
              </DialogPrimitive.Title>
              <Caption className="mt-0.5">
                {instrument.make_model} · {instrument.range}
              </Caption>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-ink-500 hover:text-ink-900"
              >
                ✕
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <section aria-label="Calibration" className="space-y-2">
              <Caption>Calibration (EQ-01/02)</Caption>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">Last cal</dt>
                  <dd className="measurement">{instrument.last_cal_at}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">Next due</dt>
                  <dd className="measurement">{instrument.next_due_at}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">Interval</dt>
                  <dd className="measurement">{String(instrument.interval_months)} months</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">Status</dt>
                  <dd>
                    <StatusChip
                      status={instrument.status === "ACTIVE" ? "pass" : instrument.status === "DUE_SOON" ? "warn" : "fail"}
                      label={instrument.status}
                    />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">
                    Recalibration from today
                  </dt>
                  <dd className="measurement">
                    {nextDueAt(new Date().toISOString().slice(0, 10), instrument.interval_months)}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-label="Usage recall" className="mt-6">
              <div className="flex items-center justify-between">
                <Caption>Usage recall — batches touched (EQ-04)</Caption>
                <Button variant="secondary" onClick={downloadCsv} disabled={usage.length === 0}>
                  <Download size={14} className="mr-1 inline" /> CSV
                </Button>
              </div>
              {isLoading ? (
                <p className="mt-2 text-sm text-ink-500">Loading usage…</p>
              ) : usage.length === 0 ? (
                <p className="mt-2 text-sm text-ink-500">
                  No recorded usage — no batches reference this instrument.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {usage.map((u) => (
                    <li
                      key={`${u.batch_id}-${u.kind}`}
                      className="flex items-center justify-between rounded-xs border border-ink-200 px-3 py-2 text-sm"
                    >
                      <span className="measurement font-medium">{u.delivery_batch_code}</span>
                      <span className="text-xs text-ink-500">
                        {u.inspection_date} · {u.item_code} · {u.kind}
                        {u.kind === "DIMENSIONAL" ? ` (${String(u.sample_count)})` : ""}
                      </span>
                      <StatusChip
                        status={
                          u.batch_status === "APPROVED"
                            ? "pass"
                            : u.batch_status === "DRAFT"
                              ? "locked"
                              : "info"
                        }
                        label={u.batch_status}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
