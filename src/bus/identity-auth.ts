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
}
