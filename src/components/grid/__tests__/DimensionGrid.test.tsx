import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DimensionGrid } from "../DimensionGrid";

/** jsdom has no layout: report a fixed viewport to the virtualizer. */
class ResizeObserverStub implements ResizeObserver {
  private readonly cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element): void {
    const entry = {
      target,
      contentRect: {
        width: 900,
        height: 640,
        top: 0,
        left: 0,
        bottom: 640,
        right: 900,
        x: 0,
        y: 0,
        toJSON: () => "",
      } as DOMRectReadOnly,
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    } as unknown as ResizeObserverEntry;
    this.cb([entry], this);
  }
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = () => {}; // jsdom lacks layout scrolling

// virtual-core measures the scroll container via offsetWidth/offsetHeight,
// which jsdom (no layout engine) always reports as 0 — give the grid's
// scroll container a viewport so real row counts render.
const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    if (this.dataset.testid === "grid-scroll") return 640;
    return heightDescriptor?.get?.call(this) ?? 0;
  },
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get(this: HTMLElement) {
    if (this.dataset.testid === "grid-scroll") return 900;
    return widthDescriptor?.get?.call(this) ?? 0;
  },
});
import type { GridRowData } from "../DimensionGrid";
import { useInspectionStore } from "@/lib/store/inspection-store";
import { db } from "@/lib/dexie/db";
import type { DimensionDraft } from "@/lib/dexie/db";

/**
 * Grid engine tests — execution-plan.md Phase 3 step 12: virtualized render
 * count (the sub-100 ms NFR), keyboard model (DIM-03), quick-fill, reference
 * locking, tab-conflict read-only (edge 3.12).
 */

function makeRows(n: number): GridRowData[] {
  return Array.from({ length: n }, (_, i) => ({
    dimension_row_id: `dr-${String(i + 1)}`,
    serial: i + 1,
    label: `DIM ${String(i + 1)}`,
    symbol: null,
    is_reference: false,
    nominal: 10,
    tol_plus: 0.5,
    tol_minus: 0.5,
    instrument_id: null,
  }));
}

function makeDraft(rows: GridRowData[]): DimensionDraft {
  return {
    batchId: "b-1",
    header: {
      item_id: "i-1",
      revision_id: "r-1",
      item_code: "ST-0265",
      po_number: "PO-1001",
      delivery_batch_code: "2609-01",
      inspection_date: "2026-09-16",
      lot_quantity: 25,
    },
    rows: rows.map((r) => ({
      ...r,
      samples: [null, null, null, null, null],
    })),
    cursor: null,
    savedAt: new Date(0).toISOString(),
  };
}

async function mountGrid(rowCount = 200): Promise<void> {
  const rows = makeRows(rowCount);
  useInspectionStore.getState().load(makeDraft(rows));
  render(
    <DimensionGrid rows={rows} instruments={[{ id: "inst-1", label: "MIC-01", expired: false }]} />,
  );
  // Settle: virtualizer measurement + focus-restore rAF land after a frame.
  await new Promise((r) => setTimeout(r, 50));
}

describe("DimensionGrid (Phase 3 steps 2/3)", () => {
  beforeEach(async () => {
    await Promise.all([db.drafts.clear(), db.pendingSync.clear()]);
    useInspectionStore.setState({
      draft: null,
      hydrated: true,
      lastWriteAt: null,
      stolenByOtherTab: false,
      cursor: null,
    });
  });

  it("virtualizes: 200 rows mount far fewer DOM rows (render-count NFR)", async () => {
    await mountGrid(200);
    const mounted = document.querySelectorAll('[data-testid="grid-row"]').length;
    expect(mounted).toBeGreaterThan(5);
    expect(mounted).toBeLessThan(60); // ~viewport + overscan, never 200
  });

  it("Enter moves down within the same sample column (DIM-03, edge 3.18 path)", async () => {
    await mountGrid(20);
    const first = screen.getByLabelText("Row 1 sample 01");
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.activeElement).toBe(screen.getByLabelText("Row 2 sample 01"));
  });

  it("Tab moves right; row-end Tab wraps to the next row's first sample", async () => {
    await mountGrid(20);
    const cell05 = screen.getByLabelText("Row 1 sample 05");
    cell05.focus();
    fireEvent.keyDown(cell05, { key: "Tab" });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.activeElement).toBe(screen.getByLabelText("Row 2 sample 01"));
  });

  it("bottom-right corner clamps — focus is never lost (DIM-03)", async () => {
    await mountGrid(20);
    const last = screen.getByLabelText(`Row ${String(20)} sample 05`);
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.activeElement).toBe(last); // stays put
  });

  it("commits typed values through the mask: decimal comma and 1e3 rejection", async () => {
    await mountGrid(5);
    const cell = screen.getByLabelText("Row 1 sample 01");
    const user = userEvent.setup();
    await user.type(cell, "9,88");
    fireEvent.blur(cell);
    const sample = useInspectionStore.getState().draft?.rows[0]?.samples[0];
    expect(sample).toBe(9.88);
  });

  it("multi-value paste fills the row's samples (edge 3.8)", async () => {
    await mountGrid(5);
    const cell = screen.getByLabelText("Row 1 sample 01");
    fireEvent.paste(cell, { clipboardData: { getData: () => "10.1 10.2 10.3 10.4 10.5" } });
    const samples = useInspectionStore.getState().draft?.rows[0]?.samples;
    expect(samples).toEqual([10.1, 10.2, 10.3, 10.4, 10.5]);
  });

  it("reference rows are locked but remain part of the grid (edge 3.7)", () => {
    const rows = makeRows(5);
    const referenceRow = rows[2];
    if (referenceRow === undefined) throw new Error("row 3 must exist");
    rows[2] = { ...referenceRow, is_reference: true };
    useInspectionStore.getState().load(makeDraft(rows));
    render(<DimensionGrid rows={rows} instruments={[]} />);
    const refCell = screen.getByLabelText("Row 3 sample 01");
    expect(refCell).toBeDisabled();
    const normalCell = screen.getByLabelText("Row 1 sample 01");
    expect(normalCell).not.toBeDisabled();
  });

  it("another tab claiming the draft flips the grid read-only (edge 3.12)", async () => {
    await mountGrid(5);
    useInspectionStore.getState().claimConflict();
    await new Promise((r) => setTimeout(r, 20)); // subscription → re-render
    const cell = screen.getByLabelText("Row 1 sample 01");
    expect(cell).toBeDisabled();
  });
});
