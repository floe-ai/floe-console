import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceClient } from "../bus/workspace-client.js";
import {
  COMMANDS_NOT_CONFINED,
  SYSTEM_ACCESS_WARNING,
  accessChanges,
  accessFromPush,
  parseAccess,
  toolAccessNotice,
  type WorkspaceAccess,
} from "./access.js";
import { accessRows, folderLabel, rowKeys, systemAccessLine } from "./access-view.js";

// Shapes as the live Bus (Floe 0.3.9) sent them on caught_up and workspace_access_changed.
const home = { folder_id: "home", path: "C:\\work\\proj-a", home: true, available: true, added_at: null };
const added = {
  folder_id: "folder_1",
  path: "C:\\work\\proj-b",
  home: false,
  available: true,
  added_at: "2026-09-29T11:48:07.444Z",
};
const notice = {
  record_id: "notice:tool-access:ws_1",
  kind: "tool_access_given",
  summary: "Floe Actors in this workspace can now use tools inside its folders.",
  path: null,
  principal_id: "policy:local-floe-tools:v1",
  recorded_at: "2026-09-29T11:00:00.000Z",
};
const access: WorkspaceAccess = { workspace_id: "ws_1", folders: [home, added], system_access: false, records: [] };

describe("Workspace access from Floe", () => {
  it("accepts exactly the shape Floe sends and refuses anything else", () => {
    expect(parseAccess(access)).toEqual(access);
    expect(parseAccess(undefined)).toBeNull();
    expect(parseAccess({ ...access, system_access: "no" })).toBeNull();
    expect(parseAccess({ ...access, folders: [{ path: "C:\\x" }] })).toBeNull();
  });

  it("takes a change push only for this Workspace", () => {
    const frame = { type: "workspace_access_changed", payload: { workspace_id: "ws_1", access } };
    expect(accessFromPush(frame, "ws_1")).toEqual(access);
    expect(accessFromPush(frame, "ws_2")).toBeNull();
    expect(accessFromPush({ type: "bridge_connected", payload: { access } }, "ws_1")).toBeNull();
  });

  it("finds Floe's one-time tool access notice, and nothing when Floe has none", () => {
    expect(toolAccessNotice({ ...access, records: [notice] })?.summary).toBe(notice.summary);
    expect(toolAccessNotice(access)).toBeNull();
    expect(toolAccessNotice(null)).toBeNull();
  });
});

describe("Workspace folders screen", () => {
  it("lists the folders, then Add, then System access; the home folder cannot be removed", () => {
    const rows = accessRows(access);
    expect(rows.map((r) => r.kind)).toEqual(["folder", "folder", "add", "system"]);
    expect(rows[0]).toMatchObject({ removable: false });
    expect(rows[1]).toMatchObject({ removable: true });
    expect(rows[3]).toMatchObject({ label: "System access: Off", on: false });
    expect(rowKeys(rows[0])).not.toMatch(/remove/i);
    expect(rowKeys(rows[1])).toMatch(/remove/i);
  });

  it("says when a folder is the workspace's own, or missing", () => {
    expect(folderLabel(home)).toContain("this workspace's own folder");
    expect(folderLabel({ ...added, available: false })).toContain("not found on this machine");
    expect(folderLabel(added)).toBe(added.path);
  });

  it("warns plainly when System access is on, and never says commands are confined", () => {
    expect(systemAccessLine(true)).toContain(SYSTEM_ACCESS_WARNING);
    expect(SYSTEM_ACCESS_WARNING).toBe("Actors can read and write anywhere on this machine.");
    expect(systemAccessLine(false)).toMatch(/file tools/);
    expect(COMMANDS_NOT_CONFINED).toMatch(/not confined/);
  });
});

describe("Changing access through Floe's operations", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubBus(receipt: Record<string, unknown>) {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ kind: "receipt", replayed: false, receipt }), { status: 200 });
    });
    const client = new WorkspaceClient({ httpBaseUrl: "http://bus", bearerToken: "b", workspaceId: "ws_1" });
    return { calls, client };
  }

  it("sends each change as its own intent to the documented invoke route", async () => {
    const { calls, client } = stubBus({ state: "completed", refusal: null });
    expect(await accessChanges.addFolder(client, "C:\\work\\proj-b")).toEqual({ kind: "done" });
    expect(await accessChanges.setSystemAccess(client, true)).toEqual({ kind: "done" });
    expect(calls[0]!.url).toBe("http://bus/v1/workspaces/ws_1/operations/invoke");
    expect(calls[0]!.body).toMatchObject({
      operation_id: "workspace.folder.add",
      operation_version: "1",
      input_schema_version: "1",
      input: { path: "C:\\work\\proj-b" },
    });
    expect(calls[1]!.body).toMatchObject({ operation_id: "workspace.system_access.set", input: { enabled: true } });
    expect(calls[0]!.body.idempotency_key).not.toBe(calls[1]!.body.idempotency_key);
  });

  it("shows Floe's own reason when it refuses", async () => {
    const message = "That folder is already inside this Workspace's folders.";
    const { client } = stubBus({ state: "refused", refusal: { code: "folder_already_included", message } });
    expect(await accessChanges.removeFolder(client, "folder_1")).toEqual({ kind: "refused", message });
  });
});
