import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

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

/**
 * An identity file an earlier console left on this machine: the live one (while
 * it waits to be imported) or a copy set aside by "start fresh" or "I don't know
 * this passphrase". Floe never looks in the console's folder, so the console
 * lists these itself; otherwise they would be identities nobody can see.
 */
export interface LeftoverFile {
  readonly path: string;
  readonly name: string;
  readonly createdAt: string | null;
  readonly protection: "passphrase" | "device" | "unknown";
  readonly npub: string | null;
}

const LEFTOVER = /^identity\.key\.json(\.[^\\/]+\.old)?$/;

export function listLeftoverFiles(dir = dirname(legacyFilePath())): LeftoverFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => LEFTOVER.test(name))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const found = findLegacyFile(path);
      const contents = (found?.contents ?? null) as { created_at?: unknown; npub?: unknown } | null;
      return {
        path,
        name,
        createdAt: typeof contents?.created_at === "string" ? contents.created_at : null,
        protection: found?.protection ?? "unknown",
        npub: typeof contents?.npub === "string" ? contents.npub : null,
      };
    });
}

export function deleteLeftoverFile(file: LeftoverFile): void {
  rmSync(file.path, { force: true });
}
