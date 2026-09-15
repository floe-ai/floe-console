/**
 * The read + emit surface a `workspace_operation` bearer is allowed to use, per
 * client-identity-protocol.md ("Acting as the operator"). Three concerns:
 *
 *   - find the operator Endpoint in a workspace,
 *   - list what actors are waiting on the operator to answer,
 *   - emit a correlated reply (an answer) or a new delivery (sending work).
 *
 * It carries a bearer and nothing more privileged. Every shape here is the
 * documented Bus contract (client-identity-protocol.md + bus-api.md); this
 * module invents no routes and carries no unverified seam.
 */

export interface WorkspaceClientOptions {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly workspaceId: string;
}

export interface Endpoint {
  readonly endpoint_id: string;
  readonly bridge_id: string | null;
  readonly metadata?: { readonly role?: string } & Record<string, unknown>;
  readonly [key: string]: unknown;
}

/** A request an actor addressed to the operator and is now awaiting a reply on. */
export interface PendingResponse {
  readonly correlation_id: string;
  readonly destination_endpoint_id: string;
  readonly waiting_endpoint_id: string;
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

/** The Bus's 202 answer to a successful emit. */
export interface EmitResult {
  readonly ok: boolean;
  readonly event_id?: string;
  readonly deliveries_created?: number;
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

  /** All endpoints in the workspace. */
  async listEndpoints(): Promise<Endpoint[]> {
    const res = await fetch(this.url(`/v1/workspaces/${this.options.workspaceId}/endpoints`), {
      headers: this.authHeaders(),
    });
    const body = await this.json<{ endpoints?: Endpoint[] } | Endpoint[]>(res, "list endpoints");
    return Array.isArray(body) ? body : (body.endpoints ?? []);
  }

  /** The operator Endpoint: role === "operator", bridgeless (bridge_id null). */
  async findOperatorEndpoint(): Promise<Endpoint | null> {
    const endpoints = await this.listEndpoints();
    return (
      endpoints.find((e) => e.metadata?.role === "operator" && e.bridge_id === null) ?? null
    );
  }

  /** Requests actors have addressed to the operator Endpoint and await a reply on. */
  async listPendingForOperator(operatorEndpointId: string): Promise<PendingResponse[]> {
    const res = await fetch(
      this.url("/v1/pending-responses", {
        workspace_id: this.options.workspaceId,
        destination_endpoint_id: operatorEndpointId,
      }),
      { headers: this.authHeaders() },
    );
    const body = await this.json<{ pending_responses?: PendingResponse[] } | PendingResponse[]>(
      res,
      "list pending responses",
    );
    return Array.isArray(body) ? body : (body.pending_responses ?? []);
  }

  /**
   * Emit a correlated reply as the operator Endpoint, answering the actor that
   * is waiting — the documented `POST /v1/events/emit` body from
   * client-identity-protocol.md ("Acting as the operator"): a `response` event
   * whose `content.text` carries the human's answer, addressed to the waiting
   * Endpoint and naming the pending `correlation_id`. On success the pending row
   * moves to `status: "resolved"`.
   */
  async emitOperatorReply(params: {
    operatorEndpointId: string;
    waitingEndpointId: string;
    correlationId: string;
    body: string;
  }): Promise<EmitResult> {
    return this.emit({
      type: "response",
      source_endpoint_id: params.operatorEndpointId,
      destination: { kind: "endpoint", endpoint_id: params.waitingEndpointId },
      correlation_id: params.correlationId,
      content: { text: params.body },
    });
  }

  /**
   * Send work to an Endpoint as a direct (non-graph) Event — the same
   * `POST /v1/events/emit` ingress, addressed to the target Endpoint with the
   * message in `content.text`.
   */
  async sendWork(params: { sourceEndpointId: string; targetEndpointId: string; body: string }): Promise<EmitResult> {
    return this.emit({
      type: "message",
      source_endpoint_id: params.sourceEndpointId,
      destination: { kind: "endpoint", endpoint_id: params.targetEndpointId },
      content: { text: params.body },
    });
  }

  /**
   * The canonical Event command emit. The Bus answers `202` with
   * `{ ok, event_id, deliveries_created }`; a schema mismatch is `400`
   * `invalid_event_command`. `workspace_id` is always the bearer's workspace.
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
