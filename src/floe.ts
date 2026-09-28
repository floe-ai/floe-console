#!/usr/bin/env node
import { runFloe } from "./floe/floe-command.js";
import { registerConsoleSurface } from "./floe/register-surface.js";

/**
 * The `floe` command, as installed by the console.
 *
 * npm only puts a package's own bins on PATH, never its dependencies', so a
 * person who installs just the console would otherwise have no `floe` to type.
 * This hands every invocation straight to the Floe CLI the console depends on,
 * unchanged — it adds no commands and decides nothing. The one thing it does
 * first is make sure Floe can launch this console (see register-surface.ts), so
 * bare `floe` starts the substrate and opens the console.
 */
try {
  await registerConsoleSurface();
} catch (error) {
  process.stderr.write(
    `floe-console: could not register the console with Floe (${error instanceof Error ? error.message : String(error)}).\n`,
  );
}

// Ctrl+C reaches the Floe CLI (and any surface it launches) directly; this
// wrapper just waits for it and passes its exit code on.
process.on("SIGINT", () => {});
try {
  process.exitCode = await runFloe(process.argv.slice(2), "inherit");
} catch (error) {
  process.stderr.write(`floe-console: could not run Floe (${error instanceof Error ? error.message : String(error)}).\n`);
  process.exitCode = 1;
}
