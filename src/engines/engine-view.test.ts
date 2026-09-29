import { describe, expect, it } from "vitest";
import type { EngineState } from "floe/engines";
import type { EnginesView } from "./engine-link.js";
import { actorEngine, buttonFor, engineKeys, heldLine, sendWarnings, showSignIn, signInLine } from "./engine-view.js";

const base: EngineState = {
  engine: "copilot",
  phase: "action_required",
  authentication: "signed_in",
  access: "unknown",
  reachability: "reachable",
  message: "",
  checked_at: "2026-09-29T00:00:00.000Z",
  revision: 1,
};

// The five rows of section 3 in floe-engine-signin-design.md, as Floe sends them.
const rows: Array<[string, EngineState, string, "i" | "r"]> = [
  ["signed out", { ...base, authentication: "signed_out", action: "sign_in", message: "Copilot is not signed in on this machine." }, "Sign in", "i"],
  ["no plan", { ...base, access: "not_entitled", action: "check_subscription", message: "Signed in as X, but this account has no Copilot plan usable by the CLI." }, "Check subscription", "r"],
  ["blocked by organisation", { ...base, access: "policy_blocked", action: "contact_admin", message: "Signed in as X, but your organization has disabled Copilot CLI." }, "Contact administrator", "r"],
  ["access unconfirmed", { ...base, phase: "unavailable", action: "retry", message: "Signed in as X, but Copilot access could not be confirmed: timeout" }, "Try again", "r"],
  ["unreachable", { ...base, phase: "unavailable", reachability: "unreachable", action: "retry", message: "Copilot could not be reached." }, "Try again", "r"],
];

function view(state: EngineState, signIns: Record<string, any> = {}): EnginesView {
  return { kind: "connected", engines: { copilot: state }, signIns, problems: {} };
}

describe("engine wording", () => {
  it.each(rows)("%s: shows its own action", (_name, state, label, key) => {
    expect(buttonFor(state)?.label).toBe(label);
    expect(engineKeys(view(state))[0]?.key).toBe(key);
  });

  it("never offers Sign in for a plan or policy problem", () => {
    for (const [, state] of rows.filter(([name]) => name === "no plan" || name === "blocked by organisation")) {
      expect(buttonFor(state)?.action).not.toBe("sign_in");
      expect(buttonFor(state)?.note).toMatch(/Signing in again will not help/);
      expect(engineKeys(view(state)).some((k) => k.act === "sign_in")).toBe(false);
    }
  });

  it("offers no action when Floe asks for none", () => {
    const ready = { ...base, phase: "ready" as const, access: "entitled" as const, message: "Ready." };
    expect(buttonFor(ready)).toBeNull();
    expect(engineKeys(view(ready))).toEqual([]);
    expect(sendWarnings(view(ready))).toEqual([]);
  });

  it("offers only Cancel while a sign-in is running", () => {
    const signedOut = rows[0]![1];
    const signing = { kind: "progress", operationId: "op", status: "waiting_for_person", message: "" };
    expect(engineKeys(view(signedOut, { copilot: signing }))).toEqual([
      { key: "c", label: "cancel sign-in", act: "cancel", engine: "copilot" },
    ]);
    expect(engineKeys(view(signedOut, { copilot: { kind: "requesting" } }))).toEqual([]);
  });

  it("names every sign-in step", () => {
    const step = (status: string, message = "") => signInLine({ kind: "progress", operationId: "op", status: status as never, message });
    expect(step("starting").text).toBe("Starting sign-in…");
    expect(step("waiting_for_person").text).toBe("Finish signing in in your browser.");
    expect(step("waiting_for_person").cancellable).toBe(true);
    expect(step("succeeded").text).toBe("Sign-in finished.");
    expect(step("failed", "The browser window was closed.")).toMatchObject({ tone: "problem", detail: "The browser window was closed." });
    expect(step("cancelled").cancellable).toBe(false);
  });

  it("keeps a finished sign-in only while the engine is still not ready", () => {
    const done = { kind: "progress" as const, operationId: "op", status: "failed" as const, message: "" };
    expect(showSignIn(rows[0]![1], done)).toBe(true);
    expect(showSignIn({ ...base, phase: "ready" }, done)).toBe(false);
  });

  it("warns before sending, in Floe's words, that work will wait", () => {
    expect(sendWarnings(view(rows[0]![1]))).toEqual([
      "Copilot is not ready: Copilot is not signed in on this machine. Floe holds work you send now and runs it once Copilot is ready.",
    ]);
    expect(sendWarnings({ kind: "unavailable", message: "not running" })).toEqual([
      "The console can't see whether the AI engine is ready: not running",
    ]);
  });

  it("warns only about the engine the chosen Actor uses, once Floe has said which", () => {
    const signedOut = rows[0]![1];
    const other: EngineState = { ...signedOut, engine: "claude", message: "Claude is not signed in on this machine." };
    const two: EnginesView = { kind: "connected", engines: { copilot: signedOut, claude: other }, signIns: {}, problems: {} };
    const actor = (metadata?: unknown) => ({ endpoint_id: "e", bridge_id: null, metadata });

    expect(actorEngine(actor({ runtime_adapter: "floe-runtime", engine: "claude" }))).toBe("claude");
    expect(sendWarnings(two, "claude")).toEqual([
      "Claude is not ready: Claude is not signed in on this machine. Floe holds work you send now and runs it once Claude is ready.",
    ]);

    // Floe says the Actor's runtime needs no engine.
    expect(actorEngine(actor({ engine: null }))).toBeNull();
    expect(sendWarnings(two, null)).toEqual([]);
    expect(sendWarnings({ kind: "unavailable", message: "not running" }, null)).toEqual([]);

    // No Bridge has picked the Actor up yet: every engine, as before.
    for (const unsaid of [actor(), actor({}), actor({ engine: "" })]) expect(actorEngine(unsaid)).toBeUndefined();
    expect(sendWarnings(two, undefined)).toHaveLength(2);

    // An engine Floe's engine control has not reported on.
    expect(sendWarnings(view(signedOut), "claude")).toEqual(["Floe has not said whether Claude is ready yet."]);
    expect(sendWarnings({ kind: "unavailable", message: "not running" }, "copilot")).toEqual([
      "The console can't see whether Copilot is ready: not running",
    ]);
    expect(sendWarnings(two, "copilot")).toHaveLength(1);
  });

  it("says a held task is waiting for sign-in, not failed", () => {
    const held = { engine: "copilot", message: "Sign in to GitHub Copilot." };
    expect(heldLine(held, view(rows[0]![1]))).toBe("Waiting for sign-in. Floe runs this once Copilot is signed in.");
    expect(heldLine(held, view(rows[1]![1]))).toBe(`Waiting for Copilot: ${rows[1]![1].message}`);
    expect(heldLine(held, view({ ...base, phase: "ready" }))).toBe("Waiting to start.");
    expect(heldLine({ engine: null, message: "The message was accepted and is waiting." }, view(rows[0]![1]))).toBe(
      "Waiting. Floe is holding this until it can run: The message was accepted and is waiting.",
    );
  });
});
