/**
 * The client half of the identity handshake, exactly as the substrate documents
 * it in docs/reference/client-identity-protocol.md. Two unauthenticated HTTP
 * calls turn a signed proof-of-key into a scoped `workspace_operation` bearer.
 *
 * This module speaks only the documented wire shapes. It holds no key material
 * (the caller signs with the in-memory secret and passes the event in) and it
 * invents no routes: a challenge is workspace-independent, and the workspaces a
 * bearer may be scoped to come back from `authenticate`, never from a
 * workspace id a human typed.
 */
export class IdentityAuthError extends Error {
    reason;
    status;
    constructor(reason, status, message) {
        super(message);
        this.reason = reason;
        this.status = status;
        this.name = "IdentityAuthError";
    }
}
export class IdentityAuthClient {
    httpBaseUrl;
    constructor(httpBaseUrl) {
        this.httpBaseUrl = httpBaseUrl;
    }
    url(path) {
        return new URL(path, this.httpBaseUrl).toString();
    }
    /** Step 2: obtain a single-use, workspace-independent challenge. */
    async requestChallenge() {
        const res = await fetch(this.url("/v1/identity/challenge"), {
            method: "GET",
            headers: { accept: "application/json" },
        });
        if (!res.ok) {
            throw new IdentityAuthError("unexpected", res.status, `challenge request failed (${res.status})`);
        }
        const body = (await res.json());
        if (!body.challenge || !body.relay) {
            throw new IdentityAuthError("unexpected", res.status, "challenge response missing challenge/relay");
        }
        return body;
    }
    /**
     * Step 4: submit the signed kind:22242 event. `workspaceId` is optional; omit
     * it to discover memberships, or name one to scope the bearer. On success with
     * a single membership (or a valid named one) `bearer_token` is present; with
     * several memberships and no selection, `workspace_selection_required` is true
     * and `bearer_token` is null.
     */
    async authenticate(authEvent, workspaceId) {
        const res = await fetch(this.url("/v1/identity/authenticate"), {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(workspaceId ? { auth_event: authEvent, workspace_id: workspaceId } : { auth_event: authEvent }),
        });
        if (res.ok) {
            return (await res.json());
        }
        const reason = res.status === 401
            ? "identity_auth_failed"
            : res.status === 403
                ? "identity_not_admitted_to_workspace"
                : "unexpected";
        let detail = "";
        try {
            const body = (await res.json());
            detail = body?.error ? `: ${body.error}` : "";
        }
        catch {
            /* body may be empty */
        }
        throw new IdentityAuthError(reason, res.status, `authenticate failed (${res.status})${detail}`);
    }
    /**
     * Register a folder as a workspace and, by the act of registering it, join it.
     * There is no host action and no admission screen: registering a location on
     * this machine is joining it. `authEvent` is a kind:22242 event the caller
     * signed over a fresh challenge, exactly like `authenticate`. This route mints
     * no bearer — after a `ready`/`pending` result the caller runs the ordinary
     * challenge/authenticate handshake and, being admitted to exactly one
     * workspace, gets a single-membership bearer with no selection step.
     *
     * The three success/failure statuses are surfaced verbatim rather than
     * collapsed, because the distinction between "pending because the bridge is
     * down" and "failed because the folder cannot be used" is the whole point.
     */
    async registerWorkspace(authEvent, input) {
        const res = await fetch(this.url("/v1/identity/register-workspace"), {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
                auth_event: authEvent,
                locator: input.locator,
                display_name: input.displayName,
                ...(input.name ? { name: input.name } : {}),
                ...(input.createDirectory ? { create_directory: true } : {}),
            }),
        });
        if (res.status === 201 || res.status === 202) {
            const body = (await res.json());
            const kind = body.materialization?.status === "ready" ? "ready" : "pending";
            return { kind, workspaceId: body.workspace_id, identity: body.identity };
        }
        if (res.status === 422) {
            const body = (await res.json());
            return {
                kind: "failed",
                workspaceId: body.workspace_id,
                identity: body.identity,
                reason: body.materialization?.reason ?? "unknown",
            };
        }
        if (res.status === 401) {
            const message = await this.errorText(res, "the signed proof was rejected");
            return { kind: "refused", message };
        }
        // 400 (bad folder) and anything else the route can honestly return.
        const error = await this.errorCode(res);
        const message = registerInvalidMessage(error);
        return { kind: "invalid", error, message };
    }
    async errorCode(res) {
        try {
            const body = (await res.json());
            return body?.error ?? `http_${res.status}`;
        }
        catch {
            return `http_${res.status}`;
        }
    }
    async errorText(res, fallback) {
        try {
            const body = (await res.json());
            return body?.error ?? fallback;
        }
        catch {
            return fallback;
        }
    }
}
/** Turn the substrate's 400 error codes into copy a person can act on. */
function registerInvalidMessage(error) {
    switch (error) {
        case "workspace_locator_invalid":
            return "That path is not usable. Pick a folder by its full location on this machine.";
        case "workspace_directory_not_found":
            return "That folder does not exist. Choose an existing folder, or create it first.";
        case "identity_register_request_invalid":
            return "The registration was incomplete. This is a console bug — please report it.";
        default:
            return `The folder could not be registered (${error}).`;
    }
}
