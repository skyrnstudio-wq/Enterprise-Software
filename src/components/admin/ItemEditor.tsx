import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  getItemForEdit,
  listCustomers,
  parsePastedDimensions,
  publishItem,
  type PastedRow,
} from "@/lib/api/admin";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { Caption, StatusChip } from "@/components/ui/StatusChip";
import { Toast } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/QueryState";

/**
 * Item Master editor (IM-01…05) — one screen serving both `/admin/items/new`
 * and `/admin/items/$itemId`. The audit found publishItem() and the
 * paste-import parser fully built and tested but unreachable (dead nav
 * buttons); this is the missing front door.
 *
 * Sections mirror the shop's migration path: item header → optional coating
 * spec → dimension rows (paste from Excel or hand-edit) → publish. Publishing
 * with a NEW rev creates a clean revision (IM-05: released revisions are
 * immutable); the same rev merges rows by serial — removed rows survive
 * server-side for traceability (readings reference them).
 */

const BLAST_GRADES = ["Sa 3", "Sa 2½", "Sa 2", "Sa 1", "St 3", "St 2", "SP-10"] as const;

interface EditorState {
  itemCode: string;
  drawingNumber: string;
  description: string;
  customerId: string;
  rev: string;
  releasedAt: string;
  rows: PastedRow[];
  coating: {
    substrate: string;
    blast_grade: string;
    blast_profile_um_min: string;
    blast_profile_um_max: string;
    system_inside: string;
    system_outside: string;
    dft_nominal_um_inside: string;
    dft_nominal_um_outside: string;
  } | null;
}

function emptyState(): EditorState {
  return {
    itemCode: "",
    drawingNumber: "",
    description: "",
    customerId: "",
    rev: "1",
    releasedAt: new Date().toISOString().slice(0, 10),
    rows: [],
    coating: null,
  };
}

export function ItemEditorPage({ itemId }: { itemId?: string }): React.ReactElement {
  const navigate = useNavigate();
  const editing = itemId !== undefined && itemId !== "";

  const [form, setForm] = useState<EditorState>(emptyState);
  const [paste, setPaste] = useState("");
  const [coatingOn, setCoatingOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; desc: string; status: "pass" | "fail" } | null>(
    null,
  );

  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: listCustomers,
    enabled: typeof itemId !== "string" || itemId !== "__boot__", // always on; placeholder guard
  });

  // Load the existing item once for edit mode. `loadGuardRef` cancels stale
  // async results when the effect re-runs or unmounts.
  const loadGuardRef = useRef(false);
  useEffect(() => {
    if (!editing) return;
    loadGuardRef.current = false;
    void (async () => {
      try {
        const data = await getItemForEdit(itemId);
        if (data === null) {
          setError("Item not found.");
          return;
        }
        if (loadGuardRef.current) return;
        setForm({
          itemCode: data.item_code,
          drawingNumber: data.drawing_number,
          description: data.description,
          customerId: data.customer_id,
          rev: data.rev,
          releasedAt: data.released_at ?? "",
          rows: data.rows,
          coating:
            data.coating === null
              ? null
              : {
                  substrate: data.coating.substrate,
                  blast_grade: data.coating.blast_grade,
                  blast_profile_um_min: String(data.coating.blast_profile_um_min),
                  blast_profile_um_max: String(data.coating.blast_profile_um_max),
                  system_inside: data.coating.system_inside,
                  system_outside: data.coating.system_outside,
                  dft_nominal_um_inside: String(data.coating.dft_nominal_um_inside),
                  dft_nominal_um_outside: String(data.coating.dft_nominal_um_outside),
                },
        });
        setCoatingOn(data.coating !== null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load item");
      }
    })();
    return () => {
      loadGuardRef.current = true;
    };
  }, [editing, itemId]);

  const parsed = useMemo(() => (paste.trim() === "" ? null : parsePastedDimensions(paste)), [paste]);

  function applyPaste(): void {
    if (parsed === null || parsed.rows.length === 0) return;
    setForm((f) => {
      // Merge by serial — paste wins over an existing row with that serial.
      const bySerial = new Map(f.rows.map((r) => [r.serial, r]));
      for (const r of parsed.rows) bySerial.set(r.serial, r);
      return { ...f, rows: [...bySerial.values()].sort((a, b) => a.serial - b.serial) };
    });
    setPaste("");
  }

  function setRow(serial: number, patch: Partial<PastedRow>): void {
    setForm((f) => ({
      ...f,
      rows: f.rows.map((r) => (r.serial === serial ? { ...r, ...patch } : r)),
    }));
  }

  function removeRow(serial: number): void {
    setForm((f) => ({ ...f, rows: f.rows.filter((r) => r.serial !== serial) }));
  }

  function addRow(): void {
    setForm((f) => {
      const next = f.rows.reduce((m, r) => Math.max(m, r.serial), 0) + 1;
      return {
        ...f,
        rows: [
          ...f.rows,
          {
            serial: next,
            label: `DIM-${String(next).padStart(2, "0")}`,
            raw: "",
            nominal: 0,
            tolPlus: 0,
            tolMinus: 0,
            symbol: null,
            isReference: false,
          },
        ].sort((a, b) => a.serial - b.serial),
      };
    });
  }

  async function publish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (form.itemCode.trim() === "" || form.customerId === "" || form.rev.trim() === "") {
        throw new Error("Item code, customer and revision are mandatory.");
      }
      if (form.rows.length === 0) {
        throw new Error("Add or paste at least one dimension row.");
      }
      const numeric = (v: string): number => Number(v);
      await publishItem({
        item_code: form.itemCode.trim(),
        drawing_number: form.drawingNumber.trim(),
        description: form.description.trim(),
        customer_id: form.customerId,
        rev: form.rev.trim(),
        released_at: form.releasedAt === "" ? null : form.releasedAt,
        rows: form.rows,
        coating:
          coatingOn && form.coating !== null
            ? {
                substrate: form.coating.substrate.trim(),
                blast_grade: form.coating.blast_grade,
                blast_profile_um_min: numeric(form.coating.blast_profile_um_min),
                blast_profile_um_max: numeric(form.coating.blast_profile_um_max),
                system_inside: form.coating.system_inside.trim(),
                system_outside: form.coating.system_outside.trim(),
                dft_nominal_um_inside: numeric(form.coating.dft_nominal_um_inside),
                dft_nominal_um_outside: numeric(form.coating.dft_nominal_um_outside),
              }
            : null,
      });
      setToast({
        title: "Item published",
        desc: `${form.itemCode} rev ${form.rev} — ${String(form.rows.length)} dimensions`,
        status: "pass",
      });
      setTimeout(() => {
        void navigate({ to: "/admin/items" });
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  const coating = form.coating;
  const setCoat = (patch: Partial<NonNullable<EditorState["coating"]>>): void => {
    setForm((f) => ({
      ...f,
      coating: { ...(f.coating ?? {
        substrate: "",
        blast_grade: "Sa 2½",
        blast_profile_um_min: "",
        blast_profile_um_max: "",
        system_inside: "",
        system_outside: "",
        dft_nominal_um_inside: "",
        dft_nominal_um_outside: "",
      }), ...patch },
    }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Toast
        open={toast !== null}
        title={toast?.title ?? ""}
        description={toast?.desc ?? ""}
        status={toast?.status ?? "pass"}
        onOpenChange={(o) => {
          if (!o) setToast(null);
        }}
      />

      <div>
        <h1 className="text-xl font-semibold">{editing ? "Edit item" : "New item"}</h1>
        <Caption>
          {editing
            ? "Publishing under a new rev creates a clean revision — released revisions stay immutable (IM-05)."
            : "Item → revision → dimension chain. Paste from the Excel dimension file to migrate in minutes (IM-03)."}
        </Caption>
      </div>

      <SectionCard letter="A" title="Item header">
        <div className="grid gap-4 md:grid-cols-2">
          <FormRow label="Item code" htmlFor="ie-code">
            <TextInput
              id="ie-code"
              className="measurement"
              value={form.itemCode}
              onChange={(e) => {
                setForm((f) => ({ ...f, itemCode: e.target.value }));
              }}
            />
          </FormRow>
          <FormRow label="Drawing no." htmlFor="ie-dwg">
            <TextInput
              id="ie-dwg"
              className="measurement"
              value={form.drawingNumber}
              onChange={(e) => {
                setForm((f) => ({ ...f, drawingNumber: e.target.value }));
              }}
            />
          </FormRow>
          <FormRow label="Description" htmlFor="ie-desc">
            <TextInput
              id="ie-desc"
              value={form.description}
              onChange={(e) => {
                setForm((f) => ({ ...f, description: e.target.value }));
              }}
            />
          </FormRow>
          <FormRow label="Customer" htmlFor="ie-cust">
            <select
              id="ie-cust"
              className="h-9 w-full rounded-xs border border-ink-300 bg-paper-raised px-2 text-sm"
              value={form.customerId}
              onChange={(e) => {
                setForm((f) => ({ ...f, customerId: e.target.value }));
              }}
            >
              <option value="">Select customer…</option>
              {(customers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard
        letter="B"
        title="Coating spec (optional)"
        actions={
          <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
            <input
              type="checkbox"
              checked={coatingOn}
              onChange={(e) => {
                setCoatingOn(e.target.checked);
                if (e.target.checked && coating === null) setCoat({});
              }}
            />
            This item is coating-inspected
          </label>
        }
      >
        {coatingOn && coating !== null ? (
          <div className="grid gap-4 md:grid-cols-2">
            <FormRow label="Substrate" htmlFor="ie-sub">
              <TextInput
                id="ie-sub"
                value={coating.substrate}
                onChange={(e) => {
                  setCoat({ substrate: e.target.value });
                }}
              />
            </FormRow>
            <FormRow label="Blast grade" htmlFor="ie-blast">
              <select
                id="ie-blast"
                className="h-9 w-full rounded-xs border border-ink-300 bg-paper-raised px-2 text-sm"
                value={coating.blast_grade}
                onChange={(e) => {
                  setCoat({ blast_grade: e.target.value });
                }}
              >
                {BLAST_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Profile µm min/max" htmlFor="ie-prof-min">
              <div className="flex gap-2">
                <TextInput
                  id="ie-prof-min"
                  inputMode="numeric"
                  className="measurement"
                  value={coating.blast_profile_um_min}
                  onChange={(e) => {
                    setCoat({ blast_profile_um_min: e.target.value });
                  }}
                />
                <TextInput
                  aria-label="Blast profile max µm"
                  inputMode="numeric"
                  className="measurement"
                  value={coating.blast_profile_um_max}
                  onChange={(e) => {
                    setCoat({ blast_profile_um_max: e.target.value });
                  }}
                />
              </div>
            </FormRow>
            <FormRow label="DFT nominal µm in/out" htmlFor="ie-dft-in">
              <div className="flex gap-2">
                <TextInput
                  id="ie-dft-in"
                  inputMode="numeric"
                  className="measurement"
                  value={coating.dft_nominal_um_inside}
                  onChange={(e) => {
                    setCoat({ dft_nominal_um_inside: e.target.value });
                  }}
                />
                <TextInput
                  aria-label="DFT nominal outside µm"
                  inputMode="numeric"
                  className="measurement"
                  value={coating.dft_nominal_um_outside}
                  onChange={(e) => {
                    setCoat({ dft_nominal_um_outside: e.target.value });
                  }}
                />
              </div>
            </FormRow>
            <FormRow label="System inside" htmlFor="ie-sys-in">
              <TextInput
                id="ie-sys-in"
                value={coating.system_inside}
                onChange={(e) => {
                  setCoat({ system_inside: e.target.value });
                }}
              />
            </FormRow>
            <FormRow label="System outside" htmlFor="ie-sys-out">
              <TextInput
                id="ie-sys-out"
                value={coating.system_outside}
                onChange={(e) => {
                  setCoat({ system_outside: e.target.value });
                }}
              />
            </FormRow>
          </div>
        ) : (
          <p className="text-sm text-ink-500">
            Toggle on to capture the coating system for ST/QC/04 batches.
          </p>
        )}
      </SectionCard>

      <SectionCard
        letter="C"
        title={`Dimensions (${String(form.rows.length)})`}
        actions={
          <Button variant="secondary" onClick={addRow}>
            <Plus size={14} className="mr-1 inline" /> Add row
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-ink-700">Paste from Excel</span>
            <textarea
              rows={4}
              placeholder={"1  SHAFT DIA Ø25±0.2\n2  LENGTH 120 ±0.5\n3  (2065) REF"}
              className="mt-1 w-full rounded-xs border border-ink-300 bg-paper-raised p-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
              }}
            />
          </label>
          {parsed !== null ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusChip status="info" label={`${String(parsed.rows.length)} rows parsed`} />
              {parsed.duplicates.length > 0 ? (
                <StatusChip
                  status="warn"
                  label={`duplicate serials: ${parsed.duplicates.map(String).join(", ")}`}
                />
              ) : null}
              {parsed.failedLines.length > 0 ? (
                <StatusChip
                  status="fail"
                  label={`${String(parsed.failedLines.length)} unparseable line(s)`}
                />
              ) : null}
              <Button onClick={applyPaste} disabled={parsed.rows.length === 0}>
                Import {String(parsed.rows.length)} row(s)
              </Button>
            </div>
          ) : null}

          {form.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Label</th>
                    <th className="py-1 pr-2">Nominal</th>
                    <th className="py-1 pr-2">+Tol</th>
                    <th className="py-1 pr-2">−Tol</th>
                    <th className="py-1 pr-2">Ref</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {form.rows.map((r) => (
                    <tr key={r.serial} className="border-b border-ink-100">
                      <td className="py-1 pr-2 font-mono text-xs">{String(r.serial)}</td>
                      <td className="py-1 pr-2">
                        <input
                          aria-label={`Row ${String(r.serial)} label`}
                          className="h-8 w-full min-w-36 rounded-xs border border-ink-200 px-2"
                          value={r.label}
                          onChange={(e) => {
                            setRow(r.serial, { label: e.target.value });
                          }}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          aria-label={`Row ${String(r.serial)} nominal`}
                          inputMode="decimal"
                          className="measurement h-8 w-24 rounded-xs border border-ink-200 px-2 text-right"
                          value={String(r.nominal)}
                          onChange={(e) => {
                            setRow(r.serial, { nominal: Number(e.target.value) || 0 });
                          }}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          aria-label={`Row ${String(r.serial)} plus tolerance`}
                          inputMode="decimal"
                          className="measurement h-8 w-20 rounded-xs border border-ink-200 px-2 text-right"
                          value={String(r.tolPlus)}
                          onChange={(e) => {
                            setRow(r.serial, { tolPlus: Number(e.target.value) || 0 });
                          }}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          aria-label={`Row ${String(r.serial)} minus tolerance`}
                          inputMode="decimal"
                          className="measurement h-8 w-20 rounded-xs border border-ink-200 px-2 text-right"
                          value={String(r.tolMinus)}
                          onChange={(e) => {
                            setRow(r.serial, { tolMinus: Number(e.target.value) || 0 });
                          }}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          aria-label={`Row ${String(r.serial)} reference dimension`}
                          type="checkbox"
                          checked={r.isReference}
                          onChange={(e) => {
                            setRow(r.serial, { isReference: e.target.checked });
                          }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          aria-label={`Remove row ${String(r.serial)}`}
                          onClick={() => {
                            removeRow(r.serial);
                          }}
                          className="p-1 text-ink-500 hover:text-status-fail-fg"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard letter="D" title="Publish">
        <div className="flex flex-wrap items-end gap-4">
          <FormRow
            label="Revision"
            htmlFor="ie-rev"
            helper="Same rev merges rows by serial; a new rev replaces cleanly (IM-05)."
          >
            <TextInput
              id="ie-rev"
              className="measurement w-24"
              value={form.rev}
              onChange={(e) => {
                setForm((f) => ({ ...f, rev: e.target.value }));
              }}
            />
          </FormRow>
          <FormRow label="Released" htmlFor="ie-rel">
            <TextInput
              id="ie-rel"
              type="date"
              className="w-44"
              value={form.releasedAt}
              onChange={(e) => {
                setForm((f) => ({ ...f, releasedAt: e.target.value }));
              }}
            />
          </FormRow>
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => void navigate({ to: "/admin/items" })}>
            Cancel
          </Button>
          <Button onClick={() => void publish()} disabled={busy}>
            {busy ? "Publishing…" : "Publish item"}
          </Button>
        </div>
        {error !== null ? (
          <p role="alert" className="mt-3 text-sm font-medium text-status-fail-fg">
            ✕ {error}
          </p>
        ) : null}
      </SectionCard>

      {editing && customers.isLoading ? <Skeleton className="h-4 w-40" /> : null}
    </div>
  );
}
