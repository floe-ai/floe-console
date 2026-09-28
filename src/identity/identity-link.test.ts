import { describe, expect, it } from "vitest";
import type { IdentityClient, IdentityState, SessionEvent } from "floe/identity";
import { IdentityLink, type LinkState } from "./identity-link.js";

const unlocked: IdentityState = {
  kind: "unlocked",
  npub: "npub1x",
  pubkey_hex: "ab",
  display_name: "Jamie",
  protection: "passphrase",
  secret_kind: "phrase",
};

function fakeClient(initial: IdentityState) {
  let stateListener: (s: IdentityState) => void = () => {};
  const listeners: Array<(e: SessionEvent) => void> = [];
  const client = {
    state: initial,
    onState: (l: (s: IdentityState) => void) => {
      stateListener = l;
      return () => {};
    },
    onClose: () => () => {},
    session: async (_o: unknown, l: (e: SessionEvent) => void) => {
      listeners.push(l);
      return { id: `s${listeners.length}`, select: async () => {}, end: async () => {} };
    },
    close: () => {},
  };
  return {
    client: client as unknown as IdentityClient,
    push(state: IdentityState) {
      client.state = state;
      stateListener(state);
    },
    sessions: listeners,
  };
}

function session(link: IdentityLink): string {
  const s: LinkState = link.getState();
  return s.kind === "connected" ? s.session.kind : s.kind;
}

describe("IdentityLink", () => {
  it("opens a session for an unlocked identity and shows the pushed bearer", async () => {
    const fake = fakeClient(unlocked);
    const link = new IdentityLink(async () => fake.client);
    await link.connect();
    await Promise.resolve();
    expect(fake.sessions).toHaveLength(1);
    fake.sessions[0]!({
      status: "ready",
      bearer_token: "b1",
      workspace: { workspace_id: "w", name: "W" },
      workspaces: [],
      expires_at: "",
    });
    expect(session(link)).toBe("ready");
  });

  it("waits for the unlock screen for a locked passphrase identity", async () => {
    const fake = fakeClient({ ...unlocked, kind: "locked" });
    const link = new IdentityLink(async () => fake.client);
    await link.connect();
    expect(fake.sessions).toHaveLength(0);
    fake.push(unlocked);
    await Promise.resolve();
    expect(fake.sessions).toHaveLength(1);
  });

  it("opens a session for a locked device identity, which Floe unlocks on demand", async () => {
    const fake = fakeClient({ ...unlocked, kind: "locked", protection: "device" });
    const link = new IdentityLink(async () => fake.client);
    await link.connect();
    expect(fake.sessions).toHaveLength(1);
  });

  it("opens a new session after a restore swaps the key", async () => {
    const fake = fakeClient({ ...unlocked, protection: "device" });
    const link = new IdentityLink(async () => fake.client);
    await link.connect();
    await Promise.resolve();
    fake.sessions[0]!({ status: "ended", reason: "locked" });
    fake.push({ ...unlocked, protection: "device", kind: "locked" });
    expect(fake.sessions).toHaveLength(1);
    fake.push({ ...unlocked, protection: "device" });
    await Promise.resolve();
    expect(fake.sessions).toHaveLength(2);
  });

  it("holds a revoked session until the person asks for a new one", async () => {
    const fake = fakeClient(unlocked);
    const link = new IdentityLink(async () => fake.client);
    await link.connect();
    await Promise.resolve();
    fake.sessions[0]!({ status: "ended", reason: "revoked" });
    expect(session(link)).toBe("stopped");
    fake.push(unlocked);
    expect(fake.sessions).toHaveLength(1);
    await link.reopen();
    await Promise.resolve();
    expect(fake.sessions).toHaveLength(2);
  });

  it("reports an agent it cannot reach", async () => {
    const link = new IdentityLink(async () => {
      throw new Error("not running");
    });
    await link.connect();
    expect(link.getState()).toEqual({ kind: "unavailable", message: "not running" });
  });
});
