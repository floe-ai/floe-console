import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Where the Bus lives, from this client's point of view.
 *
 * Per the client-identity protocol ("Discovering where to connect"): the Bus is
 * loopback-only and told out of band. We read `bus.http_base_url` (and
 * `bus.ws_base_url`) from the local, non-secret `~/.floe/config.yaml` written by
 * `floe register`, and fall back to the documented default `http://127.0.0.1:5377`.
 * There is no remote discovery because there is no remote Bus.
 *
 * These are transport addresses only — no credential and no privilege is implied
 * by reading them.
 */
export interface BusEndpoints {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  /** How the URLs were resolved, for honest diagnostics. */
  readonly source: "env" | "config" | "default";
}

const DEFAULT_HTTP = "http://127.0.0.1:5377";
const DEFAULT_WS = "ws://127.0.0.1:5377";

/** Path to the local floe config, honouring FLOE_HOME as `floe` itself does. */
export function floeConfigPath(): string {
  const home = process.env.FLOE_HOME?.trim() || join(homedir(), ".floe");
  return join(home, "config.yaml");
}

function readConfigBus(): { http?: string; ws?: string } {
  try {
    const raw = readFileSync(floeConfigPath(), "utf8");
    const doc = parseYaml(raw) as { bus?: { http_base_url?: unknown; ws_base_url?: unknown } };
    const http = typeof doc?.bus?.http_base_url === "string" ? doc.bus.http_base_url.trim() : undefined;
    const ws = typeof doc?.bus?.ws_base_url === "string" ? doc.bus.ws_base_url.trim() : undefined;
    return { http: http || undefined, ws: ws || undefined };
  } catch {
    return {};
  }
}

/** Derive a ws:// base from an http:// base when the config only carries one. */
function wsFromHttp(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/^https/i, "wss").replace(/^http/i, "ws");
}

export function resolveBusEndpoints(): BusEndpoints {
  const envHttp = process.env.FLOE_BUS_HTTP_BASE_URL?.trim();
  const envWs = process.env.FLOE_BUS_WS_BASE_URL?.trim();
  if (envHttp) {
    return { httpBaseUrl: envHttp, wsBaseUrl: envWs || wsFromHttp(envHttp), source: "env" };
  }

  const cfg = readConfigBus();
  if (cfg.http) {
    return { httpBaseUrl: cfg.http, wsBaseUrl: cfg.ws || wsFromHttp(cfg.http), source: "config" };
  }

  return { httpBaseUrl: DEFAULT_HTTP, wsBaseUrl: DEFAULT_WS, source: "default" };
}
