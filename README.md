# floe-console

A terminal client for the [Floe](https://github.com/floe-ai/floe) substrate.

It has exactly three jobs:

1. **See** what the substrate is doing — deliveries, turns, actors, pulses, events.
2. **Send work in**, and see what became of it: received, working, waiting on you, then the Actor's answer (marked as trimmed if it is long). Every step comes from an event Floe pushed.
3. **Answer what actors ask.** Floe actors can ask a question mid-turn; this client exists so that question can be answered.

It is nothing else. Not a dashboard, not a project manager, not an IDE.

## Install

```
npm install -g github:floe-ai/floe-console
```

Then open a new shell, `cd` anywhere, and run `floe-console`. Floe starts and the console opens on its first-run screen.

You do not need to install Floe first: the console depends on Floe (`github:floe-ai/floe`) and uses its own copy. The console does not put a `floe` command on your PATH — `floe` belongs to Floe alone. If you also install Floe (`npm install -g github:floe-ai/floe`), bare `floe` is its boot menu: it finds the console through the `floe.surface` field in the console's package.json and launches it (`floe console` works by name).

### Upgrading

Run the install command again. Floe 0.3.2 runs its services from its own staged copy under `~/.floe`, so upgrading works while Floe is running.

## Principles that will not change

- **No privileged access.** floe-console is an ordinary HTTP + WebSocket consumer of floe-bus. It holds no host-control credential and reaches around nothing.
- **If the bus can't do something, that's a finding, not a workaround.** Missing or wrong substrate behaviour is reported upstream, never mocked, stubbed, or worked around locally.
- **Nothing is shown that hasn't been confirmed.** No optimistic UI. A surface reflects observed substrate state or it says it doesn't know.

## How it sits on Floe

- **Floe is a dependency, used only through its public client.** The console imports `floe/identity` from its own copy of Floe (`github:floe-ai/floe#semver:^0.3.4`) and nothing else inside the Floe package. Connecting to Floe's identity agent starts Floe where this machine's `services.start_on_demand` allows it.
- **Floe finds it by its package.json, not a registry write.** The `floe.surface` field (name `console`, bin `floe-console`) is how Floe's boot menu detects an installed console. Nothing runs at install and nothing is written at launch.
- **The compiled `dist/` is committed.** `npm install -g github:…` cannot build or run install scripts for a git package: npm prepares a git package with a nested install that inherits `--global`, which installs the package over itself and fails (verified on npm 11.3). So the package has no `build`, `prepare`, or `postinstall` script, and ships `dist/` in the repo. A test fails if `dist/` is not exactly what the source compiles to.

## Identity

Floe owns the identity, not the console. Floe's identity agent holds the key, signs, and pushes the console short-lived bearers, renewed before they expire. The console holds no key, stores no key, and never shows the npub. Every Floe surface on this machine shares the same identity.

The console draws the screens; Floe does the work:

- **Create** — a name and a passphrase. Blank means this device protects it: anyone who can use this computer as you can act as you, and the recovery phrase is the only copy that survives this machine. The phrase is shown once, to be written down.
- **Unlock** — only for a passphrase identity. It always offers "Forgot passphrase" (Esc).
- **Restore** — from the recovery phrase, at first run or from "Forgot passphrase".
- **Reveal** — in settings (`g`). A passphrase identity asks for the passphrase; a device identity asks for confirmation. An identity made before recovery phrases shows its secret key (nsec) instead.
- **Your identities** — in settings (`g`). Lists every identity kept on this machine: the one in use, each copy Floe set aside (restore, replace, import), and any file an earlier console left behind. Each shows when it was made, how it is protected and whether it has a recovery phrase. npubs stay hidden until you press `n`. Any of them can be deleted for good; deleting the one in use ends every session and returns the console to first run.
- **Forgot passphrase without the phrase** — Floe makes a new identity and gives it the same workspaces on this machine. Work done before stays credited to the old identity.

The same flows exist without any surface: `floe identity status|create|unlock|lock|reveal|restore|replace|join|sessions`.

**Earlier consoles** kept their own identity file (`%APPDATA%\floe-console\identity.key.json` on Windows). If the console finds one, it offers to bring it into Floe or set it aside. It never adopts or drops it silently. After a successful import the console deletes its file; a file set aside is renamed with a date and stays until you delete it in "Your identities".

Registering a folder as a workspace is the act of joining it; there is no admission step in first run.

## Develop

```
npm install
npm test            # unit tests, including the committed-dist freshness check
npm run typecheck
npm run compile     # rebuild dist/ — commit it with the source change
npm run dev         # run the console from source (needs a real terminal)
```

Requires Node 20+.
