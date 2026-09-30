# floe-console

A terminal client for the [Floe](https://github.com/floe-ai/floe) substrate.

It has exactly three jobs:

1. **See** what the substrate is doing — deliveries, turns, actors, pulses, events.
2. **Send work in**, and see what became of it: received, working, waiting on you, then the Actor's answer (marked as trimmed if it is long). Every step comes from an event Floe pushed. If the AI engine is not ready, the console says so before you send, and work you send anyway shows as waiting (for example "waiting for sign-in"), not failed: Floe holds it and runs it once the engine is ready.
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

- **Floe is a dependency, used only through its public clients.** The console imports `floe/identity` and `floe/engines` from its own copy of Floe (`github:floe-ai/floe#semver:^0.4.7`) and nothing else inside the Floe package. Connecting to Floe's identity agent starts Floe where this machine's `services.start_on_demand` allows it; engine control is reached after that. If engine control is not up yet, or goes down, the AI engine line recovers by itself when the Bus pushes that a Bridge is connected (`bridge_connected`, or `connected_bridge_ids` in `caught_up`). There is no timer.
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

## AI engine sign-in

Floe's Bridge pushes whether each AI engine (today, Copilot) can run work. The main screen shows Floe's own message for it and the one action Floe asks for:

| Floe says | The console offers |
|---|---|
| Signed out | `i` **Sign in**: Floe opens GitHub's own sign-in in your browser. The console shows starting → finish in your browser → finished, failed or cancelled, with `c` to cancel. |
| No plan | **Check subscription**. Signing in again will not help. `r` checks again once it is fixed. |
| Blocked by an organisation | **Contact administrator**. Signing in again will not help. `r` checks again once it is allowed. |
| Access could not be confirmed, or unreachable | `r` **Try again** |

The console never sees a credential and never asks you to type a command. Floe does not use a `gh` login, so a machine logged in to `gh` can still show "signed out".

Before work is sent, the console warns only about the engine the chosen Actor uses (`metadata.engine` on its endpoint). An Actor Floe says needs no engine gets no warning. Until a Bridge has picked the Actor up, Floe has not said, so every engine that is not ready is mentioned.

## Workspace folders and System access

In settings (`g`) → **Workspace folders and System access**. The screen shows only what Floe pushed (`workspace_access` on `caught_up`, then `workspace_access_changed`); each change is one of Floe's workspace operations, and Floe's own reason is shown when it refuses.

- **Folders** — Actors' file tools can read and change files in the workspace's folders freely, without asking. Add a folder with the same picker first run uses; remove one after a confirmation (nothing in it is deleted). The workspace's own folder cannot be removed.
- **Commands are not confined.** A command an Actor runs can read, change or delete any file you can, whatever the folders say. The screen says so wherever folders are described.
- **System access** — off by default. Turning it on asks first and warns: "Actors can read and write anywhere on this machine." Turning it off takes effect at once.
- **Floe's access notices** — the main screen shows each notice Floe keeps about access in the workspace that you have not seen yet, in Floe's words: an Actor's access about to run out, an Actor's access moving to a person, access carried over or left behind by a copy or restore, and the one-time note that Floe Actors can use tools inside the workspace's folders. `m` marks the top one seen through Floe (`workspace.notice.acknowledge`); it goes when Floe pushes that you have seen it, on every surface you use.
- **A different Floe already running** — when the Floe already running is a different version from the console's copy, Floe's own note about it shows above every screen. Floe keeps the running one as it is until Floe restarts.

## Develop

```
npm install
npm test            # unit tests, including the committed-dist freshness check
npm run typecheck
npm run compile     # rebuild dist/ — commit it with the source change
npm run dev         # run the console from source (needs a real terminal)
```

Requires Node 20+.
