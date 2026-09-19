import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNcrs, updateNcr } from "@/lib/api/ncr";
import type { NcrRow } from "@/lib/api/ncr";
import { useAuth } from "@/lib/auth/auth-context";
import { DataTable, THead, TH, TR, TD } from "@/components/ui/DataTable";
import { StatusChip, Caption } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/SectionCard";
import { TableSkeleton } from "@/components/ui/QueryState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";

export const Route = createFileRoute("/_authenticated/ncr")({
  component: NcrRegisterPage,
});

const STATUS_CHIP: Record<NcrRow["status"], "warn" | "info" | "pass"> = {
  OPEN: "warn",
  ACKNOWLEDGED: "info",
  CLOSED: "pass",
};

const DISPOSITIONS: NonNullable<NcrRow["disposition"]>[] = [
  "REWORK",
  "USE_AS_IS",
  "SORT",
  "REPAIR",
  "REJECT",
];

/**
 * NCR register (§4.7) — one list, newest first. QH/Admin see disposition
 * selects inline; everyone can follow the link back to the batch. The
 * register is deliberately plain: it is an audit document index, not a
 * dashboard.
 */
function NcrRegisterPage(): React.ReactElement {
  const { hasRole } = useAuth();
  const canDispose = hasRole("QUALITY_HEAD", "ADMIN");
  const qc = useQueryClient();
  const { data: ncrs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ncrs"],
    queryFn: listNcrs,
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof updateNcr>[1] }) =>
      updateNcr(vars.id, vars.patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ncrs"] });
    },
  });
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">NCR register</h1>
        <Caption>Non-conformance reports — numbered, linked to their batches (§4.7)</Caption>
      </div>

      {isError ? (
        <div role="alert" className="text-sm text-ink-700">
          Couldn't load the register: {error instanceof Error ? error.message : "service error"}
          <Button variant="secondary" className="ml-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <TableSkeleton rows={5} />
      ) : ncrs.length === 0 ? (
        <EmptyState
          icon={<span className="text-lg">▤</span>}
          message="No NCRs open. Draft one from a batch checklist when a FAIL needs a formal finding."
        />
      ) : (
        <DataTable>
          <THead>
            <TH sticky>NCR</TH>
            <TH>Batch</TH>
            <TH>Source</TH>
            <TH>Status</TH>
            <TH>Disposition</TH>
            <TH>Finding</TH>
          </THead>
          <tbody>
            {ncrs.map((n) => (
              <TR key={n.id}>
                <TD sticky mono>
                  {n.ncr_number}
                </TD>
                <TD>
                  <Link
                    to="/batch/$batchId"
                    params={{ batchId: n.batch_id }}
                    className="text-accent hover:underline"
                  >
                    View batch
                  </Link>
                </TD>
                <TD>
                  <StatusChip status="info" label={n.source} />
                </TD>
                <TD>
                  <StatusChip status={STATUS_CHIP[n.status]} label={n.status} />
                </TD>
                <TD>
                  {canDispose && n.status !== "CLOSED" ? (
                    <select
                      aria-label={`Disposition for ${n.ncr_number}`}
                      value={n.disposition ?? ""}
                      onChange={(e) => {
                        const disposition =
                          e.target.value === "" ? null : (e.target.value as NcrRow["disposition"]);
                        const nextStatus = disposition === null ? "ACKNOWLEDGED" : "CLOSED";
                        update.mutate(
                          { id: n.id, patch: { disposition, status: nextStatus } },
                          {
                            onError: (err) => {
                              setActionError(
                                err instanceof Error ? err.message : "Update failed",
                              );
                            },
                          },
                        );
                      }}
                      className="h-8 w-36 rounded-xs border border-ink-300 bg-paper-raised px-1 text-xs"
                    >
                      <option value="">— select —</option>
                      {DISPOSITIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : n.disposition !== null ? (
                    <span className="text-xs">{n.disposition}</span>
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </TD>
                <TD className="max-w-[26rem]">
                  <span className="line-clamp-2 text-xs text-ink-700">{n.description}</span>
                </TD>
              </TR>
            ))}
          </tbody>
        </DataTable>
      )}

      {actionError !== null ? (
        <SectionCard title="Update failed" letter="!">
          <p role="alert" className="text-sm font-medium text-status-fail-fg">
            ✕ {actionError}
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
