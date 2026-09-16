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

export interface WorkspaceClientOptions {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly workspaceId: string;
}

/**
 * An endpoint from ordinary Actor listing. A **client-executed** Actor — the one
 * this identity runs — is the entry whose resolved runtime adapter is `client`;
 * a model-backed Actor resolves to a Bridge adapter (e.g. `floe-runtime`). There
 * is no role field and the id is opaque: never construct it from a convention.
 */
export interface Endpoint {
  readonly endpoint_id: string;
  readonly adapter_id?: string;
  readonly name?: string;
  readonly bridge_id: string | null;
  readonly [key: string]: unknown;
}

/** One event carried in a claimed delivery — the asking Actor's request. */
export interface DeliveredEvent {
  readonly type?: string;
  readonly content?: { readonly text?: string } & Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * A delivery waiting for a client-executed Endpoint. `delivery_id` is what a
 * turn result is reported against; `events` carries the request(s) to answer.
 */
export interface Delivery {
  readonly delivery_id: string;
  readonly endpoint_id: string;
  readonly events: DeliveredEvent[];
  readonly [key: string]: unknown;
}

export class BusRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BusRequestError";
  }
}

/** The Bus's 202 answer to an accepted emit (sending work). */
export interface EmitResult {
  readonly ok: boolean;
  readonly event_id?: string;
  readonly deliveries_created?: number;
  readonly [key: string]: unknown;
}

/** The Bus's 202 answer to a turn ending (answering). */
export interface TurnResult {
  readonly ok: boolean;
  readonly [key: string]: unknown;
}

export class WorkspaceClient {
  constructor(private readonly options: WorkspaceClientOptions) {}

  private url(path: string, query?: Record<string, string>): string {
    const u = new URL(path, this.options.httpBaseUrl);
    if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { authorization: `Bearer ${this.options.bearerToken}`, accept: "application/json", ...extra };
  }

  private async json<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { error?: string };
        detail = body?.error ? `: ${body.error}` : "";
      } catch {
        /* empty body */
      }
      throw new BusRequestError(res.status, `${what} failed (${res.status})${detail}`);
    }
    return (await res.json()) as T;
  }

  /** All endpoints (Actors) in the workspace, from ordinary listing. */
  async listEndpoints(): Promise<Endpoint[]> {
    const res = await fetch(this.url(`/v1/workspaces/${this.options.workspaceId}/endpoints`), {
      headers: this.authHeaders(),
    });
    const body = await this.json<{ endpoints?: Endpoint[] } | Endpoint[]>(res, "list endpoints");
    return Array.isArray(body) ? body : (body.endpoints ?? []);
  }

  /**
   * The Actor this identity executes: the one whose resolved runtime adapter is
   * `client`. Found by ordinary listing, never by a naming convention or a role
   * field. Returns null if this workspace exposes no client-executed Actor.
   */
  async findClientActor(): Promise<Endpoint | null> {
    const endpoints = await this.listEndpoints();
    return endpoints.find((e) => e.adapter_id === "client") ?? null;
  }

  /**
   * Claim the deliveries waiting for a client-executed Endpoint. The bundle
   * carries the request Events (the questions) in `events`; the text the asking
   * Actor put is each event's `content.text`. Claiming only ever succeeds for a
   * client-executed Endpoint in this identity's own admitted workspace.
   */
  async claimDeliveries(endpointId: string): Promise<Delivery[]> {
    const res = await fetch(this.url("/v1/delivery/claim", { endpoint_id: endpointId }), {
      headers: this.authHeaders(),
    });
    const body = await this.json<{ deliveries?: Delivery[] }>(res, "claim delivery");
    return body.deliveries ?? [];
  }

  /**
   * End the turn — the whole answer. `delivery_id` and `text` are all that is
   * required; there is no type, source, destination, correlation id or context.
   * The substrate correlates by the delivery and resumes the asking Actor in the
   * context it asked from. This is the same shape a model runtime reports a turn.
   */
  async endTurn(params: {
    deliveryId: string;
    text: string;
    outcome?: "completed" | "failed";
    metadata?: Record<string, unknown>;
  }): Promise<TurnResult> {
    const body: Record<string, unknown> = { delivery_id: params.deliveryId, text: params.text };
    if (params.outcome) body.outcome = params.outcome;
    if (params.metadata) body.metadata = params.metadata;
    const res = await fetch(this.url("/v1/runtime/turn-result"), {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    return this.json<TurnResult>(res, "turn result");
  }

  /**
   * Send work to an Endpoint as a direct (non-graph) Event — the documented
   * `POST /v1/events/emit` ingress, addressed to the target with the message in
   * `content.text`. This is job 2 (send work), distinct from answering.
   */
  async sendWork(params: {
    sourceEndpointId: string;
    targetEndpointId: string;
    body: string;
  }): Promise<EmitResult> {
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
  async emit(event: Record<string, unknown>): Promise<EmitResult> {
    const res = await fetch(this.url("/v1/events/emit"), {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ workspace_id: this.options.workspaceId, ...event }),
    });
    return this.json<EmitResult>(res, "emit");
  }
}

/** The question the asking Actor put, taken from a delivered event's content.text. */
export function questionText(delivery: Delivery): string {
  for (const ev of delivery.events ?? []) {
    const t = ev.content?.text;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return `request on delivery ${delivery.delivery_id}`;
}
