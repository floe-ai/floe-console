#!/usr/bin/env node
import { render } from "ink";
import { App } from "./app/App.js";
import { IdentityLink } from "./identity/identity-link.js";

/**
 * Entry point. floe-console is an ordinary, unprivileged surface: Floe's
 * identity agent holds the person's key and pushes this console short-lived
 * bearers, and the console is an HTTP + WebSocket consumer of floe-bus with them.
 *
 * Connecting to the agent starts Floe first where this machine's
 * `services.start_on_demand` allows it, and otherwise reports it is not running.
 */
const link = new IdentityLink();
const connecting = link.connect();
const app = render(<App link={link} />);
await connecting;
await app.waitUntilExit();
link.close();
