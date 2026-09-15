import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * Where floe-console keeps its per-user state on this machine. The identity key
 * store lives here — never in the repo, never in the substrate.
 *
 * Resolution order:
 *   1. FLOE_CONSOLE_HOME (explicit override, used by the live walkthrough).
 *   2. Per-OS convention.
 */
export function consoleHome(): string {
  const override = process.env.FLOE_CONSOLE_HOME?.trim();
  if (override) return override;

  const home = homedir();
  switch (platform()) {
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "floe-console");
    case "darwin":
      return join(home, "Library", "Application Support", "floe-console");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "floe-console");
  }
}

/** Absolute path to the encrypted identity key store. */
export function identityFilePath(): string {
  return join(consoleHome(), "identity.key.json");
}
