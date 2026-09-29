import { randomUUID } from "node:crypto";
/**
 * Floe's standing notices about access in a Workspace, kept with its folder
 * and System access records (floe-bus/src/workspace-access.ts
 * WorkspaceAccessRecordKind). The other record kinds are changes a person
 * made, shown on the folders screen instead.
 */
export const NOTICE_KINDS = new Set([
    "tool_access_given",
    "actor_access_lapsing",
    "actor_access_moved",
    "access_carried",
    "access_left_behind",
]);
/**
 * The notices this person has not seen, newest first. Nothing while the
 * console does not yet know who is looking, so a seen notice never flashes up
 * as new. When Floe cannot say who is looking, every notice is shown.
 */
export function unseenNotices(access, viewer) {
    if (!access || viewer === undefined)
        return [];
    return access.records.filter((record) => NOTICE_KINDS.has(record.kind) && !(viewer !== null && record.seen_by?.includes(viewer)));
}
/**
 * The person's id in this Workspace, from the receipt of Floe's own read of
 * the Workspace's access. Floe records a notice as seen under this same id.
 */
export async function learnViewer(client) {
    const receipt = await client.invokeOperation({
        operationId: "workspace.access.inspect",
        input: {},
        idempotencyKey: randomUUID(),
    });
    return receipt.state === "completed" && typeof receipt.principal_id === "string" ? receipt.principal_id : null;
}
