import { randomUUID } from "node:crypto";
/** Said wherever the folders are described: Floe does not confine commands. */
export const COMMANDS_NOT_CONFINED = "Commands are not confined to these folders: a command an Actor runs can read, change or delete any file you can.";
export const FOLDERS_UNRESTRICTED = "Actors can read and change files in these folders freely, without asking you.";
export const SYSTEM_ACCESS_WARNING = "Actors can read and write anywhere on this machine.";
/** The access Floe sent, or null when the value is not that shape (never guessed at). */
export function parseAccess(value) {
    if (!isObject(value))
        return null;
    const { workspace_id, folders, system_access, records } = value;
    if (typeof workspace_id !== "string" || typeof system_access !== "boolean")
        return null;
    if (!Array.isArray(folders) || !folders.every(isFolder))
        return null;
    if (!Array.isArray(records) || !records.every(isRecord))
        return null;
    return { workspace_id, folders, system_access, records };
}
/** The access carried by a `workspace_access_changed` push for this Workspace. */
export function accessFromPush(frame, workspaceId) {
    if (frame.type !== "workspace_access_changed" || !isObject(frame.payload))
        return null;
    const access = parseAccess(frame.payload.access);
    return access?.workspace_id === workspaceId ? access : null;
}
/**
 * The changes. Each is one person's intent, so each gets its own
 * idempotency key; the new state arrives by push, not from this answer.
 */
export const accessChanges = {
    /** Marks a notice seen by this person, on every surface they use. */
    markSeen: (client, recordId) => change(client, "workspace.notice.acknowledge", { record_id: recordId }),
    addFolder: (client, path) => change(client, "workspace.folder.add", { path }),
    removeFolder: (client, folderId) => change(client, "workspace.folder.remove", { folder_id: folderId }),
    setSystemAccess: (client, enabled) => change(client, "workspace.system_access.set", { enabled }),
};
async function change(client, operationId, input) {
    const receipt = await client.invokeOperation({ operationId, input, idempotencyKey: randomUUID() });
    if (receipt.state === "completed")
        return { kind: "done" };
    return { kind: "refused", message: receipt.refusal?.message ?? `Floe did not make the change (${receipt.state}).` };
}
function isObject(value) {
    return typeof value === "object" && value !== null;
}
function isFolder(value) {
    return (isObject(value) &&
        typeof value.folder_id === "string" &&
        typeof value.path === "string" &&
        typeof value.home === "boolean" &&
        typeof value.available === "boolean" &&
        (value.added_at === null || typeof value.added_at === "string"));
}
function isRecord(value) {
    return (isObject(value) &&
        typeof value.record_id === "string" &&
        typeof value.kind === "string" &&
        typeof value.summary === "string" &&
        typeof value.recorded_at === "string" &&
        (value.seen_by === undefined ||
            (Array.isArray(value.seen_by) && value.seen_by.every((id) => typeof id === "string"))));
}
