import { describe, it, expect } from "vitest";
import type { Event as NostrEvent } from "nostr-tools/pure";
import { AuthSession, type AuthSessionState } from "./auth-session.js";
import type {
  AuthenticateResult,
  ChallengeGrant,
  RegisterWorkspaceResult,
} from "../bus/identity-auth.js";
import { IdentityAuthError } from "../bus/identity-auth.js";
import type { IdentityFile } from "../identity/key-store.js";

/**
 * The auth state machine exercised without a network. A fake transport stands in
 * for the Bus so we can prove the branches the protocol defines: single
 * membership -> ready, several -> selection required, 401 -> needs-workspace
 * (register-and-join), 403 -> wrong workspace. This is client logic under test,
 * not a substrate mock: no substrate state is fabricated, only the documented
 * transport responses.
 */

const NPUB = "npub1testtesttesttesttesttesttesttesttesttesttesttesttestts";

function fakeFile(): IdentityFile {
  return {
    version: 1,
    npub: NPUB,
    created_at: new Date().toISOString(),
    kdf: { name: "scrypt", N: 2, r: 8, p: 1, salt: "AAAA" },
    cipher: { name: "aes-256-gcm", iv: "AAAA", ciphertext: "AAAA", tag: "AAAA" },
  };
}

const grant: ChallengeGrant = { challenge: "chal", relay: "http://127.0.0.1:5174", expires_at: "z" };
const fakeSign = (): NostrEvent => ({ kind: 22242, id: "id", sig: "sig" }) as unknown as NostrEvent;

function makeSession(
  authenticate: (workspaceId?: string) => Promise<AuthenticateResult>,
  registerWorkspace: () => Promise<RegisterWorkspaceResult> = async () => ({
    kind: "ready",
    workspaceId: "ws_1",
    identity: { identity_id: "id_1", display_name: "Jamie", pubkey_hex: "ab", npub: NPUB },
  }),
) {
  const states: AuthSessionState[] = [];
  const session = new AuthSession({
    transport: {
      requestChallenge: async () => grant,
      authenticate: async (_event, workspaceId) => authenticate(workspaceId),
      registerWorkspace: async () => registerWorkspace(),
    },
    sign: fakeSign,
    load: () => fakeFile(),
    decrypt: () => new Uint8Array(32),
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  session.subscribe((s) => states.push(s));
  return { session, states };
}

describe("AuthSession", () => {
  it("reaches ready on a single-membership authenticate", async () => {
    const { session } = makeSession(async () => ({
      bearer_token: "bearer-1",
      workspace_id: "ws_1",
      expires_at: null,
      workspace_selection_required: false,
      identity: { identity_id: "id_1", display_name: "Jamie", pubkey_hex: "ab" },
      workspaces: [{ workspace_id: "ws_1", name: "My workspace" }],
    }));

    const state = await session.unlock("pw");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.bearer.token).toBe("bearer-1");
      expect(state.workspace.name).toBe("My workspace");
    }
  });

  it("asks for a workspace selection, then reaches ready when one is chosen", async () => {
    let call = 0;
    const { session } = makeSession(async (workspaceId) => {
      call += 1;
      if (call === 1 && !workspaceId) {
        return {
          bearer_token: null,
          workspace_id: null,
          expires_at: null,
          workspace_selection_required: true,
          identity: { identity_id: "id_1", display_name: "Jamie", pubkey_hex: "ab" },
          workspaces: [
            { workspace_id: "ws_1", name: "One" },
            { workspace_id: "ws_2", name: "Two" },
          ],
        };
      }
      return {
        bearer_token: "bearer-2",
        workspace_id: workspaceId ?? "ws_2",
        expires_at: null,
        workspace_selection_required: false,
        identity: { identity_id: "id_1", display_name: "Jamie", pubkey_hex: "ab" },
        workspaces: [{ workspace_id: "ws_2", name: "Two" }],
      };
    });

    const selecting = await session.unlock("pw");
    expect(selecting.kind).toBe("selecting-workspace");
    if (selecting.kind === "selecting-workspace") {
      expect(selecting.workspaces).toHaveLength(2);
    }

    const ready = await session.selectWorkspace("ws_2");
    expect(ready.kind).toBe("ready");
    if (ready.kind === "ready") expect(ready.workspace.workspace_id).toBe("ws_2");
  });

  it("lands in needs-workspace on a 401, then reaches ready once a workspace is joined", async () => {
    let attempts = 0;
    const { session } = makeSession(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new IdentityAuthError("identity_auth_failed", 401, "not admitted");
      }
      return {
        bearer_token: "bearer-3",
        workspace_id: "ws_1",
        expires_at: null,
        workspace_selection_required: false,
        identity: { identity_id: "id_1", display_name: "Jamie", pubkey_hex: "ab" },
        workspaces: [{ workspace_id: "ws_1", name: "One" }],
      };
    });

    const needs = await session.unlock("pw");
    expect(needs.kind).toBe("needs-workspace");

    // Registering a folder admits this identity; a subsequent handshake succeeds.
    const registered = await session.registerAndJoin({ locator: "/tmp/ws", displayName: "Jamie" });
    expect(registered.kind).toBe("ready");
    const ready = await session.checkNow();
    expect(ready.kind).toBe("ready");
  });

  it("surfaces an error when a chosen workspace is not admitted (403)", async () => {
    let call = 0;
    const { session } = makeSession(async (workspaceId) => {
      call += 1;
      if (call === 1 && !workspaceId) {
        return {
          bearer_token: null,
          workspace_id: null,
          expires_at: null,
          workspace_selection_required: true,
          identity: { identity_id: "id_1", display_name: "Jamie", pubkey_hex: "ab" },
          workspaces: [
            { workspace_id: "ws_1", name: "One" },
            { workspace_id: "ws_2", name: "Two" },
          ],
        };
      }
      throw new IdentityAuthError("identity_not_admitted_to_workspace", 403, "nope");
    });

    await session.unlock("pw");
    const state = await session.selectWorkspace("ws_9");
    expect(state.kind).toBe("error");
  });
});
