import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { listReviewQueue, computeQueueFlags, getExpiredInstrumentIds } from "@/lib/api/review";
import { startRealtime } from "@/lib/realtime";
import { useAuth } from "@/lib/auth/auth-context";
import { SectionCard, EmptyState } from "@/components/ui/SectionCard";
import { Caption, StatusChip } from "@/components/ui/StatusChip";
import { DataTable, THead, TH, TR, TD } from "@/components/ui/DataTable";
import { QueryState, TableSkeleton } from "@/components/ui/QueryState";

export const Route = createFileRoute("/_authenticated/review/")({
  component: ReviewQueuePage,
});

/**
 * QH review queue — execution-plan Phase 5 step 1 + ui-ux-plan §6.8: a
 * table, not cards; flags column `▲2 · ✕1 · 1 expired` computed by the same
 * domain engines the inspector's screen used; the `user:{id}` realtime
 * channel keeps the list live without refresh (step 6, edge 5.7).
 */
function ReviewQueuePage() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isQh = profile?.role === "QUALITY_HEAD" || profile?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const queue = useQuery({ queryKey: ["review-queue"], queryFn: listReviewQueue });
  const expired = useQuery({
    queryKey: ["expired-instruments", today],
    queryFn: () => getExpiredInstrumentIds(today),
  });

  const flags = useQuery({
    queryKey: ["review-flags", queue.data?.map((q) => q.id).join(","), expired.data?.size ?? 0],
    queryFn: () =>
      computeQueueFlags(
        (queue.data ?? []).map((q) => q.id),
        expired.data ?? new Set(),
      ),
    enabled: queue.isSuccess,
  });

  // role:QUALITY_HEAD channel — new submissions appear without refresh.
  useEffect(() => {
    if (!isQh) return;
    const wiring = startRealtime({
      userId,
      isQualityHead: true,
      onEvent: () => {
        void queryClient.invalidateQueries({ queryKey: ["review-queue"] });
        void queryClient.invalidateQueries({ queryKey: ["review-flags"] });
      },
    });
    setLive(true);
    return () => {
      wiring.stop();
      setLive(false);
    };
  }, [isQh, userId, queryClient]);

  if (!isQh) {
    return (
      <SectionCard title="Review is a Quality Head function" letter="!">
        <p className="text-sm text-ink-700">
          Your role does not include batch decisions. Check the{" "}
          <Link to="/" className="text-accent hover:underline">
            dashboard
          </Link>
          .
        </p>
      </SectionCard>
    );
  }

  const rows = queue.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Review queue</h1>
        <Caption>
          {live ? "live — new submissions appear instantly" : "connecting…"}
        </Caption>
      </div>

      <QueryState
        isLoading={queue.isLoading}
        isError={queue.isError}
        error={queue.error}
        onRetry={() => {
          void queue.refetch();
        }}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={<ClipboardList size={24} />}
            message="No batches awaiting review. Submitted inspections appear here in real time."
          />
        }
        skeleton={<TableSkeleton rows={4} />}
      >
        <SectionCard title={`Awaiting decision (${String(rows.length)})`} letter="Q">
          <DataTable>
            <THead>
              <TR>
                <TH sticky>Item</TH>
                <TH>Workflow</TH>
                <TH>PO</TH>
                <TH mono>Lot</TH>
                <TH mono>Submitted</TH>
                <TH>Flags</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => {
                const f = flags.data?.[r.id];
                const flagChips = (
                  <>
                    {(f?.warns ?? 0) > 0 ? (
                      <StatusChip
                        status="warn"
                        label={`▲ ${String(f?.warns ?? 0)}`}
                        className="mr-1"
                      />
                    ) : null}
                    {(f?.fails ?? 0) > 0 ? (
                      <StatusChip
                        status="fail"
                        label={`✕ ${String(f?.fails ?? 0)}`}
                        className="mr-1"
                      />
                    ) : null}
                    {(f?.expiredInstruments ?? 0) > 0 ? (
                      <StatusChip status="fail" label={`1 expired instr.`} />
                    ) : null}
                    {(f?.warns ?? 0) + (f?.fails ?? 0) + (f?.expiredInstruments ?? 0) === 0 ? (
                      <span className="text-xs text-status-pass-fg">✓ clean</span>
                    ) : null}
                  </>
                );
                return (
                  <TR key={r.id}>
                    <TD sticky>
                      <Link
                        to="/review/$batchId"
                        params={{ batchId: r.id }}
                        className="measurement font-medium hover:underline"
                      >
                        {r.item_code}
                      </Link>
                    </TD>
                    <TD>
                      <StatusChip
                        status={r.workflow === "COATING" ? "info" : "locked"}
                        label={r.workflow === "COATING" ? "COATING" : "DIM"}
                      />
                    </TD>
                    <TD>{r.po_number}</TD>
                    <TD mono>{r.delivery_batch_code}</TD>
                    <TD mono>{r.submitted_at.slice(0, 10)}</TD>
                    <TD>{flagChips}</TD>
                  </TR>
                );
              })}
            </tbody>
          </DataTable>
        </SectionCard>
      </QueryState>
    </div>
  );
}
