import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, Wrench, Pencil } from "lucide-react";
import {
  listInstruments,
  saveInstrument,
  retireInstrument,
  type InstrumentForm,
  type InstrumentRowView,
} from "@/lib/api/admin";
import { nextDueAt, DUE_SOON_WINDOW_DAYS } from "@/domain/instrument-status";
import type { InstrumentStatus } from "@/domain/instrument-status";
import { DataTable, THead, TH, TR, TD, Toast } from "@/components/ui/DataTable";
import { StatusChip, type ChipStatus } from "@/components/ui/StatusChip";
import { SectionCard, EmptyState } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { TableSkeleton } from "@/components/ui/QueryState";

export const Route = createFileRoute("/_authenticated/admin/instruments")({
  component: InstrumentsPage,
});

const chipFor: Record<InstrumentStatus, ChipStatus> = {
  ACTIVE: "pass",
  DUE_SOON: "warn",
  EXPIRED: "fail",
};
const labelFor: Record<InstrumentStatus, string> = {
  ACTIVE: "Active",
  DUE_SOON: `Due ≤${String(DUE_SOON_WINDOW_DAYS)}d`,
  EXPIRED: "Expired",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** S3/S20 Equipment Registry (ui-ux-plan §6.3). */
export default function InstrumentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InstrumentRowView | "new" | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    desc: string;
    status: "pass" | "fail";
  } | null>(null);

  const {
    data: instruments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["instruments", todayIso()],
    queryFn: () => listInstruments(todayIso()),
  });

  const save = useMutation({
    mutationFn: (form: InstrumentForm) => saveInstrument(form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instruments"] });
      setEditing(null);
      setToast({
        title: "Instrument saved",
        desc: "Next due date recomputed from last calibration + interval.",
        status: "pass",
      });
    },
    onError: (e: Error) => {
      setToast({ title: "Save failed", desc: e.message, status: "fail" });
    },
  });

  const retire = useMutation({
    mutationFn: (id: string) => retireInstrument(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["instruments"] }),
    onError: (e: Error) => {
      setToast({ title: "Retire failed", desc: e.message, status: "fail" });
    },
  });

  const filtered = useMemo(
    () =>
      instruments.filter((i) =>
        `${i.instrument_code} ${i.description} ${i.make_model}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [instruments, search],
  );

  const dueSoonCount = instruments.filter((i) => i.status === "DUE_SOON").length;

  if (editing !== null) {
    return (
      <InstrumentFormView
        existing={editing === "new" ? null : editing}
        onSave={(f) => {
          save.mutate(f);
        }}
        onCancel={() => {
          setEditing(null);
        }}
        busy={save.isPending}
        apiError={save.error instanceof Error ? save.error.message : null}
        onRetire={
          editing === "new"
            ? undefined
            : () => {
                retire.mutate(editing.id);
                setEditing(null);
              }
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Equipment Registry</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Calibration status auto-computed from last calibration + interval (EQ-02).
            {dueSoonCount > 0 ? (
              <span className="ml-2 font-medium text-status-warn-fg">
                ▲ {dueSoonCount} due within {DUE_SOON_WINDOW_DAYS} days
              </span>
            ) : null}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing("new");
          }}
        >
          <Plus size={16} className="mr-1 inline" /> Add instrument
        </Button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute top-3 left-3 text-ink-500" aria-hidden />
        <TextInput
          placeholder="Search code, description, make/model…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className="pl-8"
        />
      </div>

      {isError ? (
        <div role="alert">
          <p className="text-sm text-ink-700">
            Couldn't load the registry: {error instanceof Error ? error.message : "service error"}
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Wrench size={24} />}
          message="No instruments registered yet. The registry feeds every reading's traceability chain (EQ-04)."
          action={
            <Button
              onClick={() => {
                setEditing("new");
              }}
            >
              <Plus size={16} className="mr-1 inline" /> Add the first instrument
            </Button>
          }
        />
      ) : (
        <DataTable>
          <THead>
            <TH sticky>Code</TH>
            <TH>Description</TH>
            <TH>Make / model</TH>
            <TH>Range</TH>
            <TH mono>Last cal</TH>
            <TH mono>Next due</TH>
            <TH>Status</TH>
            <TH> </TH>
          </THead>
          <tbody>
            {filtered.map((inst) => (
              <TR key={inst.id}>
                <TD sticky mono>
                  {inst.instrument_code}
                </TD>
                <TD>{inst.description}</TD>
                <TD>{inst.make_model}</TD>
                <TD mono>{inst.range}</TD>
                <TD mono>{inst.last_cal_at}</TD>
                <TD mono>{inst.next_due_at}</TD>
                <TD>
                  <StatusChip status={chipFor[inst.status]} label={labelFor[inst.status]} />
                </TD>
                <TD>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(inst);
                    }}
                    className="text-ink-500 hover:text-ink-900"
                    aria-label={`Edit ${inst.instrument_code}`}
                  >
                    <Pencil size={14} />
                  </button>
                </TD>
              </TR>
            ))}
          </tbody>
        </DataTable>
      )}

      {toast ? (
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

/** Add/edit form — Zod mirrors the DB CHECKs (edge 2.10 rejected client-side). */
function InstrumentFormView({
  existing,
  onSave,
  onCancel,
  busy,
  apiError,
  onRetire,
}: {
  existing: InstrumentRowView | null;
  onSave: (form: InstrumentForm) => void;
  onCancel: () => void;
  busy: boolean;
  apiError: string | null;
  onRetire?: (() => void) | undefined;
}) {
  const [form, setForm] = useState<InstrumentForm>(
    existing
      ? {
          instrumentId: existing.instrument_code,
          description: existing.description,
          makeModel: existing.make_model,
          range: existing.range,
          lastCalibrationDate: existing.last_cal_at,
          intervalMonths: existing.interval_months,
        }
      : {
          instrumentId: "",
          description: "",
          makeModel: "",
          range: "",
          lastCalibrationDate: todayIso(),
          intervalMonths: 12,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const parsed = instrumentFormSchemaSafe(form);
    if (parsed.error) {
      setErrors(parsed.error);
      return;
    }
    setErrors({});
    onSave(form);
  }

  const set = (k: keyof InstrumentForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: k === "intervalMonths" ? Number(v) : v }));
  };

  return (
    <SectionCard
      letter="EQ"
      title={existing ? `Edit ${existing.instrument_code}` : "New instrument"}
      className="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormRow
          label="Code"
          htmlFor="code"
          error={errors.instrumentId}
          helper="Unique registry code, e.g. VC-04"
        >
          <TextInput
            id="code"
            value={form.instrumentId}
            onChange={(e) => {
              set("instrumentId")(e.target.value);
            }}
            disabled={!!existing}
          />
        </FormRow>
        <FormRow label="Description" htmlFor="desc" error={errors.description}>
          <TextInput
            id="desc"
            value={form.description}
            onChange={(e) => {
              set("description")(e.target.value);
            }}
          />
        </FormRow>
        <FormRow label="Make / model" htmlFor="make" error={errors.makeModel}>
          <TextInput
            id="make"
            value={form.makeModel}
            onChange={(e) => {
              set("makeModel")(e.target.value);
            }}
          />
        </FormRow>
        <FormRow label="Range" htmlFor="range" error={errors.range} helper="e.g. 0–25 mm">
          <TextInput
            id="range"
            value={form.range}
            onChange={(e) => {
              set("range")(e.target.value);
            }}
          />
        </FormRow>
        <FormRow label="Last calibration" htmlFor="cal" error={errors.lastCalibrationDate}>
          <TextInput
            id="cal"
            type="date"
            value={form.lastCalibrationDate}
            onChange={(e) => {
              set("lastCalibrationDate")(e.target.value);
            }}
          />
        </FormRow>
        <FormRow
          label="Interval (months)"
          htmlFor="interval"
          error={errors.intervalMonths}
          helper={previewDue(form)}
        >
          <TextInput
            id="interval"
            type="number"
            min={1}
            max={60}
            value={form.intervalMonths}
            onChange={(e) => {
              set("intervalMonths")(e.target.value);
            }}
            className="measurement"
          />
        </FormRow>

        {apiError ? <p className="text-sm font-medium text-status-fail-fg">✕ {apiError}</p> : null}

        <div className="flex items-center justify-between pt-2">
          {onRetire ? (
            <button
              type="button"
              onClick={onRetire}
              className="text-xs text-status-fail-fg hover:underline"
            >
              Retire (keeps reading history — edge 1.13)
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

/** Local mirror of the Zod schema for inline field errors (same shape as DB). */
function instrumentFormSchemaSafe(form: InstrumentForm): { error: Record<string, string> | null } {
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    if (typeof v === "string" && v.trim() === "") errors[k] = "Required";
  }
  if (form.intervalMonths < 1 || form.intervalMonths > 60) errors.intervalMonths = "1–60 months";
  return { error: Object.keys(errors).length ? errors : null };
}

function previewDue(form: InstrumentForm): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.lastCalibrationDate) || form.intervalMonths < 1) {
    return "Next due date preview";
  }
  return `Next due: ${nextDueAt(form.lastCalibrationDate, form.intervalMonths)}`;
}
