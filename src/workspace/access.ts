import { randomUUID } from "node:crypto";
import type { WorkspaceClient } from "../bus/workspace-client.js";

/**
 * A Workspace's folders and its System access setting, exactly as Floe sends
 * them: the result of `workspace.access.inspect`, `workspace_access` on
 * `caught_up`, and `access` on the `workspace_access_changed` push. Floe does
 * not export this type, so it mirrors the result schema the operations publish
 * (floe-bus/src/workspace-access-operations.ts). The console keeps no copy of
 * its own: it shows the latest one Floe pushed.
 */

export interface WorkspaceFolder {
  readonly folder_id: string;
  readonly path: string;
  /** The Workspace's own folder, where `.floe` lives. It cannot be removed. */
  readonly home: boolean;
  /** False when the folder cannot currently be found on this machine. */
  readonly available: boolean;
  readonly added_at: string | null;
}

export interface WorkspaceAccessRecord {
  readonly record_id: string;
  readonly kind: string;
  readonly summary: string;
  readonly path: string | null;
  readonly principal_id: string;
  readonly recorded_at: string;
}

export interface WorkspaceAccess {
  readonly workspace_id: string;
  readonly folders: readonly WorkspaceFolder[];
  readonly system_access: boolean;
  /** Newest first. */
  readonly records: readonly WorkspaceAccessRecord[];
}

/** Said wherever the folders are described: Floe does not confine commands. */
export const COMMANDS_NOT_CONFINED =
  "Commands are not confined to these folders: a command an Actor runs can read, change or delete any file you can.";
export const FOLDERS_UNRESTRICTED = "Actors can read and change files in these folders freely, without asking you.";
export const SYSTEM_ACCESS_WARNING = "Actors can read and write anywhere on this machine.";

/** The access Floe sent, or null when the value is not that shape (never guessed at). */
export function parseAccess(value: unknown): WorkspaceAccess | null {
  if (!isObject(value)) return null;
  const { workspace_id, folders, system_access, records } = value;
  if (typeof workspace_id !== "string" || typeof system_access !== "boolean") return null;
  if (!Array.isArray(folders) || !folders.every(isFolder)) return null;
  if (!Array.isArray(records) || !records.every(isRecord)) return null;
  return { workspace_id, folders, system_access, records };
}

/** The access carried by a `workspace_access_changed` push for this Workspace. */
export function accessFromPush(frame: { type: string; payload: unknown }, workspaceId: string): WorkspaceAccess | null {
  if (frame.type !== "workspace_access_changed" || !isObject(frame.payload)) return null;
  const access = parseAccess(frame.payload.access);
  return access?.workspace_id === workspaceId ? access : null;
}

/** Floe's one-time notice that older Workspaces' Floe Actors were given tool access. */
export function toolAccessNotice(access: WorkspaceAccess | null): WorkspaceAccessRecord | null {
  return access?.records.find((record) => record.kind === "tool_access_given") ?? null;
}

export type ChangeOutcome =
  | { readonly kind: "done" }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The three changes. Each is one person's intent, so each gets its own
 * idempotency key; the new state arrives by push, not from this answer.
 */
export const accessChanges = {
  addFolder: (client: WorkspaceClient, path: string) => change(client, "workspace.folder.add", { path }),
  removeFolder: (client: WorkspaceClient, folderId: string) =>
    change(client, "workspace.folder.remove", { folder_id: folderId }),
  setSystemAccess: (client: WorkspaceClient, enabled: boolean) =>
    change(client, "workspace.system_access.set", { enabled }),
};

async function change(client: WorkspaceClient, operationId: string, input: Record<string, unknown>): Promise<ChangeOutcome> {
  const receipt = await client.invokeOperation({ operationId, input, idempotencyKey: randomUUID() });
  if (receipt.state === "completed") return { kind: "done" };
  return { kind: "refused", message: receipt.refusal?.message ?? `Floe did not make the change (${receipt.state}).` };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFolder(value: unknown): value is WorkspaceFolder {
  return (
    isObject(value) &&
    typeof value.folder_id === "string" &&
    typeof value.path === "string" &&
    typeof value.home === "boolean" &&
    typeof value.available === "boolean" &&
    (value.added_at === null || typeof value.added_at === "string")
  );
}

function isRecord(value: unknown): value is WorkspaceAccessRecord {
  return (
    isObject(value) &&
    typeof value.record_id === "string" &&
    typeof value.kind === "string" &&
    typeof value.summary === "string" &&
    typeof value.recorded_at === "string"
  );
}
