import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MeasurementCell } from "@/components/ui/MeasurementCell";
import { StatusChip, Caption } from "@/components/ui/StatusChip";
import {
  moveFocus,
  rowStatus,
  isSuspiciousUniformity,
  parseCellInput,
  splitPaste,
} from "@/domain/grid-model";
import type { GridPos, RowStatus } from "@/domain/grid-model";
import { useInspectionStore } from "@/lib/store/inspection-store";

/**
 * DimensionGrid — execution-plan.md Phase 3 steps 2/3/5/6 + ui-ux-plan §6.6.
 *
 * - TanStack Virtual over 53–200 rows × 5 samples: only visible rows mount
 *   (the render-count NFR); the virtualizer auto-scrolls on keyboard nav
 *   (edge 3.10).
 * - Uncontrolled MeasurementCells: typing never re-renders the grid; commits
 *   write through the inspection store (Dexie autosave).
 * - Keyboard model (DIM-03, pure `moveFocus`): Tab→right (row-wrap, corners
 *   clamp), Enter/↓→down — edge 3.18's double-tap path maps onto Enter via
 *   the same handler; Shift+Tab/←→ left. Focus is never lost.
 * - Row status = worst of samples (DIM-04) as the Sr.# chip; `0` is a value
 *   (edge 3.17); multi-value paste fills samples (edge 3.8).
 * - Read-only when another tab claimed the draft (edge 3.12) or on
 *   reference-dimension rows (locked display, real rows still evaluated).
 */

export interface GridRowData {
  dimension_row_id: string;
  serial: number;
  label: string;
  symbol: string | null;
  is_reference: boolean;
  nominal: number;
  tol_plus: number;
  tol_minus: number;
  instrument_id: string | null;
}

interface Props {
  rows: GridRowData[];
  /** Available instruments for the per-row select (calibrated only, EQ-03). */
  instruments: { id: string; label: string; expired: boolean }[];
  readOnly?: boolean;
}

const SAMPLE_COUNT = 5;

export function DimensionGrid({ rows, instruments, readOnly = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const [, setCursorLocal] = useState<GridPos>({ row: 0, sample: 0 });

  const setSample = useInspectionStore((s) => s.setSample);
  const setCursor = useInspectionStore((s) => s.setCursor);
  const stolenByOtherTab = useInspectionStore((s) => s.stolenByOtherTab);
  const draftRows = useInspectionStore((s) => s.draft?.rows);

  const lock = readOnly || stolenByOtherTab;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
    // jsdom has no layout engine; this pre-measurement rect keeps the grid
    // renderable in tests (production re-measures on mount).
    initialRect: { width: 900, height: 640 },
  });

  const registerCell = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el === null) cellRefs.current.delete(key);
    else cellRefs.current.set(key, el);
  }, []);

  const focusCell = useCallback(
    (pos: GridPos) => {
      const target = rows[pos.row];
      if (target === undefined) return;
      setCursorLocal(pos);
      setCursor(pos.row, pos.sample);
      // requestAnimationFrame: the virtualizer may need a pass to mount the row.
      requestAnimationFrame(() => {
        const el = cellRefs.current.get(`${target.dimension_row_id}:${String(pos.sample)}`);
        if (el !== undefined) {
          el.focus();
          el.scrollIntoView({ block: "nearest" });
        }
      });
    },
    [rows, setCursor],
  );

  const handleNavigate = useCallback(
    (pos: GridPos, key: Parameters<typeof moveFocus>[1]) => {
      focusCell(moveFocus(pos, key, rows.length));
    },
    [focusCell, rows.length],
  );

  // Restore focus to the persisted cursor on mount (edges 2.13/3.13).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = useInspectionStore.getState().cursor;
    if (saved !== null && rows[saved.row] !== undefined) {
      setCursorLocal(saved);
      requestAnimationFrame(() => {
        const target = rows[saved.row];
        const el =
          target === undefined
            ? undefined
            : cellRefs.current.get(`${target.dimension_row_id}:${String(saved.sample)}`);
        if (el !== undefined) el.focus();
      });
    }
  }, [rows]);

  // Reactive row statuses — recompute only when the draft's sample data changes.
  const gridStatuses: RowStatus[] = useMemo(() => {
    return rows.map((r) => {
      const draftRow = draftRows?.find((d) => d.dimension_row_id === r.dimension_row_id);
      return draftRow === undefined
        ? "empty"
        : rowStatus(draftRow.samples, r.nominal, r.tol_plus, r.tol_minus);
    });
  }, [rows, draftRows]);

  const suspicious = useMemo(() => {
    return rows.map((r) => {
      const draftRow = draftRows?.find((d) => d.dimension_row_id === r.dimension_row_id);
      if (draftRow === undefined) return false;
      return isSuspiciousUniformity(draftRow.samples, r.tol_plus + r.tol_minus);
    });
  }, [rows, draftRows]);

  return (
    <div className="rounded-sm border border-ink-200 bg-paper-raised">
      {lock ? (
        <div className="border-b border-status-warn-fg bg-status-warn-bg px-3 py-2 text-xs font-medium text-status-warn-fg">
          ▲ This draft is open in another tab — edits are disabled here (edge 3.12).
        </div>
      ) : null}
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto" data-testid="grid-scroll">
        <div style={{ minWidth: 900 }}>
          <div className="sticky top-0 z-20 grid grid-cols-[72px_1fr_repeat(5,92px)_150px] items-center border-b border-ink-300 bg-paper-sunken px-3 py-2">
            <Caption>Sr.</Caption>
            <Caption>Dimension</Caption>
            {Array.from({ length: SAMPLE_COUNT }, (_, i) => (
              <Caption key={i} className="text-center">
                {`0${String(i + 1)}`}
              </Caption>
            ))}
            <Caption className="text-right">Instrument</Caption>
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              if (r === undefined) return null;
              const status = gridStatuses[vi.index] ?? "empty";
              const draftRow = draftRows?.find((d) => d.dimension_row_id === r.dimension_row_id);
              const rowLocked = lock || r.is_reference;
              const chipFor: Record<
                string,
                { chip: "pass" | "warn" | "fail" | "info" | "locked"; label: string }
              > = {
                pass: { chip: "pass", label: "PASS" },
                warn: { chip: "warn", label: "NEAR" },
                fail: { chip: "fail", label: "FAIL" },
                incomplete: {
                  chip: "info",
                  label: `${String(countEntered(draftRow?.samples ?? []))}/5`,
                },
                empty: { chip: "locked", label: String(r.serial) },
              };
              const chip = chipFor[status] ?? { chip: "locked" as const, label: String(r.serial) };
              return (
                <div
                  key={r.dimension_row_id}
                  data-testid="grid-row"
                  className="grid grid-cols-[72px_1fr_repeat(5,92px)_150px] items-center border-b border-ink-200 px-3"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vi.size,
                    transform: `translateY(${String(vi.start)}px)`,
                  }}
                >
                  <StatusChip status={chip.chip} label={chip.label} />
                  <span className="truncate pr-3 text-sm text-ink-900" title={r.label}>
                    {r.symbol !== null ? `${r.symbol} ` : ""}
                    {r.label}
                    {r.is_reference ? (
                      <span className="ml-1 text-xs text-ink-500">(ref)</span>
                    ) : null}
                    {suspicious[vi.index] === true ? (
                      <span
                        className="ml-2 inline-flex items-center text-status-warn-fg"
                        title="Possible fill error — identical samples (edge 3.16)"
                      >
                        ▲
                      </span>
                    ) : null}
                  </span>
                  {Array.from({ length: SAMPLE_COUNT }, (_, si) => {
                    const sampleValue = draftRow?.samples[si] ?? null;
                    return (
                      <MeasurementCell
                        key={si}
                        cellId={`${r.dimension_row_id}:${String(si)}`}
                        registerRef={registerCell}
                        nominal={r.nominal}
                        tolPlus={r.tol_plus}
                        tolMinus={r.tol_minus}
                        value={sampleValue}
                        disabled={rowLocked}
                        ariaLabel={`Row ${String(r.serial)} sample 0${String(si + 1)}`}
                        onCommit={(raw) => {
                          if (raw === null) {
                            setSample(vi.index, si, null);
                            return;
                          }
                          const parsed = parseCellInput(String(raw));
                          setSample(vi.index, si, parsed);
                        }}
                        onPaste={(text) => {
                          const parts = splitPaste(text);
                          if (parts.length <= 1) return false; // default paste
                          parts.forEach((p, pi) => {
                            if (pi < SAMPLE_COUNT) setSample(vi.index, si + pi, parseCellInput(p));
                          });
                          return true; // handled — suppress default
                        }}
                        onNavigate={(key) => {
                          handleNavigate({ row: vi.index, sample: si }, key);
                        }}
                      />
                    );
                  })}
                  <InstrumentSlot
                    row={vi.index}
                    instrumentId={draftRow?.instrument_id ?? r.instrument_id}
                    instruments={instruments}
                    disabled={rowLocked}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function countEntered(samples: (number | null)[]): number {
  return samples.filter((s) => s !== null).length;
}

/**
 * Instrument select per row (step 6). Expired instruments remain selectable —
 * the entry path never blocks; the submission checklist gates (EQ-03, edge
 * 3.15). `expired` entries render with the warn glyph as a redundant cue.
 */
function InstrumentSlot({
  row,
  instrumentId,
  instruments,
  disabled,
}: {
  row: number;
  instrumentId: string | null;
  instruments: { id: string; label: string; expired: boolean }[];
  disabled: boolean;
}) {
  const setInstrument = useInspectionStore((s) => s.setInstrument);
  return (
    <select
      aria-label={`Instrument for row ${String(row + 1)}`}
      disabled={disabled}
      value={instrumentId ?? ""}
      onChange={(e) => {
        setInstrument(row, e.target.value === "" ? null : e.target.value);
      }}
      className="h-8 w-full rounded-xs border border-ink-300 bg-paper-raised px-1 text-xs text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      <option value="">—</option>
      {instruments.map((i) => (
        <option key={i.id} value={i.id}>
          {i.expired ? "▲ " : ""}
          {i.label}
        </option>
      ))}
    </select>
  );
}
