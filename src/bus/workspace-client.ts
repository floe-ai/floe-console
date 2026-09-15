/**
 * The read + emit surface a `workspace_operation` bearer is allowed to use, per
 * client-identity-protocol.md ("Acting as the operator"). Three concerns:
 *
 *   - find the operator Endpoint in a workspace,
 *   - list what actors are waiting on the operator to answer,
 *   - emit a correlated reply (an answer) or a new delivery (sending work).
 *
 * It carries a bearer and nothing more privileged. Every shape here is from the
 * protocol doc / Bus API; this module invents no routes.
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
   * is waiting.
   *
   * SEAM — UNVERIFIED WIRE SHAPE (finding F-DOC). The identity protocol names
   * the route (`POST /v1/events/emit`), the authority (a workspace_operation
   * bearer may emit as the operator Endpoint), and the fields to match
   * (correlation_id, source = operator Endpoint, destination = waiting actor
   * Endpoint) — but no document gives the literal request body: the key names,
   * where the human's answer text goes, or the event `type`. bus-api.md points
   * product clients at runtime operation discovery (`context.communication.emit`)
   * instead, and the two are not reconciled. The body below is the best reading
   * of the named fields and is deliberately the ONLY place that shape lives, so
   * the correct schema drops in here once the doc is fixed or the running Bus
   * confirms it. It is not asserted to be correct.
   */
  async emitOperatorReply(params: {
    operatorEndpointId: string;
    waitingEndpointId: string;
    correlationId: string;
    body: string;
  }): Promise<void> {
    const res = await fetch(this.url("/v1/events/emit"), {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        workspace_id: this.options.workspaceId,
        source_endpoint_id: params.operatorEndpointId,
        destination_endpoint_id: params.waitingEndpointId,
        correlation_id: params.correlationId,
        payload: { body: params.body },
      }),
    });
    await this.json<unknown>(res, "emit reply");
  }

  /**
   * Raw emit, for sending work into an actor Endpoint (a new delivery).
   * SEAM — same unverified `/v1/events/emit` body shape as emitOperatorReply
   * (finding F-DOC).
   */
  async emit(event: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(this.url("/v1/events/emit"), {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ workspace_id: this.options.workspaceId, ...event }),
    });
    return this.json<unknown>(res, "emit");
  }
}
