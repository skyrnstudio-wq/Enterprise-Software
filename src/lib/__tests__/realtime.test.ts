import { describe, expect, it } from "vitest";
import {
  startRealtime,
  subscribeBatch,
  classifyBatchEvent,
  type RealtimePort,
  type RealtimeEvent,
} from "../realtime";

/**
 * Realtime tests — Phase 5 step 6/8. The transport is injected (no network):
 * a fake port records subscriptions so the wiring contract is pinned without
 * supabase-js. Event classification covers the exact payload shapes the two
 * RPCs emit (migration 005).
 */

function makeFakePort(): RealtimePort & {
  topics: () => string[];
  emit: (topic: string, e: RealtimeEvent) => void;
  stops: () => number;
} {
  const handlers = new Map<string, (e: RealtimeEvent) => void>();
  let stopCount = 0;
  return {
    subscribe(topic, handler) {
      handlers.set(topic, handler);
      return () => {
        stopCount += 1;
        handlers.delete(topic);
      };
    },
    topics: () => [...handlers.keys()],
    emit: (topic, e) => handlers.get(topic)?.(e),
    stops: () => stopCount,
  };
}

describe("realtime event classification (RPC payload shapes)", () => {
  it("maps submit_batch payloads", () => {
    expect(classifyBatchEvent({ event: "SUBMIT", batch_id: "b1" })).toBe("SUBMIT");
    expect(classifyBatchEvent({ status: "SUBMITTED", batch_id: "b1" })).toBe("SUBMIT");
  });

  it("maps decide_batch approve payloads", () => {
    expect(classifyBatchEvent({ event: "APPROVE", batch_id: "b1" })).toBe("APPROVED");
    expect(classifyBatchEvent({ status: "APPROVED", batch_id: "b1" })).toBe("APPROVED");
  });

  it("maps decide_batch reject payloads to RETURNED", () => {
    expect(classifyBatchEvent({ event: "REJECT", batch_id: "b1" })).toBe("RETURNED");
    expect(classifyBatchEvent({ status: "DRAFT", batch_id: "b1" })).toBe("RETURNED");
  });

  it("unknown payloads never fabricate a verdict", () => {
    expect(classifyBatchEvent({})).toBe("UNKNOWN");
    expect(classifyBatchEvent({ status: "WEIRD" })).toBe("UNKNOWN");
  });
});

describe("realtime wiring (step 6)", () => {
  it("QH gets the role channel; everyone gets their user channel", () => {
    const port = makeFakePort();
    const w1 = startRealtime({
      userId: "u-1",
      isQualityHead: true,
      onEvent: () => {},
      port,
    });
    expect(port.topics().sort()).toEqual(["role:QUALITY_HEAD", "user:u-1"]);
    w1.stop();

    const port2 = makeFakePort();
    const w2 = startRealtime({
      userId: "u-2",
      isQualityHead: false,
      onEvent: () => {},
      port: port2,
    });
    expect(port2.topics()).toEqual(["user:u-2"]);
    w2.stop();
  });

  it("events reach onEvent tagged with their topic", () => {
    const port = makeFakePort();
    const seen: Array<[string, RealtimeEvent]> = [];
    const w = startRealtime({
      userId: "u-9",
      isQualityHead: true,
      onEvent: (topic, e) => {
        seen.push([topic, e]);
      },
      port,
    });
    port.emit("role:QUALITY_HEAD", { event: "SUBMIT", batch_id: "b-1" });
    expect(seen).toEqual([["role:QUALITY_HEAD", { event: "SUBMIT", batch_id: "b-1" }]]);
    w.stop();
  });

  it("stop tears down every subscription", () => {
    const port = makeFakePort();
    const w = startRealtime({ userId: "u-1", isQualityHead: true, onEvent: () => {}, port });
    expect(port.stops()).toBe(0);
    w.stop();
    expect(port.stops()).toBe(2);
    expect(port.topics()).toEqual([]);
  });

  it("subscribeBatch pins the batch:{id} topic (edge 5.2)", () => {
    const port = makeFakePort();
    const stop = subscribeBatch("b-7", () => {}, port);
    expect(port.topics()).toEqual(["batch:b-7"]);
    stop();
    expect(port.topics()).toEqual([]);
  });
});
