import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, CornerDownLeft } from "lucide-react";
import { searchBatches } from "@/lib/api/batches";
import { Caption, StatusChip } from "@/components/ui/StatusChip";

/**
 * ⌘K batch search (ui-ux-plan §2.1) — the "audit prep: 2–4 hours → 10
 * seconds" promise made visible. Fuzzy-ish substring match over item code /
 * PO / lot from the server (`searchBatches`), keyboard-first:
 * ↑/↓ move, Enter opens, Escape closes. The dashboard list caps at 100 rows;
 * this reaches any batch, which is why it lives in the shell and not the page.
 */

export interface BatchSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BatchSearchDialog({ open, onOpenChange }: BatchSearchDialogProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);

  const debounced = useDebounced(query.trim(), 150);
  const results = useQuery({
    queryKey: ["batch-search", debounced],
    queryFn: () => searchBatches(debounced),
    enabled: open && debounced.length >= 2,
  });
  const rows = results.data ?? [];

  useEffect(() => {
    setActive(0);
  }, [debounced]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function openBatch(batchId: string): void {
    onOpenChange(false);
    void navigate({ to: "/batch/$batchId", params: { batchId } });
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && rows[active] !== undefined) {
      e.preventDefault();
      openBatch(rows[active].id);
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[active];
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-graphite-900/40" />
        <DialogPrimitive.Content
          aria-label="Search batches"
          onKeyDown={onKeyDown}
          className="fixed top-[15vh] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-ink-300 bg-paper-raised shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        >
          <DialogPrimitive.Title className="sr-only">Search batches</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-ink-200 px-3">
            <Search size={16} className="shrink-0 text-ink-500" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search item code, PO, lot…"
              className="h-12 w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500"
            />
          </div>

          {debounced.length < 2 ? (
            <p className="px-3 py-4 text-xs text-ink-500">
              Type at least 2 characters — item code, PO number, or lot.
            </p>
          ) : results.isLoading ? (
            <p className="px-3 py-4 text-xs text-ink-500" aria-live="polite">
              Searching…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-4 text-xs text-ink-500">
              No batches match “{debounced}”. Check the PO or lot spelling.
            </p>
          ) : (
            <ul ref={listRef} className="max-h-80 overflow-y-auto py-1" role="listbox">
              {rows.map((r, i) => (
                <li key={r.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => {
                      setActive(i);
                    }}
                    onClick={() => {
                      openBatch(r.id);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                      i === active ? "bg-paper-sunken" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="measurement shrink-0 font-medium">{r.item_code}</span>
                      <span className="sunlight-muted truncate text-xs text-ink-500">
                        PO {r.po_number} · lot {r.delivery_batch_code}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusChip
                        status={
                          r.status === "APPROVED"
                            ? "pass"
                            : r.status === "REJECTED"
                              ? "fail"
                              : "info"
                        }
                        label={r.status}
                      />
                      {i === active ? <CornerDownLeft size={12} className="text-ink-500" aria-hidden /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-ink-200 px-3 py-1.5">
            <Caption>↑↓ move · ↵ open · esc close</Caption>
            <Caption>{rows.length > 0 ? `${String(rows.length)} result${rows.length === 1 ? "" : "s"}` : ""}</Caption>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      setV(value);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [value, ms]);
  return v;
}
