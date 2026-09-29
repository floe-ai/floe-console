import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Where the Bus lives. The Bus is loopback-only and named in one place: the
 * local, non-secret Floe config (`bus.http_base_url`, `bus.ws_base_url`) at
 * ~/.floe/config.yaml, the file Floe itself reads. No environment variable
 * changes it, so the console and Floe can never read different configs.
 */
export interface BusEndpoints {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

const DEFAULT_HTTP = "http://127.0.0.1:5377";

export function floeConfigPath(): string {
  return join(homedir(), ".floe", "config.yaml");
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
