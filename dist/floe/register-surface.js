import { fileURLToPath } from "node:url";
import { runFloe } from "./floe-command.js";
/**
 * Make sure Floe knows how to launch this console.
 *
 * Floe never names a surface; a surface registers itself through Floe's own
 * `floe surface register`, which owns the registry's schema and location and
 * overwrites the one `console` entry rather than duplicating it.
 *
 * This runs at launch rather than at install. A global git install
 * (`npm install -g github:…`) cannot run install scripts safely: npm prepares
 * git packages by running a nested install that inherits `--global`, so the
 * package is installed twice over itself and the install fails. So the console
 * ships with no install scripts, and registers itself each time it is started
 * instead. That also means the entry always names the copy of the console that
 * is actually running, so an upgrade or reinstall can never leave it pointing
 * somewhere stale.
 *
 * The entry launches `node <this install's dist/main.js>` by absolute path —
 * shell-free, and immune to the Windows .cmd shim problem.
 */
export async function registerConsoleSurface() {
    const entry = fileURLToPath(new URL("../main.js", import.meta.url));
    const code = await runFloe([
        "surface", "register",
        "--name", "console",
        "--label", "Floe Console",
        "--command", process.execPath,
        "--arg", entry,
    ], 
    // Registration succeeding is not news; Floe's own error output still shows.
    ["ignore", "ignore", "inherit"]);
    if (code !== 0) {
        throw new Error(`\`floe surface register\` exited ${code}`);
    }
}
