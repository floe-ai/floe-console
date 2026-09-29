/**
 * The read/act surface a `workspace_operation` bearer is allowed to use, per
 * client-identity-protocol.md ("Answering as a client-executed Actor") and
 * bus-api.md. A client is a runtime like any other: it does not assemble reply
 * events. It discovers the Actor its identity executes, learns of work by push,
 * claims a delivery, and ends the turn by delivery id and text alone. The
 * substrate owns correlation and resumes the asking Actor in its own context.
 *
 * This module carries a bearer and nothing more privileged, and invents no
 * routes: discovery is ordinary endpoint listing, the answer is the documented
 * turn-result route, and sending work is the documented emit ingress.
 */
export class BusRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "BusRequestError";
    }
}
export class WorkspaceClient {
    options;
    constructor(options) {
        this.options = options;
    }
    url(path, query) {
        const u = new URL(path, this.options.httpBaseUrl);
        if (query)
            for (const [k, v] of Object.entries(query))
                u.searchParams.set(k, v);
        return u.toString();
    }
    authHeaders(extra) {
        return { authorization: `Bearer ${this.options.bearerToken}`, accept: "application/json", ...extra };
    }
    async json(res, what) {
        if (!res.ok) {
            let detail = "";
            try {
                const body = (await res.json());
                detail = body?.error ? `: ${body.error}` : "";
            }
            catch {
                /* empty body */
            }
            throw new BusRequestError(res.status, `${what} failed (${res.status})${detail}`);
        }
        return (await res.json());
    }
    /** All endpoints (Actors) in the workspace, from ordinary listing. */
    async listEndpoints() {
        const res = await fetch(this.url(`/v1/workspaces/${this.options.workspaceId}/endpoints`), {
            headers: this.authHeaders(),
        });
        const body = await this.json(res, "list endpoints");
        return Array.isArray(body) ? body : (body.endpoints ?? []);
    }
    /**
     * Claim the deliveries waiting for a client-executed Endpoint. The bundle
     * carries the request Events (the questions) in `events`; the text the asking
     * Actor put is each event's `content.text`. Claiming only ever succeeds for a
     * client-executed Endpoint in this identity's own admitted workspace.
     */
    async claimDeliveries(endpointId) {
        const res = await fetch(this.url("/v1/delivery/claim", { endpoint_id: endpointId }), {
            headers: this.authHeaders(),
        });
        const body = await this.json(res, "claim delivery");
        return body.deliveries ?? [];
    }
    /**
     * End the turn — the whole answer. `delivery_id` and `text` are all that is
     * required; there is no type, source, destination, correlation id or context.
     * The substrate correlates by the delivery and resumes the asking Actor in the
     * context it asked from. This is the same shape a model runtime reports a turn.
     */
    async endTurn(params) {
        const body = { delivery_id: params.deliveryId, text: params.text };
        if (params.outcome)
            body.outcome = params.outcome;
        if (params.metadata)
            body.metadata = params.metadata;
        const res = await fetch(this.url("/v1/runtime/turn-result"), {
            method: "POST",
            headers: this.authHeaders({ "content-type": "application/json" }),
            body: JSON.stringify(body),
        });
        return this.json(res, "turn result");
    }
    /**
     * Invoke a semantic operation (bus-api.md "Invoke a semantic operation").
     * The Bus answers 200 with a receipt whether it completed or refused; a
     * refusal carries Floe's own reason. Version "1" of input and operation is
     * what the discovered definitions publish for the operations used here.
     */
    async invokeOperation(params) {
        const res = await fetch(this.url(`/v1/workspaces/${this.options.workspaceId}/operations/invoke`), {
            method: "POST",
            headers: this.authHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({
                operation_id: params.operationId,
                operation_version: "1",
                input_schema_version: "1",
                idempotency_key: params.idempotencyKey,
                input: params.input,
            }),
        });
        const body = await this.json(res, params.operationId);
        if (body.kind === "receipt" && body.receipt)
            return body.receipt;
        return { state: body.kind ?? "unknown", refusal: null };
    }
    /**
     * Send work to an Endpoint as a direct (non-graph) Event — the documented
     * `POST /v1/events/emit` ingress, addressed to the target with the message in
     * `content.text`. This is job 2 (send work), distinct from answering.
     */
    async sendWork(params) {
        return this.emit({
            type: "message",
            source_endpoint_id: params.sourceEndpointId,
            destination: { kind: "endpoint", endpoint_id: params.targetEndpointId },
            content: { text: params.body },
        });
    }
    /**
     * The canonical Event command emit (communication ingress). The Bus answers
     * `202` with `{ ok, event_id, deliveries_created }`; a schema mismatch is
     * `400 invalid_event_command`. `workspace_id` is always the bearer's workspace.
     * Emit is NOT how a request is answered — that is `endTurn`.
     */
    async emit(event) {
        const res = await fetch(this.url("/v1/events/emit"), {
            method: "POST",
            headers: this.authHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({ workspace_id: this.options.workspaceId, ...event }),
        });
        return this.json(res, "emit");
    }
}
/** The question the asking Actor put, taken from a delivered event's content.text. */
export function questionText(delivery) {
    for (const ev of delivery.events ?? []) {
        const t = ev.content?.text;
        if (typeof t === "string" && t.trim())
            return t.trim();
    }
    return `request on delivery ${delivery.delivery_id}`;
}
