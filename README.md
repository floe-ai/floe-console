# floe-console

A terminal client for the [Floe](https://github.com/floe-ai/floe-substrate) substrate.

It has exactly three jobs:

1. **See** what the substrate is doing — deliveries, turns, actors, pulses, events.
2. **Send work in.**
3. **Answer what actors ask.** Floe actors can ask a human a question mid-turn; this client exists so that question can be answered.

It is nothing else. Not a dashboard, not a project manager, not an IDE.

## Principles that will not change

- **No privileged access.** floe-console is an ordinary HTTP + WebSocket consumer of floe-bus. It holds no host-control credential and reaches around nothing.
- **If the bus can't do something, that's a finding, not a workaround.** Missing or wrong substrate behaviour is reported upstream, never mocked, stubbed, or worked around locally.
- **Nothing is shown that hasn't been confirmed.** No optimistic UI. A surface reflects observed substrate state or it says it doesn't know.

## Identity is the client's half

The substrate never sees a seed phrase or a private key. A human holds a keypair; the public key (`npub`) is their stable identity; authentication is a signed challenge (Nostr stack: BIP-39 → NIP-06 → NIP-01 → NIP-42 kind 22242 → NIP-19).

This client owns: generating the recovery phrase, deriving the key (NIP-06), storing the private key encrypted on this machine, and showing the human their `npub` so a host-control operator can admit it once via `floe-cli`. Admission is the one out-of-band step.

### Key storage

The private key is stored in an **encrypted file guarded by a passphrase** (scrypt + AES-256-GCM), in the per-user config dir — never in this repo, never in the substrate. One code path on every OS; works headless and over SSH. An OS keychain was rejected: it proves the machine, not the human, which is the exact weakness this identity primitive exists to remove.

The recovery phrase is the only durable backup and is never persisted. Lose the phrase and lose this machine, and the identity is gone — by design.

## Status

Built and unit-verified: client identity + encrypted storage, the documented
challenge/authenticate handshake, the auth/bearer session state machine, the
live `/v1/events/stream` client, and the full Ink surface (first-run, unlock,
admission wait, workspace select, main surface).

**One open substrate finding — F-DOC.** The docs name the answer route
(`POST /v1/events/emit`), its authority, and the fields to match (correlation,
operator source, waiting-actor destination), but no document gives the literal
request body, and `bus-api.md` instead points clients at runtime operation
discovery (`context.communication.emit`) without reconciling the two. Answering
and sending work therefore go through a single isolated, clearly-flagged emit
seam (`src/bus/workspace-client.ts`) whose exact shape is confirmed against the
running Bus, not asserted.

**The live gate is not closed.** It requires a running Bus with an actor that
asks a question, and this key admitted via `floe identity add`. Nothing here
fakes a bearer or mocks substrate state to stand in for that walk.

## Develop

```
npm install
npm test          # unit tests: crypto/storage, auth state machine, stream protocol
npm run typecheck
npm run build
npx tsx scripts/identity-smoke.ts   # live local identity walk (no Bus needed)
npm run dev       # run the console (needs a real terminal)
```

Requires Node 20+.
