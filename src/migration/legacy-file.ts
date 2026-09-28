import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * The identity file earlier consoles kept for themselves, before Floe owned the
 * identity. The console only locates, reads, sets aside or deletes it. It never
 * decrypts it: Floe's identity agent does that during `importLegacy`.
 */
export interface LegacyFile {
  readonly path: string;
  /** Parsed JSON, handed to the agent unchanged. Null when the file is not JSON. */
  readonly contents: unknown;
  /** "device" when the earlier console protected it with a blank passphrase. */
  readonly protection: "passphrase" | "device" | "unknown";
}

export function legacyFilePath(): string {
  const home = homedir();
  switch (platform()) {
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "floe-console", "identity.key.json");
    case "darwin":
      return join(home, "Library", "Application Support", "floe-console", "identity.key.json");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "floe-console", "identity.key.json");
  }
}

export function findLegacyFile(path = legacyFilePath()): LegacyFile | null {
  if (!existsSync(path)) return null;
  let contents: unknown = null;
  try {
    contents = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // Still offered: the agent reports it as unrecognised and the person decides.
  }
  const declared = (contents as { protection?: unknown } | null)?.protection;
  const protection = declared === "device" || declared === "passphrase" ? declared : "unknown";
  return { path, contents, protection };
}

/** Rename the file to `<name>.<YYYY-MM-DD>.old`, never over an existing file. Returns the new path. */
export function setAsideLegacyFile(file: LegacyFile, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  let target = `${file.path}.${date}.old`;
  for (let n = 2; existsSync(target); n++) target = `${file.path}.${date}-${n}.old`;
  renameSync(file.path, target);
  return target;
}

/** Only after Floe has imported it: Floe now holds the identity. */
export function deleteLegacyFile(file: LegacyFile): void {
  rmSync(file.path, { force: true });
}
