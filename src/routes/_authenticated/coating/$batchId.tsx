import { useEffect, useMemo, useState } from "react";
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
} from "@/domain/coating";
import { computeDftStats } from "@/domain/dft-stats";
import { WizardRail } from "@/components/ui/CompliancePanel";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption, StatusChip } from "@/components/ui/StatusChip";
import { Toast } from "@/components/ui/DataTable";
import {
  PsychrometricPanel,
  DftPanel,
  ShelfLifeChip,
  ProfileVerdictChip,
  WftVerdictChip,
} from "@/components/coating/CoatingPanels";

export const Route = createFileRoute("/_authenticated/coating/$batchId")({
  component: CoatingWizardPage,
});

const STEPS = ["Surface prep", "Conditions", "Paint log", "DFT grids", "Visual + submit"];

const selectClass =
  "h-9 w-full rounded-xs border border-ink-300 bg-paper-raised px-2 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50";

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
  const [, setTick] = useState(0);
  const [ack, setAck] = useState(false);
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
            fxGrade: "C3",
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
    const insideCount = computeDftStats(draft.dft.INSIDE, 240).count;
    const outsideCount = computeDftStats(draft.dft.OUTSIDE, 180).count;
    const visualChecksComplete = Object.values(draft.visual).every((v) => v !== null);
    return {
      conditionsEntered,
      psychroLocked: gate?.locked ?? false,
      gate,
      surfacePrepComplete,
      coatsComplete,
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

  const savedAgo =
    lastWriteAt === null
      ? "not saved yet"
      : `${String(Math.max(0, Math.round((Date.now() - lastWriteAt) / 1000)))}s ago`;

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
            PO {draft.header.po_number} · lot {draft.header.delivery_batch_code} · saved {savedAgo}
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
            <SectionCard letter="A" title="Surface preparation">
              <div className="space-y-4">
                <FormRow label="Steel grade" htmlFor="sp-steel">
                  <TextInput
                    id="sp-steel"
                    value={draft.surfacePrep.steelGrade}
                    disabled={stolen}
                    onChange={(e) => {
                      useCoatingStore.getState().setSurfacePrep({ steelGrade: e.target.value });
                    }}
                  />
                </FormRow>
                <FormRow label="Blast method" htmlFor="sp-method">
                  <TextInput
                    id="sp-method"
                    value={draft.surfacePrep.blastMethod}
                    disabled={stolen}
                    onChange={(e) => {
                      useCoatingStore.getState().setSurfacePrep({ blastMethod: e.target.value });
                    }}
                  />
                </FormRow>
                <div className="grid grid-cols-2 gap-4">
                  <FormRow label="Blast grade" htmlFor="sp-grade" helper="ISO 8501-1">
                    <TextInput
                      id="sp-grade"
                      value={draft.surfacePrep.blastGrade}
                      disabled={stolen}
                      onChange={(e) => {
                        useCoatingStore.getState().setSurfacePrep({ blastGrade: e.target.value });
                      }}
                    />
                  </FormRow>
                  <FormRow label="Grit size" htmlFor="sp-grit">
                    <TextInput
                      id="sp-grit"
                      value={draft.surfacePrep.gritSize}
                      disabled={stolen}
                      onChange={(e) => {
                        useCoatingStore.getState().setSurfacePrep({ gritSize: e.target.value });
                      }}
                    />
                  </FormRow>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-ink-700">
                    Pre-treatment verification (ISO 8501-3 P-2 / ISO 12944-4)
                  </legend>
                  {(
                    [
                      ["weldEdgeOk", "Welds / edges dressed smooth (P-2)"],
                      ["solventCleanOk", "Solvent clean per ISO 12944-4"],
                      ["waterBreakPass", "Water break test — no beading"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-ink-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={draft.surfacePrep[key]}
                        disabled={stolen}
                        onChange={(e) => {
                          useCoatingStore.getState().setSurfacePrep({ [key]: e.target.checked });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <FormRow
                  label="Profile µm"
                  htmlFor="sp-profile"
                  helper="Comparator G, Medium — working band 45–75 µm (COAT-02)"
                >
                  <div className="flex items-center gap-3">
                    <TextInput
                      id="sp-profile"
                      inputMode="decimal"
                      className="measurement max-w-[140px]"
                      value={
                        draft.surfacePrep.profileUm === null
                          ? ""
                          : String(draft.surfacePrep.profileUm)
                      }
                      disabled={stolen}
                      onChange={(e) => {
                        useCoatingStore
                          .getState()
                          .setSurfacePrep({ profileUm: parseCoatingNumber(e.target.value) });
                      }}
                    />
                    <ProfileVerdictChip valueUm={draft.surfacePrep.profileUm} />
                  </div>
                </FormRow>
                <FormRow
                  label="Profile gauge"
                  htmlFor="sp-gauge"
                  helper="Edge 4.12: per batch, shown on both DFT panels"
                >
                  <select
                    id="sp-gauge"
                    className={selectClass}
                    value={draft.surfacePrep.gaugeInstrumentId ?? ""}
                    disabled={stolen}
                    onChange={(e) => {
                      useCoatingStore
                        .getState()
                        .setSurfacePrep({
                          gaugeInstrumentId: e.target.value === "" ? null : e.target.value,
                        });
                    }}
                  >
                    <option value="">— select instrument —</option>
                    {(instruments.data ?? []).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label}
                        {i.expired ? " (EXPIRED)" : ""}
                      </option>
                    ))}
                  </select>
                </FormRow>
              </div>
            </SectionCard>
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
            <div className="space-y-4">
              {draft.coats.map((coat, idx) => {
                const wftEntered = coat.wftUm.filter((w): w is number => w !== null);
                const wftAvg =
                  wftEntered.length > 0
                    ? wftEntered.reduce((s, v) => s + v, 0) / wftEntered.length
                    : null;
                return (
                  <SectionCard
                    key={coat.coatNo}
                    letter="C"
                    title={`Coat ${String(coat.coatNo)} — ${
                      coat.coatNo === 1
                        ? "Primer"
                        : coat.coatNo === 2
                          ? "Intermediate"
                          : "PU Finish"
                    }`}
                  >
                    <div className="space-y-4">
                      <FormRow label="Product" htmlFor={`c${String(idx)}-product`}>
                        <TextInput
                          id={`c${String(idx)}-product`}
                          value={coat.product}
                          disabled={stolen}
                          onChange={(e) => {
                            useCoatingStore
                              .getState()
                              .setCoat({ ...coat, product: e.target.value });
                          }}
                        />
                      </FormRow>
                      <FormRow
                        label="Part A mfg date"
                        htmlFor={`c${String(idx)}-mfg`}
                        helper="Shelf-life is validated from this date (COAT-04)"
                      >
                        <div className="flex items-center gap-3">
                          <TextInput
                            id={`c${String(idx)}-mfg`}
                            type="date"
                            className="max-w-[200px]"
                            value={coat.mfgDate ?? ""}
                            disabled={stolen}
                            onChange={(e) => {
                              useCoatingStore
                                .getState()
                                .setCoat({
                                  ...coat,
                                  mfgDate: e.target.value === "" ? null : e.target.value,
                                });
                            }}
                          />
                          <ShelfLifeChip mfgDate={coat.mfgDate} today={today} />
                        </div>
                      </FormRow>
                      <div className="grid grid-cols-2 gap-4">
                        <FormRow label="Part A batch" htmlFor={`c${String(idx)}-pa`}>
                          <TextInput
                            id={`c${String(idx)}-pa`}
                            className="measurement"
                            value={coat.partABatch}
                            disabled={stolen}
                            onChange={(e) => {
                              useCoatingStore
                                .getState()
                                .setCoat({ ...coat, partABatch: e.target.value });
                            }}
                          />
                        </FormRow>
                        <FormRow label="Part B hardener" htmlFor={`c${String(idx)}-pb`}>
                          <TextInput
                            id={`c${String(idx)}-pb`}
                            className="measurement"
                            value={coat.partBBatch}
                            disabled={stolen}
                            onChange={(e) => {
                              useCoatingStore
                                .getState()
                                .setCoat({ ...coat, partBBatch: e.target.value });
                            }}
                          />
                        </FormRow>
                      </div>
                      <FormRow
                        label="Thinner %"
                        htmlFor={`c${String(idx)}-th`}
                        helper="Advisory — recorded on the form"
                      >
                        <TextInput
                          id={`c${String(idx)}-th`}
                          inputMode="decimal"
                          className="measurement max-w-[140px]"
                          value={coat.thinnerPercent === null ? "" : String(coat.thinnerPercent)}
                          disabled={stolen}
                          onChange={(e) => {
                            useCoatingStore
                              .getState()
                              .setCoat({
                                ...coat,
                                thinnerPercent: parseCoatingNumber(e.target.value),
                              });
                          }}
                        />
                      </FormRow>
                      <FormRow
                        label="WFT µm"
                        helper="80–100 µm working band; mils land out-of-range (edge 4.15)"
                      >
                        <div className="flex items-center gap-3">
                          {coat.wftUm.map((w, wi) => (
                            <TextInput
                              key={wi}
                              inputMode="decimal"
                              className="measurement max-w-[100px]"
                              aria-label={`Coat ${String(coat.coatNo)} WFT reading ${String(wi + 1)}`}
                              value={w === null ? "" : String(w)}
                              disabled={stolen}
                              onChange={(e) => {
                                const next = [...coat.wftUm];
                                next[wi] = parseCoatingNumber(e.target.value);
                                useCoatingStore.getState().setCoat({ ...coat, wftUm: next });
                              }}
                            />
                          ))}
                          <WftVerdictChip valueUm={wftAvg} />
                        </div>
                      </FormRow>
                    </div>
                  </SectionCard>
                );
              })}
            </div>
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
              <SectionCard letter="E" title="Visual inspection">
                <div className="space-y-3">
                  {(
                    [
                      ["pinholes", "Pinholes"],
                      ["sagging", "Sagging"],
                      ["gloss_loss", "Gloss loss"],
                      ["peel_off", "Peel-off"],
                      ["blisters", "Blisters"],
                    ] as const
                  ).map(([key, label]) => (
                    <FormRow key={key} label={label} htmlFor={`v-${key}`}>
                      <select
                        id={`v-${key}`}
                        className={selectClass}
                        value={draft.visual[key] ?? ""}
                        disabled={stolen}
                        onChange={(e) => {
                          const v = e.target.value;
                          useCoatingStore
                            .getState()
                            .setVisualCheck(
                              key,
                              v === "pass" ? "pass" : v === "fail" ? "fail" : null,
                            );
                        }}
                      >
                        <option value="">— not answered —</option>
                        <option value="pass">Free of defect</option>
                        <option value="fail">Defect present</option>
                      </select>
                    </FormRow>
                  ))}
                  <p className="text-xs text-ink-500">
                    Edge 4.18: an unanswered check is never implicitly “no defect”.
                  </p>
                </div>
              </SectionCard>

              {anyVisualFail ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setToast({
                      title: "NCR draft",
                      desc: "NCR authoring arrives with Phase 8 — the defect record is kept either way.",
                      status: "warn",
                    });
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
