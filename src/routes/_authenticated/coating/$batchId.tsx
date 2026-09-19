import { useEffect, useMemo, useState } from "react";
import { SurfacePrepSection, PaintLogSection } from "@/components/coating/CoatingSections";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftToLine, ChevronLeft, ChevronRight, FilePlus2, Send } from "lucide-react";
import { getBatchHeader } from "@/lib/api/batches";
import { getCoatingSpec, submitCoatingBatch, dftBreachCounts } from "@/lib/api/coating";
import { useCoatingStore } from "@/lib/store/coating-store";
import type { CoatingDraft, VisualCheckState } from "@/lib/dexie/db";
import {
  coatingSubmissionChecklist,
  canSubmitCoating,
  evaluatePsychroGate,
  parseCoatingNumber,
  shelfLifeBlocks,
  shelfLifeStatus,
} from "@/domain/coating";
import { computeDftStats } from "@/domain/dft-stats";
import { NcrDraftDialog } from "@/components/ncr/NcrDraftDialog";
import { WizardRail } from "@/components/ui/CompliancePanel";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Caption, StatusChip } from "@/components/ui/StatusChip";
import { SaveIndicator } from "@/components/ui/SaveIndicator";
import { Toast } from "@/components/ui/DataTable";
import { PsychrometricPanel, DftPanel } from "@/components/coating/CoatingPanels";

export const Route = createFileRoute("/_authenticated/coating/$batchId")({
  component: CoatingWizardPage,
});

const STEPS = ["Surface prep", "Conditions", "Paint log", "DFT grids", "Visual + submit"];

function emptyCoats(): CoatingDraft["coats"] {
  return [1, 2, 3].map((coatNo) => ({
    coatNo,
    product: "",
    mfgDate: null,
    partABatch: "",
    partBBatch: "",
    thinnerPercent: null,
    wftUm: [null, null, null],
  }));
}

function emptyVisual(): VisualCheckState {
  return { pinholes: null, sagging: null, gloss_loss: null, peel_off: null, blisters: null };
}

function defaultSurfacePrep(): CoatingDraft["surfacePrep"] {
  return {
    steelGrade: "MS Sheet Fabrication",
    blastMethod: "Abrasive Blast Cleaning",
    blastGrade: "Sa 2.5",
    gritSize: "G-40",
    weldEdgeOk: false,
    solventCleanOk: false,
    waterBreakPass: false,
    comparatorGrade: null,
    profileUm: null,
    gaugeInstrumentId: null,
  };
}

/**
 * Coating wizard — Critical Journey #3 (execution-plan Phase 4 steps 2–8,
 * ui-ux-plan §7.3). Forward Continue is gated per section; the psychro lock
 * (`ΔT < 3.0 °C` OR `RH > 85 %`) hard-blocks Section B's Continue AND the
 * final submit. Every verdict is derived live — nothing is stored client-side
 * (edge 4.7); the server re-derives at submit (client gates = UX).
 */
function CoatingWizardPage() {
  const { batchId } = useParams({ from: "/_authenticated/coating/$batchId" });
  if (typeof batchId !== "string" || batchId === "") return null; // route invariant
  const navigate = useNavigate();
  const draft = useCoatingStore((s) => s.draft);
  const hydrated = useCoatingStore((s) => s.hydrated);
  const lastWriteAt = useCoatingStore((s) => s.lastWriteAt);
  const stolen = useCoatingStore((s) => s.stolenByOtherTab);
  const [tick, setTick] = useState(0);
  const [ack, setAck] = useState(false);
  const [ncrOpen, setNcrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    title: string;
    desc: string;
    status: "pass" | "warn" | "fail";
  } | null>(null);

  // Raw psychro strings — the decimal-comma mask lives in the panel; the
  // numbers land in the store only when parseable (partial input is kept).
  const [raw, setRaw] = useState({ steel: "", ambient: "", rh: "" });

  useEffect(() => {
    void useCoatingStore
      .getState()
      .hydrate(batchId)
      .then((existing) => {
        if (existing !== null) {
          setRaw({
            steel:
              existing.conditions.steelTempC === null ? "" : String(existing.conditions.steelTempC),
            ambient:
              existing.conditions.ambientTempC === null
                ? ""
                : String(existing.conditions.ambientTempC),
            rh:
              existing.conditions.relativeHumidity === null
                ? ""
                : String(existing.conditions.relativeHumidity),
          });
          return;
        }
        void (async () => {
          const header = await getBatchHeader(batchId);
          if (header === null || header.status !== "DRAFT") return;
          useCoatingStore.getState().load({
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
            surfacePrep: defaultSurfacePrep(),
            conditions: { steelTempC: null, ambientTempC: null, relativeHumidity: null },
            coats: emptyCoats(),
            dft: { INSIDE: Array(26).fill(null), OUTSIDE: Array(26).fill(null) },
            visual: emptyVisual(),
            step: 0,
            savedAt: new Date(0).toISOString(),
          });
        })();
      });
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

  const spec = useQuery({
    queryKey: ["coating-spec", draft?.header.revision_id],
    queryFn: () => getCoatingSpec(draft?.header.revision_id ?? ""),
    enabled: draft !== null,
  });

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

  // ----- Derived verdicts (ƒx — recomputed every render, never stored) -----
  const derived = useMemo(() => {
    if (draft === null) return null;
    const { steelTempC, ambientTempC, relativeHumidity } = draft.conditions;
    const conditionsEntered =
      steelTempC !== null && ambientTempC !== null && relativeHumidity !== null;
    // conditionsEntered already proves all three are non-null.
    const gate = conditionsEntered
      ? evaluatePsychroGate(steelTempC, ambientTempC, relativeHumidity)
      : null;
    const surfacePrepComplete =
      draft.surfacePrep.comparatorGrade !== null &&
      draft.surfacePrep.profileUm !== null &&
      draft.surfacePrep.weldEdgeOk &&
      draft.surfacePrep.solventCleanOk &&
      draft.surfacePrep.waterBreakPass;
    const coatsComplete = draft.coats.every(
      (c) => c.product.trim() !== "" && c.partABatch.trim() !== "",
    );
    // COAT-04: any coat whose Part A is past shelf-life hard-blocks submit.
    const today = new Date().toISOString().slice(0, 10);
    const shelfLifeBlocked = draft.coats.some((c) =>
      shelfLifeBlocks(shelfLifeStatus(c.mfgDate, 12, today)),
    );
    const insideCount = computeDftStats(draft.dft.INSIDE, 240).count;
    const outsideCount = computeDftStats(draft.dft.OUTSIDE, 180).count;
    const visualChecksComplete = Object.values(draft.visual).every((v) => v !== null);
    return {
      conditionsEntered,
      psychroLocked: gate?.locked ?? false,
      gate,
      surfacePrepComplete,
      coatsComplete,
      shelfLifeBlocked,
      dftCounts: { INSIDE: insideCount, OUTSIDE: outsideCount },
      visualChecksComplete,
    };
  }, [draft]);

  const breaches = useMemo(
    () =>
      draft !== null && spec.data !== null && spec.data !== undefined
        ? dftBreachCounts(draft, spec.data)
        : { INSIDE: 0, OUTSIDE: 0 },
    [draft, spec.data],
  );

  const checklist = useMemo(() => {
    if (derived === null) return [];
    const items = coatingSubmissionChecklist({
      surfacePrepComplete: derived.surfacePrepComplete,
      conditionsEntered: derived.conditionsEntered,
      psychroLocked: derived.psychroLocked,
      coatsComplete: derived.coatsComplete,
      shelfLifeBlocked: derived.shelfLifeBlocked,
      dftCounts: derived.dftCounts,
      partialDftAcknowledged: ack,
      visualChecksComplete: derived.visualChecksComplete,
    });
    // Client mirror of the submit RPC's 80/200 BT_LOCK (migration 005): any
    // breach is a coating verdict FAIL — NCR, not submit (COAT-06/edge 4.9).
    const breachTotal = breaches.INSIDE + breaches.OUTSIDE;
    return breachTotal > 0
      ? [
          ...items,
          {
            id: "dft-breach",
            label: `✕ ISO 19840 80/200 breach (${String(breachTotal)} reading(s)) — coating verdict FAIL; draft an NCR`,
            done: false,
            kind: "gate" as const,
          },
        ]
      : items;
  }, [derived, breaches, ack]);

  const canSubmit = canSubmitCoating(checklist);
  const blockedCount = checklist.filter((i) => i.kind === "gate" && !i.done).length;

  // Forward gating per section (step 8: back-free, forward gated).
  const sectionDone = (step: number): boolean => {
    if (derived === null) return false;
    switch (step) {
      case 0:
        return derived.surfacePrepComplete;
      case 1:
        return derived.conditionsEntered && !derived.psychroLocked; // journey #3 gate
      case 2:
        return derived.coatsComplete;
      case 3:
        return derived.dftCounts.INSIDE >= 5 && derived.dftCounts.OUTSIDE >= 5;
      default:
        return derived.visualChecksComplete;
    }
  };

  function setConditionsFromRaw(field: "steel" | "ambient" | "rh", value: string): void {
    setRaw({ ...raw, [field]: value });
    const parsed = parseCoatingNumber(value);
    if (field === "steel") useCoatingStore.getState().setConditions({ steelTempC: parsed });
    else if (field === "ambient")
      useCoatingStore.getState().setConditions({ ambientTempC: parsed });
    else useCoatingStore.getState().setConditions({ relativeHumidity: parsed });
  }

  async function submit(): Promise<void> {
    if (draft === null || spec.data === null || spec.data === undefined || !canSubmit) return;
    setSubmitting(true);
    try {
      const result = await submitCoatingBatch(draft, {
        dft_nominal_um_inside: spec.data.dft_nominal_um_inside,
        dft_nominal_um_outside: spec.data.dft_nominal_um_outside,
      });
      if (result.kind === "submitted") {
        await useCoatingStore.getState().purge(draft.batchId);
        await navigate({ to: "/" });
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

  const mutatedAt = useCoatingStore((s) => s.mutatedAt);

  if (hydrated && draft === null) {
    return (
      <SectionCard title="Batch not found" letter="!">
        <p className="text-sm text-ink-700">
          No DRAFT coating batch with this id — it may already be submitted. Check the{" "}
          <Link to="/" className="text-accent hover:underline">
            dashboard
          </Link>
          .
        </p>
      </SectionCard>
    );
  }
  if (draft === null || derived === null) return <Caption>loading…</Caption>;

  const today = new Date().toISOString().slice(0, 10);
  const step = draft.step;
  const anyVisualFail = Object.values(draft.visual).some((v) => v === "fail");
  const anyPartial = derived.dftCounts.INSIDE < 26 || derived.dftCounts.OUTSIDE < 26;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            <span className="measurement">{draft.header.item_code}</span> — coating inspection
          </h1>
          <Caption>
            PO {draft.header.po_number} · lot {draft.header.delivery_batch_code} ·{" "}
            <SaveIndicator lastWriteAt={lastWriteAt} dirtyAt={mutatedAt} tick={tick} />
          </Caption>
        </div>
        <Link to="/" className="text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeftToLine size={14} className="mr-1 inline" /> Dashboard
        </Link>
      </div>

      {stolen ? <StatusChip status="locked" label="OPENED IN ANOTHER TAB — READ ONLY" /> : null}

      <div className="grid grid-cols-[220px_1fr] gap-6">
        <WizardRail
          steps={STEPS}
          current={step}
          onStepClick={(i) => {
            useCoatingStore.getState().setStep(i);
          }}
        />

        <div className="min-w-0 space-y-4">
          {/* ---------------- Section A — surface prep (COAT-01/02) ---------- */}
          {step === 0 ? (
            <SurfacePrepSection
              surfacePrep={draft.surfacePrep}
              instruments={instruments.data ?? []}
              disabled={stolen}
            />
          ) : null}

          {/* ------------- Section B — psychrometrics (COAT-03) ------------- */}
          {step === 1 ? (
            <PsychrometricPanel
              steelRaw={raw.steel}
              ambientRaw={raw.ambient}
              rhRaw={raw.rh}
              onChange={setConditionsFromRaw}
              disabled={stolen}
            />
          ) : null}

          {/* ------------- Section C — paint log (COAT-04) ------------------ */}
          {step === 2 ? (
            <PaintLogSection coats={draft.coats} today={today} disabled={stolen} />
          ) : null}

          {/* ------------- Section D — DFT grids (COAT-05/06) --------------- */}
          {step === 3 ? (
            <div className="space-y-4">
              <DftPanel
                sideLabel="Inside"
                system={spec.data?.system_inside ?? "C4 High"}
                nominal={spec.data?.dft_nominal_um_inside ?? 240}
                readings={draft.dft.INSIDE}
                disabled={stolen}
                onChange={(i, v) => {
                  useCoatingStore.getState().setDft("INSIDE", i, v);
                }}
              />
              <DftPanel
                sideLabel="Outside"
                system={spec.data?.system_outside ?? "C3 High"}
                nominal={spec.data?.dft_nominal_um_outside ?? 180}
                readings={draft.dft.OUTSIDE}
                disabled={stolen}
                onChange={(i, v) => {
                  useCoatingStore.getState().setDft("OUTSIDE", i, v);
                }}
              />
              <Caption>Gauge: edge 4.12 — the Section A profile gauge serves both grids</Caption>
            </div>
          ) : null}

          {/* -------- Section E — visual + submit (COAT-07, edge 4.18) ------ */}
          {step === 4 ? (
            <div className="space-y-4">
              <SectionCard
                letter="E"
                title={`Visual inspection — ${String(
                  Object.values(draft.visual).filter((v) => v !== null).length,
                )}/5 answered`}
              >
                {/* G3: 44px tri-state buttons — a gloved thumb answers on the
                    shop floor faster than a select. Edge 4.18: unanswered is
                    its own state, never implicitly "no defect". */}
                <div className="space-y-2">
                  {(
                    [
                      ["pinholes", "Pinholes"],
                      ["sagging", "Sagging"],
                      ["gloss_loss", "Gloss loss"],
                      ["peel_off", "Peel-off"],
                      ["blisters", "Blisters"],
                    ] as const
                  ).map(([key, label]) => {
                    const value = draft.visual[key];
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-xs border border-ink-200 px-3 py-1.5"
                      >
                        <span className="text-sm font-medium text-ink-900">{label}</span>
                        <div className="flex gap-1.5">
                          {(
                            [
                              ["pass", "✓ Free of defect", "pass"],
                              ["fail", "✕ Defect present", "fail"],
                            ] as const
                          ).map(([v, lbl, glyph]) => {
                            const selected = value === v;
                            const tone =
                              glyph === "pass"
                                ? selected
                                  ? "border-status-pass-fg bg-status-pass-bg text-status-pass-fg"
                                  : "border-ink-300 text-ink-700 hover:border-status-pass-fg"
                                : selected
                                  ? "border-status-fail-fg bg-status-fail-bg text-status-fail-fg"
                                  : "border-ink-300 text-ink-700 hover:border-status-fail-fg";
                            return (
                              <button
                                key={v}
                                type="button"
                                aria-pressed={selected}
                                disabled={stolen}
                                onClick={() => {
                                  useCoatingStore
                                    .getState()
                                    .setVisualCheck(key, selected ? null : v);
                                }}
                                className={`h-11 min-w-44 rounded-xs border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${tone}`}
                              >
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-ink-500">
                    Tap again to clear an answer — an unanswered check is never implicitly “no
                    defect” (edge 4.18).
                  </p>
                </div>
              </SectionCard>

              {anyVisualFail ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setNcrOpen(true);
                  }}
                >
                  <FilePlus2 size={14} className="mr-1 inline" /> Draft NCR for visual defect
                </Button>
              ) : null}

              {anyPartial ? (
                <label className="flex items-center gap-2 text-sm text-ink-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={ack}
                    disabled={stolen}
                    onChange={(e) => {
                      setAck(e.target.checked);
                    }}
                  />
                  I acknowledge the DFT grids are partial — Quality Head will see the flag (edge
                  4.11)
                </label>
              ) : null}

              <SectionCard title="Submission checklist" letter="✓">
                <ul className="space-y-1 text-sm">
                  {checklist.map((i) => (
                    <li
                      key={i.id}
                      className={
                        i.kind === "warning"
                          ? "text-status-warn-fg"
                          : i.done
                            ? "text-status-pass-fg"
                            : "font-medium text-status-fail-fg"
                      }
                    >
                      {i.kind === "warning" ? "▲" : i.done ? "✓" : "✕"} {i.label}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          ) : null}

          {/* ------------------------ Wizard controls ----------------------- */}
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              disabled={step === 0}
              onClick={() => {
                useCoatingStore.getState().setStep(Math.max(0, step - 1));
              }}
            >
              <ChevronLeft size={14} className="mr-1 inline" /> Back
            </Button>
            {step < 4 ? (
              <Button
                disabled={!sectionDone(step)}
                title={
                  sectionDone(step)
                    ? undefined
                    : "Complete this section to continue — the lock-out gate blocks Section B"
                }
                onClick={() => {
                  useCoatingStore.getState().setStep(Math.min(4, step + 1));
                }}
              >
                Continue <ChevronRight size={14} className="ml-1 inline" />
              </Button>
            ) : (
              <Button
                disabled={!canSubmit || submitting || stolen}
                title={blockedCount > 0 ? `${String(blockedCount)} gate(s) outstanding` : undefined}
                onClick={() => void submit()}
              >
                <Send size={14} className="mr-1 inline" /> Submit for review
              </Button>
            )}
          </div>
        </div>
      </div>

      <NcrDraftDialog
        open={ncrOpen}
        onOpenChange={setNcrOpen}
        batchId={batchId}
        source="COATING"
        presetDescription={`Visual defect present: ${Object.entries(draft.visual)
          .filter(([, v]) => v === "fail")
          .map(([k]) => k)
          .join(", ")}`}
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
