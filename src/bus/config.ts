/**
 * Where the Bus lives, from this client's point of view. Defaults are the
 * documented loopback listener (floe-bus config.ts: 127.0.0.1:5377). These are
 * transport addresses only — no credential and no privilege is implied by them.
 */
export interface BusEndpoints {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

export function resolveBusEndpoints(): BusEndpoints {
  return {
    httpBaseUrl: process.env.FLOE_BUS_HTTP_BASE_URL?.trim() || "http://127.0.0.1:5377",
    wsBaseUrl: process.env.FLOE_BUS_WS_BASE_URL?.trim() || "ws://127.0.0.1:5377",
  };
}
