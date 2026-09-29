import { SYSTEM_ACCESS_WARNING, type WorkspaceAccess, type WorkspaceFolder } from "./access.js";

/**
 * What the Workspace folders screen lists, and what Enter does on each row.
 * Only drawn from the access Floe pushed; nothing here is assumed.
 */

export type AccessRow =
  | { readonly kind: "folder"; readonly folder: WorkspaceFolder; readonly label: string; readonly removable: boolean }
  | { readonly kind: "add"; readonly label: string }
  | { readonly kind: "system"; readonly label: string; readonly on: boolean };

export function accessRows(access: WorkspaceAccess): AccessRow[] {
  return [
    ...access.folders.map((folder) => ({
      kind: "folder" as const,
      folder,
      label: folderLabel(folder),
      removable: !folder.home,
    })),
    { kind: "add", label: "+ Add a folder" },
    { kind: "system", label: `System access: ${access.system_access ? "On" : "Off"}`, on: access.system_access },
  ];
}

export function folderLabel(folder: WorkspaceFolder): string {
  const notes = [folder.home ? "this workspace's own folder" : null, folder.available ? null : "not found on this machine"]
    .filter(Boolean)
    .join(", ");
  return notes ? `${folder.path}  (${notes})` : folder.path;
}

/** The line under the System access row. It speaks of file tools only; commands are never confined. */
export function systemAccessLine(on: boolean): string {
  return on ? `On. ${SYSTEM_ACCESS_WARNING}` : "Off. Actors' file tools stay inside the folders above.";
}

/** The key line for the selected row. */
export function rowKeys(row: AccessRow | undefined): string {
  switch (row?.kind) {
    case "folder":
      return row.removable ? "Enter remove this folder" : "This folder stays: it is where the workspace lives";
    case "add":
      return "Enter choose a folder";
    case "system":
      return row.on ? "Enter turn off" : "Enter turn on";
    default:
      return "";
  }
}
