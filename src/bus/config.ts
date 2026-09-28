import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Where the Bus lives. The Bus is loopback-only and named in one place: the
 * local, non-secret Floe config (`bus.http_base_url`, `bus.ws_base_url`). The
 * console reads the same file Floe's identity agent serves, found the same way
 * Floe finds it (FLOE_CONFIG, then ~/.floe/config.yaml), so the bearers the
 * agent pushes are always used against the Bus that minted them.
 */
export interface BusEndpoints {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

const DEFAULT_HTTP = "http://127.0.0.1:5377";

export function floeConfigPath(): string {
  const explicit = process.env.FLOE_CONFIG?.trim();
  return resolve(explicit || join(homedir(), ".floe", "config.yaml"));
}

export function resolveBusEndpoints(): BusEndpoints {
  let http: string | undefined;
  let ws: string | undefined;
  try {
    const doc = parseYaml(readFileSync(floeConfigPath(), "utf8")) as {
      bus?: { http_base_url?: unknown; ws_base_url?: unknown };
    };
    if (typeof doc?.bus?.http_base_url === "string") http = doc.bus.http_base_url.trim() || undefined;
    if (typeof doc?.bus?.ws_base_url === "string") ws = doc.bus.ws_base_url.trim() || undefined;
  } catch {
    // Connecting to the identity agent writes this file first, so this is only
    // reached if it was removed since; the default is Floe's own default.
  }
  const httpBaseUrl = http ?? DEFAULT_HTTP;
  return { httpBaseUrl, wsBaseUrl: ws ?? httpBaseUrl.replace(/^http/i, "ws") };
}
