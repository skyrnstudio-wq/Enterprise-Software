import { supabase } from "./supabase/client";

/**
 * Realtime — backend-architecture.md §6 + execution-plan.md Phase 5 step 6.
 *
 * Broadcasts are fired SERVER-side by the RPCs (`pg_notify('batch:{id}', …)`,
 * `pg_notify('role:QUALITY_HEAD', …)`, `pg_notify('user:{id}', …)`) — the
 * client only listens. Supabase Realtime bridges Postgres NOTIFYs to
 * subscribers of the same channel topic as broadcast messages; the wildcard
 * event filter catches them regardless of the event name the bridge uses.
 *
 * Channel responsibilities:
 * - `role:QUALITY_HEAD` — QH dashboards receive submissions instantly (5.7:
 *   invalidation on event, not polling; backgrounded tabs catch up on the
 *   next event or focus-triggered refetch).
 * - `user:{id}` — inspectors receive approve/reject without refresh (§6.8
 *   flow: "Inspector is notified when Quality Head approves or rejects").
 * - `batch:{id}` — everyone viewing one batch sees status flips (5.2:
 *   mid-review submit refreshes the open review).
 */

export interface RealtimeEvent {
  [key: string]: unknown;
}

/** Minimal transport seam — tests inject a fake port; no network needed. */
export interface RealtimePort {
  subscribe(topic: string, handler: (event: RealtimeEvent) => void): () => void;
}

/** Default port — supabase-js broadcast listener per topic. */
export function makeSupabaseRealtimePort(): RealtimePort {
  const channels: Map<string, () => void> = new Map();
  return {
    subscribe(topic, handler) {
      const existing = channels.get(topic);
      if (existing !== undefined) return existing;
      const channel = supabase
        .channel(topic)
        .on("broadcast", { event: "*" }, (msg: { payload?: unknown }) => {
          handler((msg.payload ?? {}) as RealtimeEvent);
        })
        .subscribe();
      const unsubscribe = (): void => {
        void supabase.removeChannel(channel);
        channels.delete(topic);
      };
      channels.set(topic, unsubscribe);
      return unsubscribe;
    },
  };
}

export interface RealtimeWiring {
  /** Topics now subscribed; call to tear everything down. */
  stop: () => void;
}

/**
 * Subscribe the session's channels. QH gets the role channel; every signed-in
 * user gets their personal channel. Batch-scoped views subscribe separately
 * with `subscribeBatch`.
 */
export function startRealtime(opts: {
  userId: string | null;
  isQualityHead: boolean;
  onEvent: (topic: string, event: RealtimeEvent) => void;
  port?: RealtimePort;
}): RealtimeWiring {
  const port = opts.port ?? makeSupabaseRealtimePort();
  const unsubscribers: Array<() => void> = [];

  if (opts.isQualityHead) {
    unsubscribers.push(
      port.subscribe("role:QUALITY_HEAD", (event) => {
        opts.onEvent("role:QUALITY_HEAD", event);
      }),
    );
  }
  const uid: string | null = opts.userId;
  if (uid !== null) {
    const topic = `user:${uid}`;
    unsubscribers.push(
      port.subscribe(topic, (event) => {
        opts.onEvent(topic, event);
      }),
    );
  }

  return {
    stop: () => {
      for (const u of unsubscribers) u();
    },
  };
}

/** Per-batch channel — review screens and the grid screen (edge 5.2). */
export function subscribeBatch(
  batchId: string,
  onEvent: (event: RealtimeEvent) => void,
  port: RealtimePort = makeSupabaseRealtimePort(),
): () => void {
  return port.subscribe(`batch:${batchId}`, onEvent);
}

// ---------------------------------------------------------------------------
// Event semantics — the payload shapes the RPCs emit (migration 005):
//   submit_batch  → role:QUALITY_HEAD { event: 'SUBMIT',  batch_id }
//                 → batch:{id}        { status: 'SUBMITTED', batch_id }
//   decide_batch  → batch:{id}        { status: 'APPROVED' | 'DRAFT', batch_id }
//                 → user:{id}         { event: 'APPROVE' | 'REJECT', batch_id }
// ---------------------------------------------------------------------------

export type BatchRealtimeKind = "SUBMIT" | "APPROVED" | "RETURNED" | "UNKNOWN";

/** Normalize the payload fields the two RPCs emit into one display kind. */
export function classifyBatchEvent(event: RealtimeEvent): BatchRealtimeKind {
  if (event.event === "SUBMIT") return "SUBMIT";
  if (event.event === "APPROVE") return "APPROVED";
  if (event.event === "REJECT") return "RETURNED";
  if (event.status === "SUBMITTED") return "SUBMIT";
  if (event.status === "APPROVED") return "APPROVED";
  if (event.status === "DRAFT") return "RETURNED";
  return "UNKNOWN";
}
