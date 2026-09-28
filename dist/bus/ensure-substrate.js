import { runFloe } from "../floe/floe-command.js";
export async function ensureSubstrateReachable() {
    try {
        // stdin is withheld so `floe up` never blocks on its interactive
        // service-install prompt (which skips without a TTY); its stdout/stderr are
        // shown so a cold start and any "not running" guidance reach the person.
        const code = await runFloe(["up"], ["ignore", "inherit", "inherit"]);
        return code === 0 ? { ok: true } : { ok: false, code };
    }
    catch (error) {
        process.stderr.write(`floe-console: could not run the Floe substrate command (${error instanceof Error ? error.message : String(error)}).\n` +
            "The console installs Floe as its own dependency — reinstall the console to repair it.\n");
        return { ok: false, code: 1 };
    }
}
