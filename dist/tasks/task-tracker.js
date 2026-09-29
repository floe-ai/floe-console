function asRecord(value) {
    return typeof value === "object" && value !== null ? value : {};
}
function str(value) {
    return typeof value === "string" && value ? value : null;
}
function textOf(event) {
    const text = asRecord(event.content).text;
    return typeof text === "string" ? text : "";
}
/** A field Floe writes to both content.data and metadata; either is accepted. */
function chainField(event, key) {
    const data = asRecord(asRecord(event.content).data);
    return key in data ? data[key] : asRecord(event.metadata)[key];
}
export class TaskTracker {
    ownEndpointId;
    tasks = new Map();
    deliveryTask = new Map();
    requestTarget = new Map();
    constructor(ownEndpointId) {
        this.ownEndpointId = ownEndpointId;
    }
    /** Newest first. */
    list() {
        return [...this.tasks.values()].reverse();
    }
    /** Returns true when the frame changed a task. */
    push(frame) {
        const p = frame.payload;
        switch (frame.type) {
            case "event_submitted":
                return this.onEvent(asRecord(p.event));
            case "destination_selector_resolved": {
                const id = str(p.event_id);
                if (!id || !Array.isArray(p.destinations) || p.destinations.length > 0)
                    return false;
                return this.advance(id, { kind: "not_delivered" }, ["sent"]);
            }
            case "delivery_created":
                return this.advance(str(p.event_id) ?? "", { kind: "received" }, ["sent"]);
            case "delivery_bundle_available":
                this.onBundle(asRecord(p.delivery));
                return false;
            case "delivery_runtime_prepared":
                return this.advance(this.taskOfDelivery(p), { kind: "working" }, ["sent", "received", "resuming"]);
            case "delivery_failed":
            case "delivery_dead_lettered": {
                const error = str(p.error) ?? "The Actor's turn did not finish.";
                return this.advance(this.taskOfDelivery(p), { kind: "failed", text: error }, [
                    "sent",
                    "received",
                    "working",
                    "resuming",
                ]);
            }
            default:
                return false;
        }
    }
    taskOfDelivery(payload) {
        return this.deliveryTask.get(str(payload.delivery_id) ?? "") ?? "";
    }
    onEvent(event) {
        const eventId = str(event.event_id);
        if (!eventId)
            return false;
        const origin = str(chainField(event, "origin"));
        if (event.type === "request") {
            const dest = asRecord(event.destination);
            this.requestTarget.set(eventId, dest.kind === "endpoint" ? str(dest.endpoint_id) : null);
            return false;
        }
        if (origin === "runtime_turn_result") {
            const taskId = str(chainField(event, "origin_event_id")) ?? "";
            if (chainField(event, "outcome") === "failed")
                return this.set(taskId, { kind: "failed", text: textOf(event) });
            if (chainField(event, "final") === false) {
                const awaiting = chainField(event, "awaiting_request_event_ids");
                const ids = Array.isArray(awaiting) ? awaiting.filter((x) => typeof x === "string") : [];
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
        const dest = asRecord(event.destination);
        if (event.type === "message" &&
            !origin &&
            event.source_endpoint_id === this.ownEndpointId &&
            dest.kind === "endpoint" &&
            !this.tasks.has(eventId)) {
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
    onBundle(delivery) {
        const deliveryId = str(delivery.delivery_id);
        if (!deliveryId)
            return;
        const trigger = str(delivery.trigger_event_id);
        if (trigger && this.tasks.has(trigger)) {
            this.deliveryTask.set(deliveryId, trigger);
            return;
        }
        // A resumed turn is triggered by a request.result, which names the task.
        for (const ev of Array.isArray(delivery.events) ? delivery.events : []) {
            const taskId = str(chainField(asRecord(ev), "origin_event_id"));
            if (taskId && this.tasks.has(taskId)) {
                this.deliveryTask.set(deliveryId, taskId);
                return;
            }
        }
    }
    advance(taskId, phase, from) {
        const task = this.tasks.get(taskId);
        if (!task || !from.includes(task.phase.kind))
            return false;
        return this.set(taskId, phase);
    }
    set(taskId, phase) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        this.tasks.set(taskId, { ...task, phase });
        return true;
    }
}
