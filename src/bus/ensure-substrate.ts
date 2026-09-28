import { runFloe } from "../floe/floe-command.js";

/**
 * Make the Floe substrate reachable before the console tries to use it.
 *
 * The console is a surface: it depends on a reachable bus *endpoint*, not on a
 * process it spawned. Deciding whether to start Floe is the substrate's policy,
 * never the console's. `floe up` is the substrate's own connect-first door for
 * exactly a surface's binary that may run cold: it reuses a running instance and
 * spawns nothing; starts one only where this machine's `services.start_on_demand`
 * policy allows; and otherwise reports "not running" and exits non-zero. We
 * delegate to it rather than re-checking health or re-deciding start policy —
 * there is one readiness path and it lives in the substrate.
 *
 * The `floe` run is the one the console depends on (see floe-command.ts), not
 * whatever happens to be on PATH.
 */
export type SubstrateReadiness =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: number };

export async function ensureSubstrateReachable(): Promise<SubstrateReadiness> {
  try {
    // stdin is withheld so `floe up` never blocks on its interactive
    // service-install prompt (which skips without a TTY); its stdout/stderr are
    // shown so a cold start and any "not running" guidance reach the person.
    const code = await runFloe(["up"], ["ignore", "inherit", "inherit"]);
    return code === 0 ? { ok: true } : { ok: false, code };
  } catch (error) {
    process.stderr.write(
      `floe-console: could not run the Floe substrate command (${error instanceof Error ? error.message : String(error)}).\n` +
        "The console installs Floe as its own dependency — reinstall the console to repair it.\n",
    );
    return { ok: false, code: 1 };
  }
}
