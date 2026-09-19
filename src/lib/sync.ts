import { useEffect } from "react";
import { drainSync, replaySubmission } from "@/lib/api/batches";
import { replayCoatingSubmission } from "@/lib/api/coating";
import type { DimensionDraft } from "@/lib/dexie/db";

/**
 * Offline queue drain — production half of Phase 3 step 11. `drainSync` was
 * previously reachable only from tests, so offline submissions sat in IndexedDB
 * forever. `dispatchQueued` maps a queued record to its replay path by the
 * `table` discriminator that submitBatch/submitCoatingBatch wrote; unknown
 * tables are fatal so they surface instead of retrying forever.
 */
export async function dispatchQueued(record: {
  table: string;
  payload: unknown;
}): Promise<void> {
  switch (record.table) {
    case "submit_batch":
      await replaySubmission(record.payload as { draft: DimensionDraft });
      return;
    case "submit_coating_batch":
      await replayCoatingSubmission(
        record.payload as Parameters<typeof replayCoatingSubmission>[0],
      );
      return;
    default:
      throw new Error(`Unknown queue table: ${record.table}`);
  }
}

let draining = false;

/** Drains the queue once per invocation; concurrent calls coalesce. */
export async function drainWhenOnline(): Promise<void> {
  if (draining || typeof navigator === "undefined" || !navigator.onLine) return;
  draining = true;
  try {
    await drainSync(dispatchQueued);
  } finally {
    draining = false;
  }
}

/**
 * App-level hook: drains on boot (events missed before mount) and on every
 * browser `online` transition. Mount once in the authenticated layout.
 */
export function useOfflineDrain(): void {
  useEffect(() => {
    void drainWhenOnline();
    const onOnline = (): void => {
      void drainWhenOnline();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
