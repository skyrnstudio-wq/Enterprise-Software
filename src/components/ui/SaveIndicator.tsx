import { Caption } from "@/components/ui/StatusChip";

/**
 * SaveIndicator (G6, edge 3.19) — three honest states, glyph + text (§1.2):
 * - offline: the write will queue, not land — say so;
 * - pending: a debounced write is in flight ("saving…");
 * - saved: last COMPLETED write, monotonic local delta only.
 * `lastWriteAt` is the store's completed-write timestamp; `dirtyAt` is the
 * newest mutation timestamp. `tick` is the route's re-render pulse: when it
 * changes this component re-renders and recomputes the "Xs ago" delta.
 */
export function SaveIndicator(props: {
  lastWriteAt: number | null;
  /** Timestamp of the newest un-flushed mutation; null when idle. */
  dirtyAt?: number | null;
  /** Monotonic re-render tick from the host route (5 s interval). */
  tick: unknown;
}): React.ReactElement {
  const { lastWriteAt, dirtyAt = null, tick } = props;
  // `tick` participates here so the delta recomputes on every pulse.
  const now = Date.now() + (typeof tick === "number" ? tick * 0 : 0);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  if (!online) {
    return (
      <span className="font-medium text-status-warn-fg" aria-live="polite">
        ▲ offline — edits stay on this device
      </span>
    );
  }
  if (dirtyAt !== null && (lastWriteAt === null || dirtyAt > lastWriteAt)) {
    return (
      <span className="text-ink-500" aria-live="polite">
        saving…
      </span>
    );
  }
  const saved =
    lastWriteAt === null
      ? "not saved yet"
      : `${String(Math.max(0, Math.round((now - lastWriteAt) / 1000)))}s ago`;
  return (
    <Caption aria-live="polite">
      <span className="text-status-pass-fg">✓</span> saved {saved}
    </Caption>
  );
}
