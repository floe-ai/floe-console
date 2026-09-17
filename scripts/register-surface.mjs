#!/usr/bin/env node
/**
 * Self-register the console as a Floe surface.
 *
 * Floe never names a surface; a surface makes itself launchable by registering
 * into Floe's on-disk registry. This is that step for the console, run as part
 * of install (npm `postbuild`/`postinstall`). It delegates to `floe surface
 * register` — the substrate's own command, documented as "a surface's installer
 * calls this" — so the registry's schema, its location under the floe home, and
 * its idempotent overwrite all stay owned by the substrate. We do not write the
 * YAML ourselves or hardcode where it lives; installing twice overwrites the one
 * `console` entry rather than duplicating it.
 *
 * The entry points Floe at the console's built binary via `node <dist/main.js>`
 * (an absolute path), not the `floe-console` shim. This is shell-free, works
 * identically whether the console is a global install or a checkout, and avoids
 * the Windows .cmd-shim launch problem — mirroring how floe-cli reproduces its
 * own invocation.
 *
 * Best-effort by design: if the console has not been built yet, or `floe` is not
 * on PATH, it says so and exits 0 so an install is never blocked by
 * registration. Re-run explicitly at any time with `npm run register`.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(packageRoot, "dist", "main.js");

if (!existsSync(entry)) {
  console.log(`floe-console: not registering yet — build the console first (missing ${entry}).`);
  process.exit(0);
}

const floe = resolveFloe();
if (!floe) {
  console.log("floe-console: `floe` is not on PATH; skipping surface registration.");
  console.log("Enable the Floe substrate, then run `npm run register` so `floe` can launch this console.");
  process.exit(0);
}

const result = runFloe(floe, [
  "surface", "register",
  "--name", "console",
  "--label", "Floe Console",
  "--command", process.execPath,
  "--arg", entry,
]);

if (result.error) {
  console.log(`floe-console: could not run \`floe\` (${result.error.message}); skipping surface registration.`);
} else if (result.status === 0) {
  console.log("floe-console: registered as a Floe surface. Run `floe` to launch it.");
} else {
  console.log(`floe-console: surface registration did not complete (floe exited ${result.status ?? "?"}).`);
}
process.exit(0);

/** Locate the `floe` executable on PATH (honouring PATHEXT on Windows). */
function resolveFloe() {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const names =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((ext) => `floe${ext.toLowerCase()}`)
      : ["floe"];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Run floe with a real argv array; a .cmd shim on Windows goes through cmd.exe. */
function runFloe(floePath, args) {
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/c", floePath, ...args], { stdio: "inherit" });
  }
  return spawnSync(floePath, args, { stdio: "inherit" });
}
