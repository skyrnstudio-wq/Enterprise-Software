import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftToLine, FilePlus2, Send } from "lucide-react";
import { listDimensionRows, probeBatchHeader, submitBatch } from "@/lib/api/batches";
import { useInspectionStore } from "@/lib/store/inspection-store";
import {
  rowStatus,
  isSuspiciousUniformity,
  copyFirstToAllRows,
  submissionChecklist,
} from "@/domain/grid-model";
import type { ChecklistRow } from "@/domain/grid-model";
import { DimensionGrid } from "@/components/grid/DimensionGrid";
import { NcrDraftDialog } from "@/components/ncr/NcrDraftDialog";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Caption } from "@/components/ui/StatusChip";
import { SaveIndicator } from "@/components/ui/SaveIndicator";
import { Toast } from "@/components/ui/DataTable";

export const Route = createFileRoute("/_authenticated/batch/$batchId")({
  component: BatchGridPage,
});

/**
 * The inspection screen — Critical Journey #1 (execution-plan.md Phase 3
 * steps 5/6/8/10). Grid center; quick-fill in the sticky action bar; the A5
 * checklist gates submission; "saved Xs ago" uses the monotonic local delta
 * (edge 3.19). The NCR affordance appears when the checklist warns (step 10;
 * the full NCR flow lands in Phase 8).
 */
function BatchGridPage() {
  const { batchId } = useParams({ from: "/_authenticated/batch/$batchId" });
  if (typeof batchId !== "string" || batchId === "") return null; // route invariant
  const draft = useInspectionStore((s) => s.draft);
  const hydratedStore = useInspectionStore((s) => s.hydrated);
  const lastWriteAt = useInspectionStore((s) => s.lastWriteAt);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<{
    title: string;
    desc: string;
    status: "pass" | "warn" | "fail";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ncrOpen, setNcrOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const navigate = useNavigate();

  // Hydrate from Dexie first (resume), then fall back to server bootstrap.
  //
  // "Batch not found" is driven by a definitive lookup result, never by
  // `draft === null`: a transport failure (offline, cold start) has to stay
  // recoverable instead of accusing the operator of opening a missing batch.
  // Cancels stale async results (effect re-run / unmount). The flag is read
  // through a call on purpose: TypeScript narrows `ref.current` to the literal
  // `false` straight after the reset below, which would make every check dead
  // code — and `no-unnecessary-condition` correctly rejects that.
  const bootstrapGuard = useRef(false);
  useEffect(() => {
    bootstrapGuard.current = false;
    const cancelled = (): boolean => bootstrapGuard.current;
    void (async () => {
      const existing = await useInspectionStore.getState().hydrate(batchId);
      if (existing !== null || cancelled()) return; // draft resumed

      // A single failed lookup is usually a cold session or a flaky link, not
      // an absent batch — so give it a couple more tries before saying so.
      let probe = await probeBatchHeader(batchId);
      for (let attempt = 0; probe.kind === "unreachable" && attempt < 2; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (cancelled()) return;
        probe = await probeBatchHeader(batchId);
      }
      if (cancelled()) return;
      if (probe.kind === "unreachable") {
        setUnreachable(true);
        return;
      }
      if (probe.kind === "missing" || probe.header.status !== "DRAFT") {
        setMissing(true);
        return;
      }
      const header = probe.header;
      const rows = await listDimensionRows(header.revision_id);
      if (cancelled()) return;
      useInspectionStore.getState().load({
        batchId,
        header: {
          item_id: header.item_id,
          revision_id: header.revision_id,
          item_code: header.item_code,
          po_number: header.po_number,
          delivery_batch_code: header.delivery_batch_code,
          inspection_date: header.inspection_date,
          lot_quantity: header.lot_qty,
        },
        rows: rows.map((r) => ({
          dimension_row_id: r.id,
          serial: r.serial,
          label: r.label,
          symbol: r.symbol,
          is_reference: r.is_reference,
          nominal: r.nominal,
          tol_plus: r.tol_plus,
          tol_minus: r.tol_minus,
          instrument_id: null,
          samples: [null, null, null, null, null],
        })),
        cursor: null,
        savedAt: new Date(0).toISOString(),
      });
    })();
    return () => {
      bootstrapGuard.current = true;
    };
  }, [batchId]);

  // "Saved Xs ago" — monotonic local delta only (edge 3.19).
  useEffect(() => {
    const t = window.setInterval(() => {
      setTick((v) => v + 1);
    }, 5000);
    return () => {
      window.clearInterval(t);
    };
  }, []);

  const instruments = useQuery({
    queryKey: ["instruments"],
    queryFn: async () => {
      const { listInstruments } = await import("@/lib/api/admin");
      const today = new Date().toISOString().slice(0, 10);
      return (await listInstruments(today)).map((i) => ({
        id: i.id,
        label: `${i.instrument_code} — ${i.make_model}`,
        expired: i.status === "EXPIRED",
      }));
    },
  });

  const checklist = useMemo(() => {
    if (draft === null) return [];
    const rows: ChecklistRow[] = draft.rows.map((r) => ({
      serial: r.serial,
      status: rowStatus(r.samples, r.nominal, r.tol_plus, r.tol_minus),
      instrumentId: r.instrument_id,
      instrumentExpired: (instruments.data ?? []).some(
        (i) => i.id === r.instrument_id && i.expired,
      ),
      suspicious: isSuspiciousUniformity(r.samples, r.tol_plus + r.tol_minus),
    }));
    return submissionChecklist(
      rows,
      (serial) => draft.rows.find((r) => r.serial === serial)?.is_reference === true,
    );
  }, [draft, instruments.data]);

  const blocks = checklist.filter((i) => i.kind === "block");
  const hasFails = checklist.some((i) => i.message.includes("beyond limits"));

  // DIM-05: enabled while ANY row has sample 01 entered; the pure model does
  // the per-row copy (a row without 01 is never touched).
  const copyAllowed = (draft?.rows ?? []).some((r) => r.samples[0] !== null);

  function copyFirstToAll(): void {
    const store = useInspectionStore.getState();
    if (store.draft === null) return;
    const rows = copyFirstToAllRows(store.draft.rows);
    rows.forEach((row, rowIndex) => {
      row.samples.forEach((value, si) => {
        const current = store.draft?.rows[rowIndex]?.samples[si];
        if (value !== current) store.setSample(rowIndex, si, value);
      });
    });
  }

  function fillNominal(): void {
    const store = useInspectionStore.getState();
    store.draft?.rows.forEach((row, rowIndex) => {
      if (row.is_reference || row.nominal !== 0) {
        for (let si = 0; si < 5; si++) store.setSample(rowIndex, si, row.nominal);
      }
    });
  }

  async function submit(): Promise<void> {
    if (draft === null || blocks.length > 0) return;
    setSubmitting(true);
    try {
      const result = await submitBatch(draft);
      if (result.kind === "submitted") {
        await useInspectionStore.getState().purge(draft.batchId);
        // The draft is gone server-side, so this route has nothing left to
        // render — return the operator to the dashboard (where the batch now
        // sits in the review queue) instead of dead-ending on "loading…".
        void navigate({ to: "/" });
      } else if (result.kind === "queued-offline") {
        setToast({
          title: "Queued offline",
          desc: "Submission will replay automatically when the connection returns.",
          status: "warn",
        });
      } else {
        setToast({ title: "Submission blocked", desc: result.message, status: "fail" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const mutatedAt = useInspectionStore((s) => s.mutatedAt);

  if (missing) {
    return (
      <SectionCard title="Batch not found" letter="!">
        <p className="text-sm text-ink-700">
          No DRAFT batch with this id — it may already be submitted. Check the{" "}
          <Link to="/" className="text-accent hover:underline">
            dashboard
          </Link>
          .
        </p>
      </SectionCard>
    );
  }
  // A failed lookup is NOT a missing batch: keep the page recoverable and say
  // so plainly rather than discarding the operator's context.
  if (unreachable && draft === null && hydratedStore) {
    return (
      <Caption>
        Cannot reach the server to load this batch — reconnect and reload. Your local draft, if
        any, is untouched.
      </Caption>
    );
  }
  if (draft === null) return <Caption>loading…</Caption>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            <span className="measurement">{draft.header.item_code}</span> — dimensional inspection
          </h1>
          <Caption>
            PO {draft.header.po_number} · lot {draft.header.delivery_batch_code} ·{" "}
            {String(draft.rows.length)} dimensions ·{" "}
            <SaveIndicator lastWriteAt={lastWriteAt} dirtyAt={mutatedAt} tick={tick} />
          </Caption>
        </div>
        <div className="flex items-center gap-4">
          {/* C4 — linked flow: header + lot carry over; divergence impossible. */}
          <Link
            to="/coating/new"
            search={{ from: draft.batchId, item: draft.header.item_id }}
            className="text-sm text-accent hover:underline"
          >
            Coating batch for this lot →
          </Link>
          <Link to="/" className="text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeftToLine size={14} className="mr-1 inline" /> Dashboard
          </Link>
        </div>
      </div>

      <DimensionGrid rows={draft.rows} instruments={instruments.data ?? []} />

      {/* Sticky action bar — tablet thumb zone (step 5). */}
      <div className="sticky bottom-0 z-30 -mx-6 border-t border-ink-300 bg-paper-raised px-6 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={!copyAllowed}
              title={copyAllowed ? undefined : "Sample 01 is empty (edge 3.6)"}
              onClick={copyFirstToAll}
            >
              Copy 01→05
            </Button>
            <Button variant="secondary" onClick={fillNominal}>
              Fill Nominal
            </Button>
          </div>
          <ul className="min-w-0 flex-1 space-y-0.5 text-xs">
            {checklist.length === 0 ? (
              <li className="font-medium text-status-pass-fg">✓ Ready to submit</li>
            ) : (
              checklist.map((i) => (
                <li
                  key={i.message}
                  className={
                    i.kind === "block" ? "font-medium text-status-fail-fg" : "text-status-warn-fg"
                  }
                >
                  {i.glyph} {i.message}
                </li>
              ))
            )}
          </ul>
          <div className="flex items-center gap-2">
            {hasFails ? (
              <Button variant="ghost" onClick={() => { setNcrOpen(true); }}>
                <FilePlus2 size={14} className="mr-1 inline" /> Draft NCR
              </Button>
            ) : null}
            <Button disabled={blocks.length > 0 || submitting} onClick={() => void submit()}>
              <Send size={14} className="mr-1 inline" /> Submit for review
            </Button>
          </div>
        </div>
      </div>

      <NcrDraftDialog
        open={ncrOpen}
        onOpenChange={setNcrOpen}
        batchId={batchId}
        source="DIMENSIONAL"
        onCreated={(ncrNumber) => {
          setToast({
            title: `NCR ${ncrNumber} opened`,
            desc: "The register now carries the finding — Quality Head will disposition it.",
            status: "pass",
          });
        }}
      />

      {toast !== null ? (
        <Toast
          open
          onOpenChange={(o) => {
            if (!o) setToast(null);
          }}
          title={toast.title}
          description={toast.desc}
          status={toast.status}
          persist={toast.status === "fail"}
        />
      ) : null}
    </div>
  );
}
