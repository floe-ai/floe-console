import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
const DEFAULT_HTTP = "http://127.0.0.1:5377";
export function floeConfigPath() {
    return join(homedir(), ".floe", "config.yaml");
}
export function resolveBusEndpoints() {
    let http;
    let ws;
    try {
        const doc = parseYaml(readFileSync(floeConfigPath(), "utf8"));
        if (typeof doc?.bus?.http_base_url === "string")
            http = doc.bus.http_base_url.trim() || undefined;
        if (typeof doc?.bus?.ws_base_url === "string")
            ws = doc.bus.ws_base_url.trim() || undefined;
    }
    catch {
        // Connecting to the identity agent writes this file first, so this is only
        // reached if it was removed since; the default is Floe's own default.
    }
    const httpBaseUrl = http ?? DEFAULT_HTTP;
    return { httpBaseUrl, wsBaseUrl: ws ?? httpBaseUrl.replace(/^http/i, "ws") };
}
