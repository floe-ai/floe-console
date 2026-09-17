#!/usr/bin/env node
import { render } from "ink";
import { App } from "./app/App.js";
import { ensureSubstrateReachable } from "./bus/ensure-substrate.js";

/**
 * Entry point. floe-console is an ordinary, unprivileged HTTP + WebSocket
 * consumer of floe-bus: it holds a client keypair, authenticates to obtain a
 * scoped bearer, and never reaches around the substrate.
 *
 * Before rendering, make the substrate reachable connect-first via the
 * substrate's own `floe up`: reuse a running Floe, or — only where this
 * machine's policy allows — start one, or report it is not running. A cold run
 * therefore either lands in a live console or says plainly why it cannot,
 * rather than failing mid-handshake against a bus that was never there.
 */
const readiness = await ensureSubstrateReachable();
if (!readiness.ok) {
  process.exit(readiness.code);
}
render(<App />);
