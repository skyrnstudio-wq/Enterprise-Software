/**
 * Shared draft-persistence machinery (E3).
 *
 * The dimensional and coating stores implement the same discipline: the store
 * is the working set, Dexie is the truth on disk, and every mutation schedules
 * a debounced write-through whose completion timestamp only advances on a
 * COMPLETED write (edge 3.11). This module owns that machinery once so the two
 * stores cannot drift apart.
 */

type StampedDraft = { batchId: string; savedAt: string };

export interface DebouncedWriter<T extends StampedDraft> {
  /**
   * Debounce a write of the newest draft. `getDraft` is read when the timer
   * fires (so a mutation that lands inside the window is never lost) and
   * `onDone` advances the caller's completed-write timestamp.
   */
  schedule: (batchId: string, getDraft: () => T | null, onDone: () => void) => void;
  /** Drop any in-flight write for a batch (used on purge). */
  clearPending: (batchId: string) => void;
  /** Override the debounce window (tests, see note below). */
  setThrottleMs: (ms: number) => void;
}

/**
 * `write` receives the draft already stamped with a fresh `savedAt`; it should
 * resolve once the underlying store has persisted the row. A rejection is
 * swallowed by design — the next mutation retries (edge 3.11).
 */
export function createDebouncedWriter<T extends StampedDraft>(
  write: (draft: T) => Promise<unknown>,
  defaultThrottleMs = 300,
): DebouncedWriter<T> {
  const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

  // Debounce window, overridable for tests: fake-indexeddb drives IDB
  // transactions off the macrotask queue, which frozen fake timers would
  // deadlock — tests run real timers with a near-zero window instead.
  let writeThrottleMs = defaultThrottleMs;

  return {
    schedule: (batchId, getDraft, onDone) => {
      const existing = pendingWrites.get(batchId);
      if (existing !== undefined) clearTimeout(existing);
      pendingWrites.set(
        batchId,
        setTimeout(() => {
          pendingWrites.delete(batchId);
          const draft = getDraft();
          if (draft === null) return;
          void write({ ...draft, savedAt: new Date().toISOString() })
            .then(onDone)
            .catch(() => {
              // Swallow: retried on the next mutation.
            });
        }, writeThrottleMs),
      );
    },
    clearPending: (batchId) => {
      const existing = pendingWrites.get(batchId);
      if (existing !== undefined) {
        clearTimeout(existing);
        pendingWrites.delete(batchId);
      }
    },
    setThrottleMs: (ms) => {
      writeThrottleMs = ms;
    },
  };
}

/** Tab-guard channel — null in environments without BroadcastChannel (tests). */
export function createTabChannel(name: string): BroadcastChannel | null {
  return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
}
