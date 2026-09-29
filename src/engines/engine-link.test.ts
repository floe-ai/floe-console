import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { EnginesClient, type EngineState } from "floe/engines";
import { EngineLink, type EnginesView } from "./engine-link.js";

/**
 * Drives Floe's real EnginesClient through a fake channel, speaking the wire
 * protocol from docs/reference/engine-control-protocol.md: a welcome state,
 * `{type:"request",id,op,args}` out, `{type:"response",id,ok,result|error}`
 * and pushed `{type:"state"}` / `{type:"sign_in"}` messages in.
 */

const signedOut: EngineState = {
  engine: "copilot",
  phase: "action_required",
  authentication: "signed_out",
  access: "unknown",
  reachability: "reachable",
  action: "sign_in",
  message: "Copilot is not signed in on this machine.",
  checked_at: "2026-09-29T00:00:00.000Z",
  revision: 1,
};

const ready: EngineState = {
  ...signedOut,
  phase: "ready",
  authentication: "signed_in",
  access: "entitled",
  account: { label: "octocat" },
  action: undefined,
  message: "Ready.",
  revision: 3,
};

function wire(welcome: Record<string, EngineState>) {
  const socket = new EventEmitter() as EventEmitter & { end: () => void };
  socket.end = () => socket.emit("close");
  let handler: (message: Record<string, unknown>) => void = () => {};
  const sent: Array<{ id: number; op: string; args: Record<string, unknown> }> = [];
  const channel = {
    socket,
    agentVersion: "0.3.5",
    welcomeState: { engines: welcome },
    onMessage: (h: typeof handler) => {
      handler = h;
    },
    send: (message: any) => sent.push(message),
  };
  const client = new EnginesClient(channel as never);
  return {
    client,
    sent,
    push: (message: Record<string, unknown>) => handler(message),
    reply: (id: number, result: unknown) => handler({ type: "response", id, ok: true, result }),
    refuse: (id: number, code: string, message: string) =>
      handler({ type: "response", id, ok: false, error: { code, message } }),
    close: () => socket.emit("close"),
  };
}

function connected(view: EnginesView) {
  if (view.kind !== "connected") throw new Error(`expected connected, got ${view.kind}`);
  return view;
}

const tick = () => new Promise((r) => setImmediate(r));

describe("EngineLink", () => {
  it("shows the welcome state, then every pushed change", async () => {
    const w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    expect(connected(link.getView()).engines.copilot?.authentication).toBe("signed_out");

    w.push({ type: "state", engine: "copilot", state: ready });
    expect(connected(link.getView()).engines.copilot?.phase).toBe("ready");
  });

  it("starts the vendor sign-in, follows its progress, and cancels by operation id", async () => {
    const w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();

    const signing = link.signIn("copilot");
    expect(connected(link.getView()).signIns.copilot).toEqual({ kind: "requesting" });
    expect(w.sent[0]).toMatchObject({ type: "request", op: "sign_in", args: { engine: "copilot" } });
    w.reply(w.sent[0]!.id, { operation_id: "signin-1" });
    await signing;
    expect(connected(link.getView()).signIns.copilot).toMatchObject({ operationId: "signin-1", status: "starting" });

    w.push({ type: "sign_in", operation_id: "signin-1", engine: "copilot", status: "waiting_for_person", message: "Finish in your browser." });
    expect(connected(link.getView()).signIns.copilot).toEqual({
      kind: "progress",
      operationId: "signin-1",
      status: "waiting_for_person",
      message: "Finish in your browser.",
    });

    const cancelling = link.cancelSignIn("copilot");
    expect(w.sent[1]).toMatchObject({ op: "cancel_sign_in", args: { operation_id: "signin-1" } });
    w.reply(w.sent[1]!.id, { cancelled: true });
    await cancelling;
    w.push({ type: "sign_in", operation_id: "signin-1", engine: "copilot", status: "cancelled", message: "Sign-in cancelled." });
    expect(connected(link.getView()).signIns.copilot).toMatchObject({ status: "cancelled" });
  });

  it("keeps a pushed step that arrives before the sign_in reply", async () => {
    const w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    const signing = link.signIn("copilot");
    w.push({ type: "sign_in", operation_id: "signin-2", engine: "copilot", status: "waiting_for_person", message: "" });
    w.reply(w.sent[0]!.id, { operation_id: "signin-2" });
    await signing;
    expect(connected(link.getView()).signIns.copilot).toMatchObject({ status: "waiting_for_person" });
  });

  it("shows a sign-in started by another surface", async () => {
    const w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    w.push({ type: "sign_in", operation_id: "other", engine: "copilot", status: "starting", message: "Opening sign-in." });
    expect(connected(link.getView()).signIns.copilot).toMatchObject({ operationId: "other", status: "starting" });
  });

  it.each([
    ["sign_in_in_progress", "A Copilot sign-in is already in progress."],
    ["copilot_cli_unavailable", "The Copilot CLI shipped with Floe could not be found."],
    ["sign_in_unsupported", "This engine cannot sign in from Floe."],
  ])("shows a %s refusal with Floe's own words", async (code, message) => {
    const w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    const signing = link.signIn("copilot");
    w.refuse(w.sent[0]!.id, code, message);
    await signing;
    expect(connected(link.getView()).signIns.copilot).toEqual({ kind: "refused", code, message });
  });

  it("does not cancel before Floe has named the operation", async () => {
    const w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    void link.signIn("copilot");
    await link.cancelSignIn("copilot");
    expect(w.sent.map((m) => m.op)).toEqual(["sign_in"]);
  });

  it("asks for one fresh check on Try again, and shows a refusal", async () => {
    const w = wire({ copilot: { ...signedOut, action: "retry", phase: "unavailable" } });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    const refreshing = link.refresh("copilot");
    expect(w.sent[0]).toMatchObject({ op: "refresh", args: { engine: "copilot" } });
    w.refuse(w.sent[0]!.id, "unknown_engine", "No engine named copilot.");
    await refreshing;
    expect(connected(link.getView()).problems.copilot).toBe("No engine named copilot.");
  });

  it("says plainly when engine control goes away, and reconnects on request", async () => {
    let w = wire({ copilot: signedOut });
    const link = new EngineLink(async () => w.client);
    await link.connect();
    w.close();
    await tick();
    expect(link.getView().kind).toBe("unavailable");
    w = wire({ copilot: ready });
    await link.connect();
    expect(connected(link.getView()).engines.copilot?.phase).toBe("ready");
  });

  it("reports engine control it cannot reach", async () => {
    const link = new EngineLink(async () => {
      throw new Error("Floe's engine control is not running.");
    });
    await link.connect();
    expect(link.getView()).toEqual({ kind: "unavailable", message: "Floe's engine control is not running." });
  });
});
