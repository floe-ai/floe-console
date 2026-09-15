#!/usr/bin/env node
import { render } from "ink";
import { App } from "./app/App.js";

/**
 * Entry point. floe-console is an ordinary, unprivileged HTTP + WebSocket
 * consumer of floe-bus: it holds a client keypair, authenticates to obtain a
 * scoped bearer, and never reaches around the substrate.
 */
render(<App />);
