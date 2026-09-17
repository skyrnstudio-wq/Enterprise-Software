import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Paintbrush, FileWarning, ClipboardList, Printer } from "lucide-react";
import { listBatches } from "@/lib/api/batches";
import { listRejectionComments } from "@/lib/api/review";
import { db } from "@/lib/dexie/db";
import { startRealtime, classifyBatchEvent } from "@/lib/realtime";
import { useAuth } from "@/lib/auth/auth-context";
import { SectionCard, EmptyState } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { StatusChip, Caption } from "@/components/ui/StatusChip";
import { DataTable, THead, TH, TR, TD, Toast } from "@/components/ui/DataTable";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

const STALE_DRAFT_MS = 24 * 60 * 60 * 1000;

/**
 * Dashboard — ui-ux-plan §6.4 + application-flow §3: drafts strip (A4 rule:
 * >24 h drafts flagged), REJECTED batches pinned with QH comments inline,
 * then the batch list. The single primary action is "New dimensional batch".
 */
function DashboardPage() {
  const navigate = Route.useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const batches = useQuery({ queryKey: ["batches"], queryFn: listBatches });
  const dimensionDrafts = useLiveQuery(() => db.drafts.toArray(), []);
  const coatingDrafts = useLiveQuery(() => db.coatingDrafts.toArray(), []);

  // QH comments for the REJECTED pins (SO-03: the "why" rides the pin).
  const rejectedIds = (batches.data ?? []).filter((b) => b.status === "REJECTED").map((b) => b.id);
  const rejections = useQuery({
    queryKey: ["rejection-comments", rejectedIds.join(",")],
    queryFn: () => listRejectionComments(rejectedIds),
    enabled: rejectedIds.length > 0,
  });

  const [toast, setToast] = useState<{
    title: string;
    desc: string;
    status: "pass" | "warn" | "fail";
  } | null>(null);

  // user:{id} channel — approval/rejection arrive without refresh (§6.8:
  // "Inspector is notified when Quality Head approves or rejects").
  useEffect(() => {
    const wiring = startRealtime({
      userId: profile?.id ?? null,
      isQualityHead: false,
      onEvent: (_topic, event) => {
        const kind = classifyBatchEvent(event);
        if (kind === "APPROVED") {
          setToast({
            title: "Batch approved ✓",
            desc: "A Quality Head signed off on one of your submissions.",
            status: "pass",
          });
        } else if (kind === "RETURNED") {
          setToast({
            title: "Batch returned",
            desc: "A Quality Head returned one of your submissions with comments — see the dashboard.",
            status: "warn",
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["batches"] });
        void queryClient.invalidateQueries({ queryKey: ["rejection-comments"] });
      },
    });
    return wiring.stop;
  }, [profile?.id, queryClient]);

  const drafts = [
    ...(dimensionDrafts ?? []).map((d) => ({
      kind: "DIMENSIONAL" as const,
      batchId: d.batchId,
      itemCode: d.header.item_code,
      po: d.header.po_number,
      lot: d.header.delivery_batch_code,
      savedAt: d.savedAt,
    })),
    ...(coatingDrafts ?? []).map((d) => ({
      kind: "COATING" as const,
      batchId: d.batchId,
      itemCode: d.header.item_code,
      po: d.header.po_number,
      lot: d.header.delivery_batch_code,
      savedAt: d.savedAt,
    })),
  ];

  const now = Date.now();
  const rejected = batches.data?.filter((b) => b.status === "REJECTED") ?? [];
  const others = batches.data?.filter((b) => b.status !== "REJECTED") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Inspection batches</h1>
          <Caption>Dimensional · ST/QC/02 — Coating · ST/QC/04</Caption>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void navigate({ to: "/coating/new" })}>
            <Paintbrush size={16} className="mr-2 inline" /> New coating batch
          </Button>
          <Button onClick={() => void navigate({ to: "/batch/new" })}>
            <Plus size={16} className="mr-2 inline" /> New dimensional batch
          </Button>
        </div>
      </div>

      {/* Drafts strip — resume points + the A4 stale-draft rule (edge 3.13). */}
      {dimensionDrafts !== undefined && coatingDrafts !== undefined && drafts.length > 0 ? (
        <SectionCard title="Drafts in progress" letter="D">
          <ul className="divide-y divide-ink-200">
            {drafts.map((d) => {
              const stale = now - new Date(d.savedAt).getTime() > STALE_DRAFT_MS;
              return (
                <li key={d.batchId} className="flex items-center justify-between py-2">
                  <span className="text-sm">
                    <StatusChip
                      status={d.kind === "COATING" ? "info" : "locked"}
                      label={d.kind === "COATING" ? "COATING" : "DIM"}
                      className="mr-3"
                    />
                    <span className="measurement mr-3 font-medium">{d.itemCode}</span>
                    <span className="text-ink-500">
                      PO {d.po} · lot {d.lot}
                    </span>
                    {stale ? (
                      <span className="ml-3 rounded-xs bg-status-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-status-warn-fg">
                        ▲ untouched &gt; 24 h
                      </span>
                    ) : null}
                  </span>
                  <Link
                    to={d.kind === "COATING" ? "/coating/$batchId" : "/batch/$batchId"}
                    params={{ batchId: d.batchId }}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    Resume →
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}

      {/* Rejected pinning (application-flow §3) — QH decisions demand action. */}
      {rejected.length > 0 ? (
        <SectionCard title="Returned by Quality Head" letter="R">
          <ul className="divide-y divide-ink-200">
            {rejected.map((b) => {
              const rej = rejections.data?.[b.id];
              return (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-3 text-sm">
                    <StatusChip status="fail" label="REJECTED" />
                    <span className="measurement font-medium">{b.item_code}</span>
                    <span className="text-ink-500">
                      PO {b.po_number} · lot {b.delivery_batch_code}
                    </span>
                  </span>
                  <div className="max-w-md">
                    {rej !== undefined ? (
                      <p className="mb-1 border-l-2 border-status-fail-fg pl-2 text-xs text-ink-700">
                        “{rej.comments}”
                      </p>
                    ) : null}
                    <Link
                      to={b.workflow === "COATING" ? "/coating/$batchId" : "/batch/$batchId"}
                      params={{ batchId: b.id }}
                      className="flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                    >
                      <FileWarning size={14} /> Revise &amp; resubmit →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="All batches" letter="B">
        {batches.isLoading ? (
          <Caption>loading…</Caption>
        ) : others.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={24} />}
            message="No batches yet. Start the first dimensional inspection for this station."
            action={
              <Button onClick={() => void navigate({ to: "/batch/new" })}>
                New dimensional batch
              </Button>
            }
          />
        ) : (
          <DataTable>
            <THead>
              <TR>
                <TH sticky>Item</TH>
                <TH>Workflow</TH>
                <TH>PO</TH>
                <TH mono>Lot</TH>
                <TH mono>Inspected</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {others.map((b) => (
                <TR key={b.id}>
                  <TD sticky>
                    <Link
                      to="/batch/$batchId"
                      params={{ batchId: b.id }}
                      className="measurement font-medium hover:underline"
                    >
                      {b.item_code}
                    </Link>
                  </TD>
                  <TD>
                    <StatusChip
                      status={b.workflow === "COATING" ? "info" : "locked"}
                      label={b.workflow === "COATING" ? "COATING" : "DIM"}
                    />
                  </TD>
                  <TD>{b.po_number}</TD>
                  <TD mono>{b.delivery_batch_code}</TD>
                  <TD mono>{b.inspection_date}</TD>
                  <TD>
                    <StatusChip
                      status={
                        b.status === "APPROVED"
                          ? "pass"
                          : b.status === "SUBMITTED"
                            ? "info"
                            : "locked"
                      }
                      label={b.status}
                    />
                    {/* Phase 6: approved controlled reports are one click away.
                        The print act itself is gated inside the report route. */}
                    {b.status === "APPROVED" ? (
                      <Link
                        to="/reports/$batchId"
                        params={{ batchId: b.id }}
                        className="ml-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <Printer size={12} /> Report
                      </Link>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      {toast !== null ? (
        <Toast
          open
          onOpenChange={(o) => {
            if (!o) setToast(null);
          }}
          title={toast.title}
          description={toast.desc}
          status={toast.status}
        />
      ) : null}
    </div>
  );
}
