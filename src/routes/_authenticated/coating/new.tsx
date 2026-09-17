import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listItems } from "@/lib/api/admin";
import { latestRevisionForItem, getBatchHeader } from "@/lib/api/batches";
import { createCoatingBatch, getCoatingSpec } from "@/lib/api/coating";
import { batchHeaderSchema } from "@/domain/schemas";
import { useCoatingStore } from "@/lib/store/coating-store";
import type { CoatingDraft } from "@/lib/dexie/db";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption, StatusChip } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/_authenticated/coating/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: NewCoatingPage,
});

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

/**
 * New coating batch — execution-plan Phase 4 step 1 + ui-ux-plan §6.6:
 * `?from=<dimensional batch id>` links the flows — the header then renders
 * `ƒx inherited` read-only (divergence structurally impossible — the audit
 * defect fix). Without `from`, the standalone header form applies.
 */
function NewCoatingPage() {
  const navigate = useNavigate();
  const { from } = Route.useSearch();
  const items = useQuery({ queryKey: ["items", ""], queryFn: () => listItems("") });
  const linkedHeader = useQuery({
    queryKey: ["batch-header", from],
    queryFn: () => getBatchHeader(from as string),
    enabled: from !== undefined,
  });

  const [selected, setSelected] = useState<{
    id: string;
    item_code: string;
    customer_name: string;
  } | null>(null);
  const [header, setHeader] = useState({
    po_number: "",
    delivery_batch_code: "",
    inspection_date: "",
    lot_quantity: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // ƒx inherited values win when linked; the form state is only a fallback.
  const linked = from !== undefined ? (linkedHeader.data ?? null) : null;
  const effective = {
    po_number: linked?.po_number ?? header.po_number,
    delivery_batch_code: linked?.delivery_batch_code ?? header.delivery_batch_code,
    inspection_date: linked?.inspection_date ?? header.inspection_date,
    lot_quantity: linked !== null ? String(linked.lot_qty) : header.lot_quantity,
  };

  async function start(): Promise<void> {
    if (selected === null) return;
    const parsed = batchHeaderSchema.safeParse({
      poNumber: effective.po_number,
      deliveryBatchCode: effective.delivery_batch_code,
      inspectionDate: effective.inspection_date,
      lotQuantity: Number(effective.lot_quantity),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((iss) => {
        fieldErrors[String(iss.path[0])] = iss.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      const revision = await latestRevisionForItem(selected.id);
      if (revision === null) {
        setApiError(
          "This item has no drawing revision yet — publish one in the Item Master first.",
        );
        return;
      }
      const spec = await getCoatingSpec(revision.id);
      if (spec === null) {
        setApiError(
          "This revision has no coating spec — define it before starting a coating batch.",
        );
        return;
      }
      const batchId = await createCoatingBatch({
        item_id: selected.id,
        revision_id: revision.id,
        po_number: parsed.data.poNumber,
        delivery_batch_code: parsed.data.deliveryBatchCode,
        inspection_date: parsed.data.inspectionDate,
        lot_quantity: parsed.data.lotQuantity,
      });
      useCoatingStore.getState().load({
        batchId,
        header: {
          item_id: selected.id,
          revision_id: revision.id,
          item_code: selected.item_code,
          po_number: parsed.data.poNumber,
          delivery_batch_code: parsed.data.deliveryBatchCode,
          inspection_date: parsed.data.inspectionDate,
          lot_quantity: parsed.data.lotQuantity,
        },
        fxGrade: "C3",
        surfacePrep: {
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
        },
        conditions: { steelTempC: null, ambientTempC: null, relativeHumidity: null },
        coats: emptyCoats(),
        dft: { INSIDE: Array(26).fill(null), OUTSIDE: Array(26).fill(null) },
        visual: {
          pinholes: null,
          sagging: null,
          gloss_loss: null,
          peel_off: null,
          blisters: null,
        },
        step: 0,
        savedAt: new Date(0).toISOString(),
      });
      await navigate({ to: "/coating/$batchId", params: { batchId } });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Could not create the batch");
    } finally {
      setBusy(false);
    }
  }

  const inheritedRow = (label: string, value: string, mono = false) => (
    <div className="flex items-center gap-3">
      <span className="w-[140px] shrink-0 text-sm font-medium text-ink-700">{label}</span>
      <span className={`measurement text-sm text-ink-900 ${mono ? "" : ""}`}>{value}</span>
      <StatusChip status="info" label="ƒX INHERITED" />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold">New coating batch</h1>

      <SectionCard title="Item" letter="A">
        {selected === null ? (
          <div className="space-y-2">
            {items.isLoading ? <Caption>loading…</Caption> : null}
            {(items.data ?? []).slice(0, 12).map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setSelected({
                    id: it.id,
                    item_code: it.item_code,
                    customer_name: it.customer_name,
                  });
                }}
                className="flex w-full items-center justify-between rounded-sm border border-ink-200 px-3 py-2 text-left text-sm hover:bg-paper-sunken"
              >
                <span className="measurement font-medium">{it.item_code}</span>
                <span className="text-ink-500">
                  {it.customer_name} · {it.drawing_number}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm">
              <span className="measurement font-medium">{selected.item_code}</span>
              <span className="ml-3 text-ink-500">{selected.customer_name}</span>
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(null);
              }}
            >
              Change
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Batch header" letter="B">
        {linked !== null ? (
          <div className="space-y-3">
            {inheritedRow("PO number", linked.po_number)}
            {inheritedRow("Delivery batch", linked.delivery_batch_code, true)}
            {inheritedRow("Inspection date", linked.inspection_date, true)}
            {inheritedRow("Lot quantity", String(linked.lot_qty), true)}
            <p className="text-xs text-ink-500">
              Inherited from dimensional batch — values cannot diverge.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <FormRow label="PO number" htmlFor="po" error={errors.poNumber}>
              <TextInput
                id="po"
                value={header.po_number}
                onChange={(e) => {
                  setHeader({ ...header, po_number: e.target.value });
                }}
              />
            </FormRow>
            <FormRow
              label="Delivery batch"
              htmlFor="lot"
              helper="Format 2609-01 (YYMM-lot)"
              error={errors.deliveryBatchCode}
            >
              <TextInput
                id="lot"
                className="measurement"
                placeholder="2609-01"
                value={header.delivery_batch_code}
                onChange={(e) => {
                  setHeader({ ...header, delivery_batch_code: e.target.value });
                }}
              />
            </FormRow>
            <FormRow label="Inspection date" htmlFor="date" error={errors.inspectionDate}>
              <TextInput
                id="date"
                type="date"
                value={header.inspection_date}
                onChange={(e) => {
                  setHeader({ ...header, inspection_date: e.target.value });
                }}
              />
            </FormRow>
            <FormRow label="Lot quantity" htmlFor="qty" error={errors.lotQuantity}>
              <TextInput
                id="qty"
                inputMode="numeric"
                className="measurement"
                value={header.lot_quantity}
                onChange={(e) => {
                  setHeader({ ...header, lot_quantity: e.target.value });
                }}
              />
            </FormRow>
          </div>
        )}
      </SectionCard>

      {apiError !== null ? (
        <p className="text-sm font-medium text-status-fail-fg">✕ {apiError}</p>
      ) : null}
      <Button onClick={() => void start()} disabled={selected === null || busy}>
        Start Coating Wizard →
      </Button>
    </div>
  );
}
