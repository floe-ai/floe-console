import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
const DEFAULT_HTTP = "http://127.0.0.1:5377";
const DEFAULT_WS = "ws://127.0.0.1:5377";
/** Path to the local floe config, honouring FLOE_HOME as `floe` itself does. */
export function floeConfigPath() {
    const home = process.env.FLOE_HOME?.trim() || join(homedir(), ".floe");
    return join(home, "config.yaml");
}
function readConfigBus() {
    try {
        const raw = readFileSync(floeConfigPath(), "utf8");
        const doc = parseYaml(raw);
        const http = typeof doc?.bus?.http_base_url === "string" ? doc.bus.http_base_url.trim() : undefined;
        const ws = typeof doc?.bus?.ws_base_url === "string" ? doc.bus.ws_base_url.trim() : undefined;
        return { http: http || undefined, ws: ws || undefined };
    }
    catch {
        return {};
    }
}
/** Derive a ws:// base from an http:// base when the config only carries one. */
function wsFromHttp(httpBaseUrl) {
    return httpBaseUrl.replace(/^https/i, "wss").replace(/^http/i, "ws");
}
export function resolveBusEndpoints() {
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
