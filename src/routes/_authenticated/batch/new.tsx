import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listItems } from "@/lib/api/admin";
import { createBatchDraft, latestRevisionForItem, listDimensionRows } from "@/lib/api/batches";
import { batchHeaderSchema } from "@/domain/schemas";
import { useInspectionStore } from "@/lib/store/inspection-store";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption } from "@/components/ui/StatusChip";

export const Route = createFileRoute("/_authenticated/batch/new")({
  component: NewBatchPage,
});

/**
 * New-batch flow — execution-plan.md Phase 3 step 1 + ui-ux-plan §6.5:
 * item picker (recent first), Zod-validated header (PO, delivery code
 * YYMM-lot, date, lot qty), then "Load Inspection Grid".
 */
function NewBatchPage() {
  const navigate = useNavigate();
  const items = useQuery({ queryKey: ["items", ""], queryFn: () => listItems("") });

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

  async function start(): Promise<void> {
    if (selected === null) return;
    const parsed = batchHeaderSchema.safeParse({
      poNumber: header.po_number,
      deliveryBatchCode: header.delivery_batch_code,
      inspectionDate: header.inspection_date,
      lotQuantity: Number(header.lot_quantity),
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
      const rows = await listDimensionRows(revision.id);
      if (rows.length === 0) {
        setApiError(
          "This revision has no dimension rows — add them in the Item Master before inspecting.",
        );
        return;
      }
      const batchId = await createBatchDraft({
        item_id: selected.id,
        revision_id: revision.id,
        po_number: parsed.data.poNumber,
        delivery_batch_code: parsed.data.deliveryBatchCode,
        inspection_date: parsed.data.inspectionDate,
        lot_quantity: parsed.data.lotQuantity,
      });
      useInspectionStore.getState().load({
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
      await navigate({ to: "/batch/$batchId", params: { batchId } });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Could not create the batch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold">New dimensional batch</h1>

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
          {apiError !== null ? (
            <p className="text-sm font-medium text-status-fail-fg">✕ {apiError}</p>
          ) : null}
          <Button onClick={() => void start()} disabled={selected === null || busy}>
            Load Inspection Grid →
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
