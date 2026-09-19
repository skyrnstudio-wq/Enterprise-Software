import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, Undo2, Printer } from "lucide-react";
import {
  getReviewDetail,
  getDimensionalReview,
  getCoatingReview,
  getExpiredInstrumentIds,
  computeDimensionalFlags,
  computeCoatingFlags,
  decideBatch,
  canDecide,
} from "@/lib/api/review";
import { getCoatingSpec } from "@/lib/api/coating";
import type { ReviewFlags } from "@/lib/api/review";
import { subscribeBatch } from "@/lib/realtime";
import { useAuth } from "@/lib/auth/auth-context";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Caption, StatusChip } from "@/components/ui/StatusChip";
import { SignOffBlock } from "@/components/ui/SignOffBlock";
import { ApproveModal, RejectModal } from "@/components/review/DecisionModals";
import { Toast } from "@/components/ui/DataTable";
import { PanelsSkeleton } from "@/components/ui/QueryState";
import { useNavigate } from "@tanstack/react-router";
import { computeDftStats, evaluateIso19840 } from "@/domain/dft-stats";

export const Route = createFileRoute("/_authenticated/review/$batchId")({
  component: ReviewDetailPage,
});

const DEFECTS = [
  ["pinholes", "Pinholes"],
  ["sagging", "Sagging"],
  ["gloss_loss", "Gloss loss"],
  ["peel_off", "Peel-off"],
  ["blisters", "Blisters"],
] as const;

/**
 * Review detail (S16/S17) — execution-plan Phase 5 step 2 + ui-ux §6.8:
 * read-only render of the exact record the inspector saw, flags anchoring
 * the offending data, pinned action bar with Approve/Reject modals
 * (steps 3/4), expired-instrument acknowledgement (step 7, EQ-03), and the
 * `batch:{id}` realtime channel refreshing mid-review submits (edge 5.2).
 */
function ReviewDetailPage() {
  const { batchId } = useParams({ from: "/_authenticated/review/$batchId" });
  if (typeof batchId !== "string" || batchId === "") return null;
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | null>(null);
  const [comments, setComments] = useState("");
  const [flagsAck, setFlagsAck] = useState(false);
  const [expiredAck, setExpiredAck] = useState(false);
  const [mfaNotice, setMfaNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    title: string;
    desc: string;
    status: "pass" | "warn" | "fail";
  } | null>(null);

  const detail = useQuery({
    queryKey: ["review-detail", batchId],
    queryFn: () => getReviewDetail(batchId),
  });
  const workflow = detail.data?.workflow ?? null;

  // batch:{id} — a submit/decision racing this open review refreshes it (5.2).
  useEffect(() => {
    const unsubscribe = subscribeBatch(batchId, () => {
      void queryClient.invalidateQueries({ queryKey: ["review-detail", batchId] });
      void queryClient.invalidateQueries({ queryKey: ["dimensional-review", batchId] });
      void queryClient.invalidateQueries({ queryKey: ["coating-review", batchId] });
    });
    return unsubscribe;
  }, [batchId, queryClient]);

  const today = new Date().toISOString().slice(0, 10);
  const expired = useQuery({
    queryKey: ["expired-instruments", today],
    queryFn: () => getExpiredInstrumentIds(today),
  });
  const dimensional = useQuery({
    queryKey: ["dimensional-review", batchId],
    queryFn: () => getDimensionalReview(batchId),
    enabled: workflow === "DIMENSIONAL",
  });
  const coating = useQuery({
    queryKey: ["coating-review", batchId],
    queryFn: () => getCoatingReview(batchId),
    enabled: workflow === "COATING",
  });
  const spec = useQuery({
    queryKey: ["coating-spec", detail.data?.revision_id],
    queryFn: () => getCoatingSpec(detail.data?.revision_id ?? ""),
    enabled: workflow === "COATING" && detail.data !== null,
  });

  const flags: ReviewFlags = useMemo(() => {
    if (workflow === "DIMENSIONAL" && dimensional.data !== undefined) {
      return computeDimensionalFlags(
        dimensional.data.map((r) => ({
          samples: r.values,
          nominal: r.nominal,
          tol_plus: r.tol_plus,
          tol_minus: r.tol_minus,
          instrument_id: r.instrument_id,
        })),
        expired.data ?? new Set(),
      );
    }
    if (
      workflow === "COATING" &&
      coating.data !== undefined &&
      spec.data !== null &&
      spec.data !== undefined
    ) {
      return computeCoatingFlags(
        { INSIDE: coating.data.INSIDE, OUTSIDE: coating.data.OUTSIDE },
        { inside: spec.data.dft_nominal_um_inside, outside: spec.data.dft_nominal_um_outside },
        Object.fromEntries(
          Object.entries(coating.data.visual).map(([k, present]) => [k, present ? "fail" : "pass"]),
        ),
      );
    }
    return { warns: 0, fails: 0, expiredInstruments: 0 };
  }, [workflow, dimensional.data, coating.data, spec.data, expired.data]);

  async function submitDecision(): Promise<void> {
    if (detail.data === null || decision === null) return;
    if (decision === "REJECT" && comments.trim().length < 10) return;
    setSubmitting(true);
    setMfaNotice(null);
    try {
      // `batchId` is narrowed at the top of the component; pin it for the
      // async closure (ESLint's any-flow through the callback can't see it).
      const id: string = batchId;
      const result = await decideBatch(
        id,
        decision,
        decision === "REJECT" ? comments.trim() : null,
      );
      if (result.kind === "decided") {
        setDecision(null);
        setComments("");
        setFlagsAck(false);
        setExpiredAck(false);
        setToast({
          title: decision === "APPROVE" ? "Batch approved" : "Batch returned",
          desc:
            decision === "APPROVE"
              ? "The record is now immutable — the inspector has been notified."
              : "The inspector can revise and resubmit; they have been notified.",
          status: decision === "APPROVE" ? "pass" : "warn",
        });
        await queryClient.invalidateQueries({ queryKey: ["review-detail", batchId] });
        await queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      } else if (result.kind === "mfa-required") {
        // Edge 5.5: the decision form stays intact — re-challenge, then retry.
        setMfaNotice(result.message);
      } else {
        setToast({ title: "Decision blocked", desc: result.message, status: "fail" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (detail.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <PanelsSkeleton count={3} />
      </div>
    );
  }
  if (detail.data === null || detail.data === undefined) {
    return (
      <SectionCard title="Record no longer available" letter="!">
        <p className="text-sm text-ink-700">
          This batch may have been decided or removed. Back to the{" "}
          <Link to="/review" className="text-accent hover:underline">
            review queue
          </Link>
          .
        </p>
      </SectionCard>
    );
  }

  const d = detail.data;
  // Edge 5.9 UI mirror (canDecide: author ≠ decider) — the server's
  // separation-of-duties guard remains the control plane.
  const isQh = profile?.role === "QUALITY_HEAD" || profile?.role === "ADMIN";
  const notAuthor = canDecide({ created_by: d.created_by }, profile?.id ?? null);
  const showButtons = isQh && notAuthor;

  const isDim = workflow === "DIMENSIONAL";

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            <span className="measurement">{d.item_code}</span> — review
          </h1>
          <Caption>
            {isDim ? "Dimensional · ST/QC/02" : "Coating · ST/QC/04"} · PO {d.po_number} · lot{" "}
            {d.delivery_batch_code} · {String(d.lot_qty)} pcs
          </Caption>
        </div>
        <Link to="/review" className="text-sm text-ink-500 hover:text-ink-900">
          <Undo2 size={14} className="mr-1 inline" /> Queue
        </Link>
      </div>

      {/* Flag strip (§6.8) — chips anchor to the offending panels below. */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status="warn" label={`▲ ${String(flags.warns)} near-limit`} />
        <StatusChip
          status={flags.fails > 0 ? "fail" : "pass"}
          label={`✕ ${String(flags.fails)} breaches`}
        />
        {flags.expiredInstruments > 0 ? (
          <a href="#expired-ack" className="inline-flex">
            <StatusChip status="fail" label={`1 expired instrument — ack required`} />
          </a>
        ) : (
          <StatusChip status="pass" label="instruments valid" />
        )}
      </div>

      {isDim ? (
        <SectionCard title="Recorded measurements" letter="M">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="py-1.5 pr-4 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-500">
                    #
                  </th>
                  <th className="py-1.5 pr-4 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-500">
                    Dimension
                  </th>
                  <th className="py-1.5 pr-4 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-500">
                    Nominal ± tol
                  </th>
                  {Array.from({ length: 5 }, (_, i) => (
                    <th
                      key={i}
                      className="py-1.5 pr-4 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-500"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(dimensional.data ?? []).map((r) => {
                  const rowFails = r.values.some(
                    (v) =>
                      v !== null && (v < r.nominal - r.tol_minus || v > r.nominal + r.tol_plus),
                  );
                  const rowWarns = r.values.some(
                    (v) =>
                      v !== null &&
                      (v < r.nominal - 0.8 * r.tol_minus || v > r.nominal + 0.8 * r.tol_plus),
                  );
                  return (
                    <tr
                      key={r.id}
                      id={`row-${String(r.serial)}`}
                      className={`border-b border-ink-100 ${
                        rowFails ? "bg-status-fail-bg" : rowWarns ? "bg-status-warn-bg" : ""
                      }`}
                    >
                      <td className="measurement py-1.5 pr-4 text-ink-500">{String(r.serial)}</td>
                      <td className="py-1.5 pr-4 font-medium text-ink-900">{r.label}</td>
                      <td className="measurement py-1.5 pr-4 text-ink-700">
                        {String(r.nominal)} ±{String(r.tol_plus)}/{String(r.tol_minus)}
                      </td>
                      {r.values.map((v, i) => (
                        <td key={i} className="measurement py-1.5 pr-4 text-ink-900">
                          {v === null ? "—" : String(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Read-only — this is the exact record the inspector submitted; evaluations re-derive
            live.
          </p>
        </SectionCard>
      ) : null}

      {!isDim && coating.data !== undefined ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["INSIDE", "OUTSIDE"] as const).map((side) => {
            const nominal =
              side === "INSIDE"
                ? (spec.data?.dft_nominal_um_inside ?? 240)
                : (spec.data?.dft_nominal_um_outside ?? 180);
            const stats = computeDftStats(coating.data[side], nominal);
            const iso = evaluateIso19840(stats);
            return (
              <SectionCard
                key={side}
                title={`${side === "INSIDE" ? "Inside" : "Outside"} grid`}
                letter="D"
              >
                <div className="mb-2 flex items-center justify-between">
                  <Caption>
                    nominal {String(nominal)} µm · avg {stats.mean.toFixed(1)} · σ{" "}
                    {stats.stdDev.toFixed(2)}
                  </Caption>
                  <StatusChip
                    status={
                      iso.compliant
                        ? "pass"
                        : iso.reason === "insufficient-readings"
                          ? "info"
                          : "fail"
                    }
                    label={
                      iso.compliant
                        ? "ISO 19840 PASS"
                        : iso.reason === "insufficient-readings"
                          ? "MIN 5"
                          : "80/200 FAIL"
                    }
                  />
                </div>
                <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
                  {coating.data[side].map((v, i) => {
                    const flagged = v !== null && (v < 0.8 * nominal || v > 2 * nominal);
                    return (
                      <span
                        key={i}
                        className={`measurement rounded-xs border px-1 py-0.5 text-center text-xs ${
                          flagged
                            ? "border-status-fail-fg bg-status-fail-bg text-status-fail-fg"
                            : v !== null
                              ? "border-ink-200 bg-paper-sunken text-ink-900"
                              : "border-ink-100 text-ink-500"
                        }`}
                      >
                        {v === null ? "—" : String(v)}
                      </span>
                    );
                  })}
                </div>
              </SectionCard>
            );
          })}
          <SectionCard title="Visual inspection (COAT-07)" letter="E" className="lg:col-span-2">
            <ul className="grid grid-cols-2 gap-1 text-sm md:grid-cols-5">
              {DEFECTS.map(([key, label]) => (
                <li key={key} className="flex items-center gap-2">
                  <StatusChip
                    status={coating.data.visual[key] === true ? "fail" : "pass"}
                    label={coating.data.visual[key] === true ? `${label}: ✕` : `${label}: ✓`}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ) : null}

      {/* Expired-instrument acknowledgement (step 7, EQ-03) — QH must ack. */}
      {flags.expiredInstruments > 0 ? (
        <div
          id="expired-ack"
          className="rounded-sm border border-status-fail-fg bg-status-fail-bg p-4"
        >
          <p className="text-sm font-medium text-status-fail-fg">
            ⚠ {String(flags.expiredInstruments)} reading(s) taken with an EXPIRED instrument.
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={expiredAck}
              onChange={(e) => {
                setExpiredAck(e.target.checked);
              }}
            />
            I acknowledge the expired-instrument use; my identity is logged with this decision
            (EQ-03).
          </label>
        </div>
      ) : null}

      {/* Pinned action bar (§6.8) — Approve/Reject never offered to the author. */}
      <div className="sticky bottom-0 z-30 -mx-6 border-t border-ink-300 bg-paper-raised px-6 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <SignOffBlock
            role="Quality Head"
            name={profile?.full_name ?? d.inspector_name}
            cert="NACE CIP Level 2"
            signedAtIso={null}
            pending
          />
          {showButtons ? (
            <div className="flex items-center gap-2">
              {/* Phase 6 entry point: the controlled report previews read-only
                  for any status; the print/export act itself is gated on
                  APPROVED inside the report route (PDF-01 + edge 6.9). */}
              <Button
                variant="secondary"
                onClick={() => {
                  void navigate({ to: "/reports/$batchId", params: { batchId } });
                }}
                title="Open the controlled report (ST/QC/02 · ST/QC/04)"
              >
                <Printer size={14} className="mr-1 inline" /> Report
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDecision("REJECT");
                }}
              >
                Reject…
              </Button>
              <Button
                onClick={() => {
                  setDecision("APPROVE");
                }}
              >
                <Gavel size={14} className="mr-1 inline" /> Approve &amp; Sign
              </Button>
            </div>
          ) : (
            <span className="text-xs text-ink-500">
              Read-only — decisions reserved to Quality Head.
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------- Modals ------------------------------ */}
      {decision === "APPROVE" ? (
        <ApproveModal
          flags={flags}
          flagsAck={flagsAck}
          onFlagsAck={setFlagsAck}
          expiredAcked={expiredAck}
          submitting={submitting}
          btMfaMessage={mfaNotice}
          onConfirm={() => void submitDecision()}
          onCancel={() => {
            setDecision(null);
          }}
        />
      ) : null}
      {decision === "REJECT" ? (
        <RejectModal
          comments={comments}
          onComments={setComments}
          submitting={submitting}
          btMfaMessage={mfaNotice}
          onConfirm={() => void submitDecision()}
          onCancel={() => {
            setDecision(null);
          }}
        />
      ) : null}

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
