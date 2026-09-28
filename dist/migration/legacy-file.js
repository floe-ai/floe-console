import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
export function legacyFilePath() {
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
export function findLegacyFile(path = legacyFilePath()) {
    if (!existsSync(path))
        return null;
    let contents = null;
    try {
        contents = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        // Still offered: the agent reports it as unrecognised and the person decides.
    }
    const declared = contents?.protection;
    const protection = declared === "device" || declared === "passphrase" ? declared : "unknown";
    return { path, contents, protection };
}
/** Rename the file to `<name>.<YYYY-MM-DD>.old`, never over an existing file. Returns the new path. */
export function setAsideLegacyFile(file, now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    let target = `${file.path}.${date}.old`;
    for (let n = 2; existsSync(target); n++)
        target = `${file.path}.${date}-${n}.old`;
    renameSync(file.path, target);
    return target;
}
/** Only after Floe has imported it: Floe now holds the identity. */
export function deleteLegacyFile(file) {
    rmSync(file.path, { force: true });
}
