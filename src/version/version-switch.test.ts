import { describe, expect, it, vi } from "vitest";
import type { RunningTurn, VersionSwitchOutcome } from "floe/identity";
import {
  describeTurn,
  endpointStatusFrom,
  isNewer,
  ownFloeVersion,
  VersionSwitch,
  type SwitchClient,
} from "./version-switch.js";

const navigator: RunningTurn = { workspace_id: "ws-here", endpoint_id: "ep-nav", name: "Navigator" };
const elsewhere: RunningTurn = { workspace_id: "ws-other", endpoint_id: "ep-far", name: null };

function fake(running: string | null, outcomes: VersionSwitchOutcome[]) {
  const calls: Array<{ interrupt_running_work?: boolean } | undefined> = [];
  const client: SwitchClient = {
    agentVersion: running,
    switchToThisVersion: async (options) => {
      calls.push(options);
      const next = outcomes.shift();
      if (!next) throw new Error("no more outcomes");
      return next;
    },
  };
  const reconnect = vi.fn(async () => {});
  const sw = new VersionSwitch({ ownVersion: "0.4.8", client: () => client, reconnect });
  return { sw, calls, reconnect };
}

describe("isNewer", () => {
  it("compares x.y.z numerically", () => {
    expect(isNewer("0.4.8", "0.4.7")).toBe(true);
    expect(isNewer("0.4.10", "0.4.9")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.4.7", "0.4.8")).toBe(false);
    expect(isNewer("0.4.8", "0.4.8")).toBe(false);
  });
  it("never calls an unreadable version newer", () => {
    expect(isNewer("dev", "0.4.7")).toBe(false);
    expect(isNewer("0.4.8", "")).toBe(false);
  });
});

describe("ownFloeVersion", () => {
  it("reads the version of the Floe copy the console ships", () => {
    expect(ownFloeVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("VersionSwitch.offered", () => {
  it("offers only when the console's Floe is newer than the running one", () => {
    expect(fake("0.4.7", []).sw.offered()).toBe(true);
    expect(fake("0.4.8", []).sw.offered()).toBe(false);
    expect(fake("0.4.9", []).sw.offered()).toBe(false);
    expect(fake(null, []).sw.offered()).toBe(false);
  });
  it("does not offer when not connected or the own version is unknown", () => {
    expect(new VersionSwitch({ ownVersion: "0.4.8", client: () => null, reconnect: async () => {} }).offered()).toBe(false);
    const client: SwitchClient = { agentVersion: "0.4.7", switchToThisVersion: async () => ({ kind: "already_serving", version: "x" }) };
    expect(new VersionSwitch({ ownVersion: null, client: () => client, reconnect: async () => {} }).offered()).toBe(false);
  });
});

describe("VersionSwitch", () => {
  it("switches without interrupting, then reconnects", async () => {
    const { sw, calls, reconnect } = fake("0.4.7", [{ kind: "switched", from: "0.4.7", to: "0.4.8", interrupted: [] }]);
    await sw.start();
    expect(calls).toEqual([{}]);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(sw.getState()).toEqual({ kind: "switched", from: "0.4.7", to: "0.4.8", interrupted: [] });
  });

  it("names the turns in progress and does not interrupt them unasked", async () => {
    const { sw, calls, reconnect } = fake("0.4.7", [{ kind: "work_running", running: [navigator], message: "A turn is in progress" }]);
    await sw.start();
    expect(calls).toEqual([{}]);
    expect(reconnect).not.toHaveBeenCalled();
    expect(sw.getState()).toEqual({ kind: "work_running", running: [navigator], message: "A turn is in progress" });
  });

  it("interrupts only when the person chooses it", async () => {
    const { sw, calls } = fake("0.4.7", [
      { kind: "work_running", running: [navigator], message: "busy" },
      { kind: "switched", from: "0.4.7", to: "0.4.8", interrupted: [navigator] },
    ]);
    await sw.start();
    await sw.interrupt();
    expect(calls).toEqual([{}, { interrupt_running_work: true }]);
    expect(sw.getState()).toMatchObject({ kind: "switched", interrupted: [navigator] });
  });

  it("cancel returns to the offer without switching", async () => {
    const { sw, calls } = fake("0.4.7", [{ kind: "work_running", running: [navigator], message: "busy" }]);
    await sw.start();
    sw.cancel();
    expect(sw.getState()).toEqual({ kind: "idle" });
    expect(calls).toHaveLength(1);
  });

  it("waits by push: asks again once every watched turn has ended", async () => {
    const other: RunningTurn = { workspace_id: "ws-here", endpoint_id: "ep-2", name: "Crew" };
    const { sw, calls } = fake("0.4.7", [
      { kind: "work_running", running: [navigator, other], message: "busy" },
      { kind: "switched", from: "0.4.7", to: "0.4.8", interrupted: [] },
    ]);
    await sw.start();
    sw.wait("ws-here");
    expect(sw.getState()).toEqual({ kind: "waiting", watched: [navigator, other], unwatched: [] });

    sw.endpointStatus("ep-nav", "active");
    sw.endpointStatus("ep-unrelated", "idle");
    sw.endpointStatus("ep-nav", "idle");
    expect(sw.getState()).toEqual({ kind: "waiting", watched: [other], unwatched: [] });
    expect(calls).toHaveLength(1);

    sw.endpointStatus("ep-2", "idle");
    await vi.waitFor(() => expect(sw.getState().kind).toBe("switched"));
    expect(calls).toEqual([{}, {}]);
  });

  it("says which turns it cannot watch, and never asks again by itself for them", async () => {
    const { sw, calls } = fake("0.4.7", [{ kind: "work_running", running: [elsewhere], message: "busy" }]);
    await sw.start();
    sw.wait("ws-here");
    expect(sw.getState()).toEqual({ kind: "waiting", watched: [], unwatched: [elsewhere] });
    sw.endpointStatus("ep-far", "idle");
    expect(calls).toHaveLength(1);
  });

  it("asks again when new work started while waiting, instead of switching", async () => {
    const { sw } = fake("0.4.7", [
      { kind: "work_running", running: [navigator], message: "busy" },
      { kind: "work_running", running: [elsewhere], message: "still busy" },
    ]);
    await sw.start();
    sw.wait("ws-here");
    sw.endpointStatus("ep-nav", "idle");
    await vi.waitFor(() => expect(sw.getState()).toMatchObject({ kind: "work_running", running: [elsewhere] }));
  });

  it("shows Floe's refusal in its own words", async () => {
    const { sw } = fake("0.4.7", [{ kind: "refused", reason: "not_this_floe", message: "left alone" }]);
    await sw.start();
    expect(sw.getState()).toEqual({ kind: "problem", message: "left alone" });
  });

  it("shows a failed request as a problem", async () => {
    const { sw } = fake("0.4.7", []);
    await sw.start();
    expect(sw.getState()).toEqual({ kind: "problem", message: "no more outcomes" });
  });
});

describe("endpointStatusFrom", () => {
  it("reads the Actor and status from a status_changed push", () => {
    expect(endpointStatusFrom({ endpoint: { endpoint_id: "ep", status: "idle" } })).toEqual({ id: "ep", status: "idle" });
    expect(endpointStatusFrom({})).toBeNull();
    expect(endpointStatusFrom(null)).toBeNull();
  });
});

describe("describeTurn", () => {
  it("names the Actor and its workspace", () => {
    const names = new Map([["ws-here", "voyage4"]]);
    expect(describeTurn(navigator, names)).toBe("Navigator in voyage4");
    expect(describeTurn(elsewhere, names)).toBe("ep-far in another workspace");
  });
});
