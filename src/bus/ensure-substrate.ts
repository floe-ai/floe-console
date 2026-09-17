import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Make the Floe substrate reachable before the console tries to use it.
 *
 * The console is a surface: it depends on a reachable bus *endpoint*, not on a
 * process it spawned. Deciding whether to start Floe is the substrate's policy,
 * never the console's. `floe up` is the substrate's own connect-first door for
 * exactly a surface's binary that may run cold: it reuses a running instance and
 * spawns nothing; starts one only where this machine's `services.autostart`
 * policy allows; and otherwise reports "not running" (Floe is a managed service
 * here) and exits non-zero. We delegate to it rather than re-checking health or
 * re-deciding start policy — there is one readiness path and it lives in the
 * substrate. Starting is its fallback, not the console's opening move.
 */
export type SubstrateReadiness =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: number };

/** Locate the `floe` executable on PATH (honouring PATHEXT on Windows). */
function resolveFloe(): string | null {
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

export function ensureSubstrateReachable(): Promise<SubstrateReadiness> {
  const floe = resolveFloe();
  if (!floe) {
    process.stderr.write(
      "floe-console: the Floe substrate command `floe` is not on PATH.\n" +
        "The console is a surface of Floe — install or enable Floe, then run it again.\n",
    );
    return Promise.resolve({ ok: false, code: 1 });
  }
  // A .cmd shim on Windows must run through cmd.exe; elsewhere run floe directly.
  const [command, args]: [string, string[]] =
    process.platform === "win32"
      ? [process.env.ComSpec ?? "cmd.exe", ["/c", floe, "up"]]
      : [floe, ["up"]];
  return new Promise((resolve) => {
    // stdin is withheld so `floe up` never blocks on its interactive
    // service-install prompt (which skips without a TTY); its stdout/stderr are
    // shown so a cold start and any "not running" guidance reach the person.
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", () => resolve({ ok: false, code: 1 }));
    child.on("exit", (code) => resolve(code === 0 ? { ok: true } : { ok: false, code: code ?? 1 }));
  });
}
