import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { openNcr } from "@/lib/api/ncr";
import { Button } from "@/components/ui/Button";

/**
 * NCR drafter (D2) — replaces the audit's placeholder toast. Opened from the
 * dimensional checklist ("Draft NCR" on FAIL) and the coating visual panel;
 * writes straight to the register with DB-allocated numbering. On success the
 * onCreated callback hands the NCR number back so the caller can confirm.
 */
export function NcrDraftDialog({
  open,
  onOpenChange,
  batchId,
  source,
  presetDescription = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  source: "DIMENSIONAL" | "COATING" | "REVIEW";
  presetDescription?: string;
  onCreated?: (ncrNumber: string) => void;
}): React.ReactElement {
  const [description, setDescription] = useState(presetDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(): Promise<void> {
    if (description.trim() === "") {
      setError("Describe the non-conformance (what, where, how much).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ncr = await openNcr({ batchId, description: description.trim(), source });
      setDescription("");
      onCreated?.(ncr.ncr_number);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the NCR");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-ink-300 bg-paper-raised p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Title className="text-base font-semibold">
            Draft non-conformance report
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <p className="mt-1 text-sm text-ink-700">
              The finding enters the NCR register with an auto-assigned number; Quality Head
              dispositions it from there.
            </p>
          </DialogPrimitive.Description>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-ink-700">Finding</span>
            <textarea
              rows={4}
              className="mt-1 w-full rounded-xs border border-ink-300 bg-paper-raised p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              placeholder="e.g. Row 12 bore Ø25.0 measured 25.42 — +0.42 over tolerance on 3 of 5 samples."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              autoFocus
            />
          </label>
          {error !== null ? (
            <p role="alert" className="mt-2 text-sm font-medium text-status-fail-fg">
              ✕ {error}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={busy}>
              {busy ? "Opening…" : "Open NCR"}
            </Button>
          </div>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute top-3 right-3 text-ink-500 hover:text-ink-900"
            >
              ✕
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
