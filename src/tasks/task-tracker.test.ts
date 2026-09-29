import { describe, it, expect } from "vitest";
import { TaskTracker } from "./task-tracker.js";
import type { PushFrame } from "../bus/types.js";

const ME = "endpoint:me";
const FLOE = "endpoint:floe";
let seq = 0;
const frame = (type: string, payload: Record<string, unknown>): PushFrame => ({
  type,
  payload,
  at: new Date().toISOString(),
  cursor: `c${++seq}`,
});

const task = frame("event_submitted", {
  event: {
    event_id: "evt-task",
    type: "message",
    source_endpoint_id: ME,
    destination_json: { kind: "endpoint", endpoint_id: FLOE },
    content: { text: "Ask me red or blue, then use it." },
  },
});

function result(text: string, extra: Record<string, unknown>) {
  const chain = { origin: "runtime_turn_result", outcome: "completed", origin_event_id: "evt-task", ...extra };
  return frame("event_submitted", {
    event: {
      event_id: `evt-result-${seq}`,
      type: "message",
      source_endpoint_id: FLOE,
      destination_json: { kind: "context", context_id: "ctx" },
      content: { text, data: chain },
      metadata: chain,
    },
  });
}

describe("TaskTracker", () => {
  it("walks received → working → waiting on you → resuming → working → done", () => {
    const t = new TaskTracker(ME);
    t.push(task);
    expect(t.list()[0]?.phase.kind).toBe("sent");

    t.push(frame("delivery_created", { event_id: "evt-task", destination_endpoint_id: FLOE }));
    expect(t.list()[0]?.phase.kind).toBe("received");

    t.push(frame("delivery_bundle_available", { delivery: { delivery_id: "d1", endpoint_id: FLOE, trigger_event_id: "evt-task", events: [] } }));
    t.push(frame("delivery_runtime_prepared", { delivery_id: "d1" }));
    expect(t.list()[0]?.phase.kind).toBe("working");

    t.push(frame("event_submitted", {
      event: { event_id: "evt-req", type: "request", source_endpoint_id: FLOE, destination_json: { kind: "endpoint", endpoint_id: ME } },
    }));
    t.push(result("I asked you.", { final: false, awaiting_request_event_ids: ["evt-req"] }));
    expect(t.list()[0]?.phase).toEqual({ kind: "waiting", onYou: true, text: "I asked you." });

    const ret = { origin: "runtime_request_return", origin_event_id: "evt-task" };
    t.push(frame("event_submitted", {
      event: { event_id: "evt-ret", type: "request.result", content: { text: "Blue.", data: ret }, metadata: ret },
    }));
    expect(t.list()[0]?.phase).toEqual({ kind: "resuming", answer: "Blue." });

    // The resumed delivery is triggered by the return, which names the task.
    t.push(frame("delivery_bundle_available", {
      delivery: { delivery_id: "d2", endpoint_id: FLOE, trigger_event_id: "evt-ret", events: [{ event_id: "evt-ret", metadata: ret }] },
    }));
    t.push(frame("delivery_runtime_prepared", { delivery_id: "d2" }));
    expect(t.list()[0]?.phase.kind).toBe("working");

    t.push(result("You chose blue. Done.", { final: true, awaiting_request_event_ids: [] }));
    expect(t.list()[0]?.phase).toEqual({ kind: "done", text: "You chose blue. Done." });
  });

  it("says waiting on another Actor when the request is not addressed to this person", () => {
    const t = new TaskTracker(ME);
    t.push(task);
    t.push(frame("event_submitted", {
      event: { event_id: "evt-req2", type: "request", destination_json: { kind: "endpoint", endpoint_id: "endpoint:other" } },
    }));
    t.push(result("", { final: false, awaiting_request_event_ids: ["evt-req2"] }));
    expect(t.list()[0]?.phase).toMatchObject({ kind: "waiting", onYou: false });
  });

  it("shows a failed turn with its reason, and a delivery to no one", () => {
    const t = new TaskTracker(ME);
    t.push(task);
    t.push(result("Runtime turn failed … HTTP 502", { outcome: "failed", final: true }));
    expect(t.list()[0]?.phase).toEqual({ kind: "failed", text: "Runtime turn failed … HTTP 502" });

    const u = new TaskTracker(ME);
    u.push(task);
    u.push(frame("destination_selector_resolved", { event_id: "evt-task", destinations: [] }));
    expect(u.list()[0]?.phase.kind).toBe("not_delivered");
  });

  it("ignores the person's own answers and other people's work", () => {
    const t = new TaskTracker(ME);
    // Answering ends this Actor's turn: a runtime_turn_result sourced from ME.
    t.push(frame("event_submitted", {
      event: {
        event_id: "evt-answer",
        type: "message",
        source_endpoint_id: ME,
        destination_json: { kind: "context", context_id: "ctx" },
        content: { text: "Blue.", data: { origin: "runtime_turn_result" } },
      },
    }));
    t.push(frame("event_submitted", {
      event: { event_id: "evt-x", type: "message", source_endpoint_id: "endpoint:someone", destination_json: { kind: "endpoint", endpoint_id: FLOE } },
    }));
    expect(t.list()).toEqual([]);
  });
});
