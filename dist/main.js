#!/usr/bin/env node
import { jsx as _jsx } from "react/jsx-runtime";
import { render } from "ink";
import { App } from "./app/App.js";
import { IdentityLink } from "./identity/identity-link.js";
import { EngineLink } from "./engines/engine-link.js";
/**
 * Entry point. floe-console is an ordinary, unprivileged surface: Floe's
 * identity agent holds the person's key and pushes this console short-lived
 * bearers, and the console is an HTTP + WebSocket consumer of floe-bus with them.
 * Floe's engine control (the Bridge) pushes whether the AI engine can run work.
 *
 * Connecting to the agent starts Floe first where this machine's
 * `services.start_on_demand` allows it, and otherwise reports it is not running.
 * Engine control is reached after that, so only one of them ever starts Floe.
 */
const link = new IdentityLink();
const engines = new EngineLink();
const connecting = link.connect().then(() => engines.connect());
const app = render(_jsx(App, { link: link, engines: engines }));
await connecting;
await app.waitUntilExit();
link.close();
engines.close();
