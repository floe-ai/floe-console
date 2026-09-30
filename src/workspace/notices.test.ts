import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceClient } from "../bus/workspace-client.js";
import type { WorkspaceAccess, WorkspaceAccessRecord } from "./access.js";
import { learnViewer, unseenNotices } from "./notices.js";

const ME = "identity:identity_me";

// Summaries as Floe 0.4.7 writes them (floe-bus/src/actor-authority-adoption.ts, workspace-access.ts).
function record(kind: string, record_id: string, summary: string, seen_by: string[] = []): WorkspaceAccessRecord {
  return { record_id, kind, summary, path: null, principal_id: "system:test", recorded_at: "2026-09-30T00:00:00.000Z", seen_by };
}
const lapsing = record("actor_access_lapsing", "notice:actor-access-lapse:a1", "Builder loses its access to this workspace on 2026-10-30, unless a person here adopts it.");
const moved = record("actor_access_moved", "notice:actor-access-moved:a2:r1", "Navigator now acts with Jamie's access in this workspace. Nothing was added, and it no longer expires.", [ME]);
const leftBehind = record("access_left_behind", "notice:left-behind:ws_1", "This Workspace was restored from a package, which does not carry machine access.");
const folderAdded = record("folder_added", "rec_1", "Added C:\\work\\b.");
const access: WorkspaceAccess = {
  workspace_id: "ws_1",
  folders: [],
  system_access: false,
  records: [lapsing, folderAdded, moved, leftBehind],
};

describe("Floe's access notices", () => {
  it("shows the notices this person has not seen, newest first, and not folder changes", () => {
    expect(unseenNotices(access, ME)).toEqual([lapsing, leftBehind]);
  });

  it("shows another person's seen notice as new to this person", () => {
    expect(unseenNotices(access, "identity:identity_other")).toEqual([lapsing, moved, leftBehind]);
  });

  it("shows nothing until it knows who is looking, and every notice when Floe cannot say", () => {
    expect(unseenNotices(access, undefined)).toEqual([]);
    expect(unseenNotices(access, null)).toEqual([lapsing, moved, leftBehind]);
    expect(unseenNotices(null, ME)).toEqual([]);
  });
});

describe("Who is looking", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubBus(receipt: Record<string, unknown>) {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ kind: "receipt", receipt }), { status: 200 });
    });
    return { bodies, client: new WorkspaceClient({ httpBaseUrl: "http://bus", bearerToken: "b", workspaceId: "ws_1" }) };
  }

  it("is the principal on the receipt of Floe's own access read", async () => {
    const { bodies, client } = stubBus({ state: "completed", refusal: null, principal_id: ME, result: access });
    expect(await learnViewer(client)).toBe(ME);
    expect(bodies[0]).toMatchObject({ operation_id: "workspace.access.inspect", input: {} });
  });

  it("is unknown when Floe refuses the read", async () => {
    const { client } = stubBus({ state: "refused", refusal: { message: "no" }, principal_id: ME });
    expect(await learnViewer(client)).toBeNull();
  });
});
