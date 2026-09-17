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

import type { Event as NostrEvent } from "nostr-tools/pure";

/** A workspace this key was admitted to, named by the substrate. */
export interface WorkspaceMembership {
  readonly workspace_id: string;
  readonly name: string;
}

export interface IdentitySummary {
  readonly identity_id: string;
  readonly display_name: string;
  readonly pubkey_hex: string;
}

/** GET /v1/identity/challenge response. `relay` is echoed verbatim when signing. */
export interface ChallengeGrant {
  readonly challenge: string;
  readonly relay: string;
  readonly expires_at: string;
}

/** POST /v1/identity/authenticate response. */
export interface AuthenticateResult {
  /** Null when a workspace selection is required. */
  readonly bearer_token: string | null;
  readonly workspace_id: string | null;
  readonly expires_at: string | null;
  readonly workspace_selection_required: boolean;
  readonly identity: IdentitySummary;
  readonly workspaces: readonly WorkspaceMembership[];
}

/** Why an authenticate call was refused, mapped from the documented statuses. */
export type AuthFailureReason =
  | "identity_auth_failed" // 401: bad sig, expired/unknown challenge, wrong relay, stale, unadmitted/revoked
  | "identity_not_admitted_to_workspace" // 403: named a workspace this key can't act in
  | "unexpected";

/** What the caller supplies to register (and thereby join) a workspace at a folder. */
export interface RegisterWorkspaceInput {
  /** Absolute path to the folder. A relative path is a 400, not an auth failure. */
  readonly locator: string;
  /** Required display name the key is admitted under, so it stays legible. */
  readonly displayName: string;
  /** Workspace display name; the substrate derives it from the folder when omitted. */
  readonly name?: string;
  /** True only when the human chose a folder that does not exist yet. */
  readonly createDirectory?: boolean;
}

/** The identity echo the register route returns alongside the workspace id. */
export interface RegisteredIdentity {
  readonly identity_id: string;
  readonly display_name: string;
  readonly pubkey_hex: string;
  readonly npub: string;
}

/**
 * The outcome of register-and-join, discriminated exactly as the substrate's
 * three HTTP statuses are (client-identity-protocol / the landed route):
 *
 *  - `ready`   (201): the folder exists on disk with its template, or an existing
 *                     `.floe` was preserved. Proven by the bridge reading disk.
 *  - `pending` (202): registration and admission are durably committed, but the
 *                     bridge has not confirmed materialisation — almost always
 *                     because it is not running. NOT a failure; the key can act.
 *  - `failed`  (422): the bridge processed the folder and it cannot be used, with
 *                     a real reason to show — never "try again later".
 *  - `invalid` (400): a bad folder (relative/invalid locator, or missing without
 *                     create_directory) — a client error, told apart from a bad
 *                     signature.
 *  - `refused` (401): a bad, replayed, or forged proof.
 */
export type RegisterWorkspaceResult =
  | { readonly kind: "ready"; readonly workspaceId: string; readonly identity: RegisteredIdentity }
  | { readonly kind: "pending"; readonly workspaceId: string; readonly identity: RegisteredIdentity }
  | {
      readonly kind: "failed";
      readonly workspaceId: string;
      readonly identity: RegisteredIdentity;
      readonly reason: string;
    }
  | { readonly kind: "invalid"; readonly error: string; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

export class IdentityAuthError extends Error {
  constructor(
    readonly reason: AuthFailureReason,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "IdentityAuthError";
  }
}

export class IdentityAuthClient {
  constructor(private readonly httpBaseUrl: string) {}

  private url(path: string): string {
    return new URL(path, this.httpBaseUrl).toString();
  }

  /** Step 2: obtain a single-use, workspace-independent challenge. */
  async requestChallenge(): Promise<ChallengeGrant> {
    const res = await fetch(this.url("/v1/identity/challenge"), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new IdentityAuthError("unexpected", res.status, `challenge request failed (${res.status})`);
    }
    const body = (await res.json()) as ChallengeGrant;
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
  async authenticate(authEvent: NostrEvent, workspaceId?: string): Promise<AuthenticateResult> {
    const res = await fetch(this.url("/v1/identity/authenticate"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(
        workspaceId ? { auth_event: authEvent, workspace_id: workspaceId } : { auth_event: authEvent },
      ),
    });

    if (res.ok) {
      return (await res.json()) as AuthenticateResult;
    }

    const reason: AuthFailureReason =
      res.status === 401
        ? "identity_auth_failed"
        : res.status === 403
          ? "identity_not_admitted_to_workspace"
          : "unexpected";
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body?.error ? `: ${body.error}` : "";
    } catch {
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
  async registerWorkspace(
    authEvent: NostrEvent,
    input: RegisterWorkspaceInput,
  ): Promise<RegisterWorkspaceResult> {
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
      const body = (await res.json()) as {
        workspace_id: string;
        identity: RegisteredIdentity;
        materialization: { status: string; reason?: string };
      };
      const kind = body.materialization?.status === "ready" ? "ready" : "pending";
      return { kind, workspaceId: body.workspace_id, identity: body.identity };
    }

    if (res.status === 422) {
      const body = (await res.json()) as {
        workspace_id: string;
        identity: RegisteredIdentity;
        materialization: { status: string; reason?: string };
      };
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

  private async errorCode(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string };
      return body?.error ?? `http_${res.status}`;
    } catch {
      return `http_${res.status}`;
    }
  }

  private async errorText(res: Response, fallback: string): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string };
      return body?.error ?? fallback;
    } catch {
      return fallback;
    }
  }
}

/** Turn the substrate's 400 error codes into copy a person can act on. */
function registerInvalidMessage(error: string): string {
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
