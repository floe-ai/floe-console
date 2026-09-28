import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
/**
 * Run the Floe command line that the console itself depends on.
 *
 * Floe is a dependency of the console (`github:floe-ai/floe`), so its CLI is
 * installed inside the console's own node_modules. We resolve it from there —
 * never from PATH — so the console works whether or not the person ever
 * installed Floe globally, and always talks to the Floe version it shipped with.
 *
 * We only call Floe's published bin (the `bin.floe` entry in its package.json);
 * nothing else in its package is touched. It is run as `node <bin>` with a real
 * argv array: no shell, no Windows .cmd shim, nothing re-parsed.
 */
export function resolveFloeBin() {
    const require = createRequire(import.meta.url);
    const manifestPath = require.resolve("floe/package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.floe;
    if (!bin) {
        throw new Error(`the installed floe package (${manifestPath}) declares no \`floe\` bin`);
    }
    return join(dirname(manifestPath), bin);
}
export function runFloe(args, stdio) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [resolveFloeBin(), ...args], { stdio });
        child.on("error", reject);
        child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
}
