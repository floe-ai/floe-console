# floe-console

A terminal client for the [Floe](https://github.com/floe-ai/floe) substrate.

It has exactly three jobs:

1. **See** what the substrate is doing — deliveries, turns, actors, pulses, events.
2. **Send work in.**
3. **Answer what actors ask.** Floe actors can ask a question mid-turn; this client exists so that question can be answered.

It is nothing else. Not a dashboard, not a project manager, not an IDE.

## Install

```
npm install -g github:floe-ai/floe-console
```

Then open a new shell, `cd` anywhere, and run `floe`. Floe starts, and the console opens on its first-run screen. `floe-console` does the same thing directly.

You do not need to install Floe first. The console depends on Floe (`github:floe-ai/floe`) and brings its own copy, and it installs a `floe` command that hands everything to that copy. Because of that, installing the console and installing Floe globally on their own are mutually exclusive — npm refuses to let two packages own the `floe` command. Uninstall one before installing the other.

## Principles that will not change

- **No privileged access.** floe-console is an ordinary HTTP + WebSocket consumer of floe-bus. It holds no host-control credential and reaches around nothing.
- **If the bus can't do something, that's a finding, not a workaround.** Missing or wrong substrate behaviour is reported upstream, never mocked, stubbed, or worked around locally.
- **Nothing is shown that hasn't been confirmed.** No optimistic UI. A surface reflects observed substrate state or it says it doesn't know.

## How it sits on Floe

- **Floe is a dependency, called only through its bin.** The console resolves the `floe` CLI from its own `node_modules` (never from PATH) and runs it as `node <floe bin>`. It uses `floe up` to make the substrate reachable and `floe surface register` to make itself launchable. Nothing else inside the Floe package is touched.
- **It registers itself at launch, not at install.** Every `floe` start re-registers the `console` surface, pointing at the copy that is running, so a reinstall or upgrade can never leave Floe pointing at a stale path.
- **The compiled `dist/` is committed.** `npm install -g github:…` cannot build or run install scripts for a git package: npm prepares a git package with a nested install that inherits `--global`, which installs the package over itself and fails (verified on npm 11.3). So the package has no `build`, `prepare`, or `postinstall` script, and ships `dist/` in the repo. A test fails if `dist/` is not exactly what the source compiles to.

## Identity

The substrate never sees a recovery phrase or a private key. The person holds a keypair (BIP-39 → NIP-06); authentication is a signed challenge (NIP-42 kind 22242).

First run creates the identity silently and shows the recovery phrase once, to be written down. The phrase is stored encrypted on this machine (scrypt + AES-256-GCM) in the per-user config dir, under a passphrase. A blank passphrase means this device is the authentication — anyone with access to this machine is this identity. The phrase can be revealed again in settings (`g`), and restored on another machine from the first-run screen.

Registering a folder as a workspace is the act of joining it — there is no admission step in first run.

## Develop

```
npm install
npm test            # unit tests, including the committed-dist freshness check
npm run typecheck
npm run compile     # rebuild dist/ — commit it with the source change
npx tsx scripts/identity-smoke.ts   # live local identity walk (no Bus needed)
npm run dev         # run the console from source (needs a real terminal)
```

Requires Node 20+.
