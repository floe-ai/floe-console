import type { PushFrame } from "../bus/types.js";

/**
 * What became of the work this person sent, built only from pushed frames.
 *
 * A task is an Event the person's own Actor sent (seen pushed as
 * `event_submitted`). Each step is a frame that really happened:
 *  - received: `delivery_created` for that event
 *  - held:     `runtime_telemetry` of kind `engine_not_ready` for a delivery that
 *    carries it (the Bridge handed it back unstarted), or of kind
 *    `runtime_unconfigured` naming it (sent while its Actor was already held)
 *  - working:  `delivery_runtime_prepared` for a delivery that carries it
 *  - result:   a `runtime_turn_result` message whose `origin_event_id` is the task.
 *    `final: false` means the Actor asked something and will resume once answered.
 *  - resumed:  a `request.result` whose `origin_event_id` is the task.
 *
 * Floe names the task on every result and return (`origin_event_id`), so this
 * never walks the chain itself. Only the Actor the task was sent to can move
 * it: other turns in the chain, including this person's own answer, name the
 * same task. It holds only what these few lines need, and only for this session.
 */

export type TaskPhase =
  | { readonly kind: "sent" }
  | { readonly kind: "not_delivered" }
  | { readonly kind: "received" }
  /**
   * Floe is holding it unstarted until the Actor can run (an engine that is not
   * ready). Nothing failed; it runs by itself once the engine is ready.
   * `engine` is null when Floe's signal did not name one.
   */
  | { readonly kind: "held"; readonly engine: string | null; readonly message: string }
  | { readonly kind: "working" }
  | {
      readonly kind: "waiting";
      /** True when the Actor is waiting on this person; false for another Actor. */
      readonly onYou: boolean;
      readonly text: string;
    }
  | { readonly kind: "resuming"; readonly answer: string }
  | { readonly kind: "done"; readonly text: string }
  | { readonly kind: "failed"; readonly text: string };

export interface Task {
  readonly eventId: string;
  readonly text: string;
  readonly targetEndpointId: string | null;
  readonly phase: TaskPhase;
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return typeof value === "object" && value !== null ? (value as Json) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function textOf(event: Json): string {
  const text = asRecord(event.content).text;
  return typeof text === "string" ? text : "";
}

/** A field Floe writes to both content.data and metadata; either is accepted. */
function chainField(event: Json, key: string): unknown {
  const data = asRecord(asRecord(event.content).data);
  return key in data ? data[key] : asRecord(event.metadata)[key];
}

export class TaskTracker {
  private readonly tasks = new Map<string, Task>();
  private readonly deliveryTask = new Map<string, string>();
  private readonly requestTarget = new Map<string, string | null>();
  /** The engine Floe last said an Actor is held for, until its work starts. */
  private readonly heldEngine = new Map<string, string>();

  constructor(readonly ownEndpointId: string) {}

  /** Newest first. */
  list(): Task[] {
    return [...this.tasks.values()].reverse();
  }

  /** Returns true when the frame changed a task. */
  push(frame: PushFrame): boolean {
    const p = frame.payload;
    switch (frame.type) {
      case "event_submitted":
        return this.onEvent(asRecord(p.event));
      case "destination_selector_resolved": {
        const id = str(p.event_id);
        if (!id || !Array.isArray(p.destinations) || p.destinations.length > 0) return false;
        return this.advance(id, { kind: "not_delivered" }, ["sent"]);
      }
      case "delivery_created":
        return this.advance(str(p.event_id) ?? "", { kind: "received" }, ["sent"]);
      case "delivery_bundle_available":
        this.onBundle(asRecord(p.delivery));
        return false;
      case "runtime_telemetry":
        return this.onTelemetry(asRecord(p.telemetry));
      case "delivery_runtime_prepared": {
        const taskId = this.taskOfDelivery(p);
        const endpoint = this.tasks.get(taskId)?.targetEndpointId;
        const moved = this.advance(taskId, { kind: "working" }, ["sent", "received", "held", "resuming"]);
        if (moved && endpoint) this.heldEngine.delete(endpoint);
        return moved;
      }
      case "delivery_failed":
      case "delivery_dead_lettered": {
        const error = str(p.error) ?? "The Actor's turn did not finish.";
        return this.advance(this.taskOfDelivery(p), { kind: "failed", text: error }, [
          "sent",
          "received",
          "held",
          "working",
          "resuming",
        ]);
      }
      default:
        return false;
    }
  }

  private onTelemetry(telemetry: Json): boolean {
    const payload = asRecord(telemetry.payload);
    const message = str(payload.message) ?? "";
    const before: TaskPhase["kind"][] = ["sent", "received", "held", "resuming"];
    if (telemetry.kind === "engine_not_ready") {
      const engine = str(payload.engine);
      const endpoint = str(telemetry.endpoint_id);
      if (engine && endpoint) this.heldEngine.set(endpoint, engine);
      return this.advance(this.taskOfDelivery(telemetry), { kind: "held", engine, message }, before);
    }
    if (telemetry.kind === "runtime_unconfigured") {
      const taskId = str(payload.trigger_event_id) ?? "";
      const endpoint = this.tasks.get(taskId)?.targetEndpointId;
      const engine = endpoint ? (this.heldEngine.get(endpoint) ?? null) : null;
      return this.advance(taskId, { kind: "held", engine, message }, before);
    }
    return false;
  }

  private taskOfDelivery(payload: Json): string {
    return this.deliveryTask.get(str(payload.delivery_id) ?? "") ?? "";
  }

  private onEvent(event: Json): boolean {
    const eventId = str(event.event_id);
    if (!eventId) return false;
    const origin = str(chainField(event, "origin"));

    if (event.type === "request") {
      const dest = asRecord(event.destination_json);
      this.requestTarget.set(eventId, dest.kind === "endpoint" ? str(dest.endpoint_id) : null);
      return false;
    }

    if (origin === "runtime_turn_result") {
      const taskId = str(chainField(event, "origin_event_id")) ?? "";
      // Only the Actor the task went to answers it. This person's own answer to
      // a question is also a turn result naming the same task, and so is any
      // other Actor's turn in the chain; neither is the task's answer.
      if (event.source_endpoint_id !== this.tasks.get(taskId)?.targetEndpointId) return false;
      if (chainField(event, "outcome") === "failed") return this.set(taskId, { kind: "failed", text: textOf(event) });
      if (chainField(event, "final") === false) {
        const awaiting = chainField(event, "awaiting_request_event_ids");
        const ids = Array.isArray(awaiting) ? awaiting.filter((x): x is string => typeof x === "string") : [];
        const onYou = ids.some((id) => this.requestTarget.get(id) === this.ownEndpointId);
        return this.set(taskId, { kind: "waiting", onYou, text: textOf(event) });
      }
      return this.set(taskId, { kind: "done", text: textOf(event) });
    }

    if (event.type === "request.result") {
      const taskId = str(chainField(event, "origin_event_id")) ?? "";
      return this.set(taskId, { kind: "resuming", answer: textOf(event) });
    }

    // The person's own work: a plain message their Actor sent to another Actor.
    const dest = asRecord(event.destination_json);
    if (
      event.type === "message" &&
      !origin &&
      event.source_endpoint_id === this.ownEndpointId &&
      dest.kind === "endpoint" &&
      !this.tasks.has(eventId)
    ) {
      this.tasks.set(eventId, {
        eventId,
        text: textOf(event),
        targetEndpointId: str(dest.endpoint_id),
        phase: { kind: "sent" },
      });
      return true;
    }
    return false;
  }

  private onBundle(delivery: Json): void {
    const deliveryId = str(delivery.delivery_id);
    if (!deliveryId) return;
    const isFor = (taskId: string) => this.tasks.get(taskId)?.targetEndpointId === delivery.endpoint_id;
    const trigger = str(delivery.trigger_event_id);
    if (trigger && this.tasks.has(trigger) && isFor(trigger)) {
      this.deliveryTask.set(deliveryId, trigger);
      return;
    }
    // A resumed turn is triggered by a request.result, which names the task.
    for (const ev of Array.isArray(delivery.events) ? delivery.events : []) {
      const taskId = str(chainField(asRecord(ev), "origin_event_id"));
      if (taskId && this.tasks.has(taskId) && isFor(taskId)) {
        this.deliveryTask.set(deliveryId, taskId);
        return;
      }
    }
  }

  private advance(taskId: string, phase: TaskPhase, from: TaskPhase["kind"][]): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !from.includes(task.phase.kind)) return false;
    return this.set(taskId, phase);
  }

  private set(taskId: string, phase: TaskPhase): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    this.tasks.set(taskId, { ...task, phase });
    return true;
  }
}
