/**
 * Live end-to-end walk — the console running WITHOUT a terminal.
 *
 * This is NOT a second implementation of the console. It drives the SAME
 * modules the Ink app drives: provisionIdentity (first-run key), createServices
 * (config + IdentityAuthClient + AuthSession), the AuthSession handshake,
 * EventStream, and WorkspaceClient. If any of those is broken, this fails
 * exactly where the product would.
 *
 * It is unprivileged: it authenticates as an ordinary client and nothing else.
 * Admission of the generated npub is done out of band by the operator with
 * floe-cli, which is why this is phase-controlled and shares one home across
 * phases:
 *
 *   1) tsx scripts/live-walk.ts provision      # generate key, print npub
 *   2) (operator) floe identity add --pubkey <npub> --workspace <id> ...
 *   3) tsx scripts/live-walk.ts connect         # handshake, stream, discovery
 *   4) tsx scripts/live-walk.ts job3            # full loop: ask -> answer -> resume
 *
 * Home + passphrase come from env so nothing is hand-baked into a screen:
 *   FLOE_CONSOLE_HOME     throwaway identity dir (required)
 *   FLOE_WALK_PASSPHRASE  passphrase for the throwaway key (required)
 *   FLOE_WALK_WORKSPACE   optional: select a workspace by id or name
 */
import type { AuthSessionState } from "../src/session/auth-session.js";
import type { Delivery, Endpoint } from "../src/bus/workspace-client.js";
import type { StreamEntry } from "../src/bus/types.js";

const phase = process.argv[2] ?? "";
const passphrase = process.env.FLOE_WALK_PASSPHRASE ?? "";

function need(name: string, value: string): string {
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
  return value;
}

function log(label: string, value: unknown): void {
  console.log(`  ${label.padEnd(26)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function provision(): Promise<void> {
  need("FLOE_WALK_PASSPHRASE", passphrase);
  const { generateRecoveryPhrase } = await import("../src/identity/mnemonic.js");
  const { provisionIdentity } = await import("../src/identity/provision.js");
  const { identityExists } = await import("../src/identity/store-fs.js");

  if (identityExists()) {
    console.log("identity already present in this home; skipping generation");
    const { loadIdentityFile } = await import("../src/identity/store-fs.js");
    log("npub", loadIdentityFile()?.npub ?? "(unknown)");
    return;
  }

  const phrase = generateRecoveryPhrase();
  const { npub } = provisionIdentity(phrase, passphrase);
  console.log("\nGenerated + stored a console identity (phrase not printed).");
  log("npub", npub);
  console.log("\nAdmit it as operator, then run: live-walk.ts connect\n");
}

/** Drive the AuthSession handshake to a terminal state and return it. */
async function authenticate(): Promise<{
  state: AuthSessionState;
  endpoints: { httpBaseUrl: string; wsBaseUrl: string; source: string };
}> {
  need("FLOE_WALK_PASSPHRASE", passphrase);
  const { createServices } = await import("../src/app/services.js");
  const { endpoints, session } = createServices();
  log("bus http", `${endpoints.httpBaseUrl} (${endpoints.source})`);
  log("bus ws", endpoints.wsBaseUrl);

  session.subscribe((s) => log("session ->", s.kind + ("message" in s && s.message ? `: ${s.message}` : "")));
  session.init();
  await session.unlock(passphrase);

  // If a selection is required, pick the first offered workspace (the substrate
  // gave us these names; we do not invent an id).
  let state = session.getState();
  if (state.kind === "selecting-workspace") {
    log("workspaces offered", state.workspaces.map((w) => `${w.name} (${w.workspace_id})`));
    const want = process.env.FLOE_WALK_WORKSPACE;
    const chosen =
      (want ? state.workspaces.find((w) => w.workspace_id === want || w.name === want) : undefined) ??
      state.workspaces[0]!;
    state = await session.selectWorkspace(chosen.workspace_id);
  }
  return { state, endpoints };
}

async function connect(): Promise<void> {
  const { state, endpoints } = await authenticate();
  if (state.kind !== "ready") {
    console.log(`\nnot ready (${state.kind}). Stopping — see session state above.\n`);
    process.exit(state.kind === "awaiting-admission" ? 3 : 1);
  }
  log("workspace", `${state.workspace.name} (${state.workspace.workspace_id})`);
  log("bearer expires", state.bearer.expiresAt ?? "(no expiry)");

  const { EventStream } = await import("../src/bus/event-stream.js");
  const { WorkspaceClient } = await import("../src/bus/workspace-client.js");

  console.log("\nStream (push, not poll):");
  const caughtUp = new Promise<void>((resolve) => {
    const stream = new EventStream({
      wsBaseUrl: endpoints.wsBaseUrl,
      bearerToken: state.bearer.token,
      workspaceId: state.workspace.workspace_id,
      startAtCurrent: true,
      handlers: {
        onStatus: (st) => log("stream ->", st.kind + ("reason" in st ? `: ${st.reason}` : "")),
        onEntry: (e) => log("stream entry", e.type),
        onCaughtUp: () => resolve(),
        onDeliveryAvailable: (f) => log("delivery available", f.payload.delivery.delivery_id),
      },
    });
    stream.start();
    setTimeout(() => resolve(), 8000);
  });
  await caughtUp;

  console.log("\nDiscovery (the Actor this identity executes):");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });
  const mine = await client.findClientActor();
  log("client actor", mine ? mine.endpoint_id : "(none found — a substrate finding)");
  if (mine) {
    const claimed = await client.claimDeliveries(mine.endpoint_id);
    log("waiting deliveries", claimed.length);
    for (const d of claimed) log("  delivery", d.delivery_id);
  }
  console.log("\nconnect walk complete.\n");
  process.exit(0);
}

/**
 * Job 3 end-to-end on the turn-end answer shape, driving the real modules with
 * the stream open — the whole product loop without a terminal:
 *
 *   authenticate -> open EventStream (with onDeliveryAvailable) -> discover the
 *   Actor this identity executes (adapter_id === "client") by ordinary listing
 *   -> send work asking the floe Actor to use its request capability to ask this
 *   client Actor a question -> learn of the request by PUSH (delivery_bundle
 *   _available) -> claim the delivery -> end the turn with delivery_id + text
 *   alone -> observe the asking Actor RESUME in its original context.
 *
 * Nothing is faked and no reply Event is assembled. Success is NOT a status code
 * or a resolved row (those lied three times). Success is the asking Actor's own
 * subsequent output demonstrating it treated the answer as a continuation of the
 * question it asked — captured from the stream and printed for a human to judge.
 */
async function job3(): Promise<void> {
  const { state, endpoints } = await authenticate();
  if (state.kind !== "ready") {
    console.log(`\nnot ready (${state.kind}); cannot run job 3.\n`);
    process.exit(1);
  }
  const { EventStream } = await import("../src/bus/event-stream.js");
  const { WorkspaceClient, questionText } = await import("../src/bus/workspace-client.js");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });

  // Discover both actors by ordinary listing. Mine is the one my identity
  // executes (adapter "client"); the target is a model-backed Actor.
  const all = await client.listEndpoints();
  const mine = all.find((e) => e.adapter_id === "client") ?? null;
  if (!mine) {
    console.log("\nno client-executed Actor in this workspace; job 3 cannot run.\n");
    process.exit(3);
  }
  const target: Endpoint | undefined =
    (process.env.FLOE_WALK_TARGET
      ? all.find((e) => e.endpoint_id === process.env.FLOE_WALK_TARGET)
      : undefined) ?? all.find((e) => e.adapter_id && e.adapter_id !== "client");
  if (!target) {
    console.log("\nno model-backed Actor to ask; job 3 cannot run.\n");
    process.exit(3);
  }
  log("my (client) actor", `${mine.endpoint_id} · adapter=${mine.adapter_id}`);
  log("target actor", `${target.endpoint_id} · adapter=${target.adapter_id}`);

  // Everything the stream carries, in order, so we can inspect what the asking
  // Actor produced AFTER we answered.
  const entries: StreamEntry[] = [];
  const claimed: Delivery[] = [];
  let claiming = false;

  async function drainClaim(): Promise<void> {
    if (claiming) return;
    claiming = true;
    try {
      const ds = await client.claimDeliveries(mine!.endpoint_id);
      for (const d of ds) if (!claimed.some((c) => c.delivery_id === d.delivery_id)) claimed.push(d);
    } finally {
      claiming = false;
    }
  }

  const stream = new EventStream({
    wsBaseUrl: endpoints.wsBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
    startAtCurrent: true,
    handlers: {
      onStatus: (st) => log("stream ->", st.kind + ("reason" in st ? `: ${st.reason}` : "")),
      onCaughtUp: () => log("stream ->", "caught_up"),
      onEntry: (e) => {
        entries.push(e);
      },
      onDeliveryAvailable: (f) => {
        log("PUSH delivery available", `${f.payload.delivery.delivery_id} for ${f.payload.delivery.endpoint_id}`);
        if (f.payload.delivery.endpoint_id === mine!.endpoint_id) void drainClaim();
      },
    },
  });
  stream.start();
  await new Promise((r) => setTimeout(r, 1500));

  const ask =
    process.env.FLOE_WALK_MESSAGE ??
    "Before doing anything else, use your request capability to ask me a single question: " +
      "what is the secret word? Wait for my answer, then repeat the secret word back to confirm you received it.";
  log("send work to target", target.endpoint_id);
  const sent = await client.sendWork({ sourceEndpointId: mine.endpoint_id, targetEndpointId: target.endpoint_id, body: ask });
  log("send work result", sent);

  console.log("\nWaiting for the actor to ask, by PUSH (up to 120s)...");
  const askDeadline = Date.now() + 120_000;
  while (Date.now() < askDeadline && claimed.length === 0) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (claimed.length === 0) {
    // A backstop single claim in case the push was missed; still push-first.
    await drainClaim();
  }
  if (claimed.length === 0) {
    console.log("\nno request surfaced within budget.\n");
    stream.stop();
    process.exit(1);
  }

  const delivery = claimed[0]!;
  const question = questionText(delivery);
  log("actor asked (delivery)", delivery.delivery_id);
  log("question text", question);

  const secret = process.env.FLOE_WALK_ANSWER ?? "marmalade";
  const answerText = `The secret word is ${secret}.`;
  const markBefore = entries.length;
  console.log("\nEnding the turn (delivery_id + text only; no event assembly):");
  const result = await client.endTurn({ deliveryId: delivery.delivery_id, text: answerText });
  log("turn-result response", result);

  console.log("\nWaiting for the asking Actor to RESUME in its original context (up to 120s)...");
  const resumeDeadline = Date.now() + 120_000;
  const containsSecret = (): boolean =>
    entries.slice(markBefore).some((e) => JSON.stringify(e.payload).toLowerCase().includes(secret.toLowerCase()));
  while (Date.now() < resumeDeadline && !containsSecret()) {
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\nStream frames AFTER the answer (the asking Actor's continuation):");
  const after = entries.slice(markBefore);
  for (const e of after) {
    const payload = e.payload as { type?: string; content?: { text?: string }; source_endpoint_id?: string };
    const text = payload.content?.text;
    log("  frame", `${payload.type ?? e.type}${text ? ` :: ${text}` : ""}`);
  }

  const resumed = containsSecret();
  console.log("");
  log("asker echoed the secret word", String(resumed));
  log("VERDICT", resumed
    ? "PASS — the asking Actor treated the answer as a continuation of its own question."
    : "UNPROVEN — no continuation carrying the secret word was seen; inspect frames above.");
  stream.stop();
  process.exit(resumed ? 0 : 1);
}

/**
 * Stream reject probe: drive the real EventStream module against the running
 * Bus with a bearer it will refuse, and record the socket lifecycle + the close
 * code. This proves the transport, the mandatory `authenticate` frame, and the
 * documented 4401 rejection path live — everything about the stream except the
 * parts that need an accepted bearer. No bearer is faked into an "authenticated"
 * state; we only observe the refusal.
 */
async function streamProbe(): Promise<void> {
  const { resolveBusEndpoints } = await import("../src/bus/config.js");
  const { EventStream } = await import("../src/bus/event-stream.js");
  const endpoints = resolveBusEndpoints();
  log("bus ws", `${endpoints.wsBaseUrl} (${endpoints.source})`);

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = (stream: { stop(): void }): void => {
      if (done) return;
      done = true;
      stream.stop();
      resolve();
    };
    const stream = new EventStream({
      wsBaseUrl: endpoints.wsBaseUrl,
      bearerToken: "not-a-real-bearer",
      workspaceId: "workspace_probe",
      startAtCurrent: true,
      maxBackoffMs: 1,
      handlers: {
        onStatus: (st) => {
          if (done) return;
          log("stream ->", st.kind + ("reason" in st ? `: ${st.reason}` : ""));
          if (st.kind === "closed" || st.kind === "reconnecting") finish(stream);
        },
        onEntry: (e) => log("stream entry", e.type),
        onCaughtUp: (c) => log("caught_up", c ?? "(null)"),
      },
    });
    stream.start();
    setTimeout(() => resolve(), 8000);
  });
  console.log("\nstream-probe complete.\n");
  process.exit(0);
}

async function endpointsPhase(): Promise<void> {
  const { state, endpoints } = await authenticate();
  if (state.kind !== "ready") {
    console.log(`\nnot ready (${state.kind}); cannot list endpoints.\n`);
    process.exit(1);
  }
  const { WorkspaceClient } = await import("../src/bus/workspace-client.js");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });
  const all = await client.listEndpoints();
  console.log(`\nendpoints (${all.length}):`);
  for (const e of all) {
    log("endpoint", `${e.endpoint_id} · agent_id=${e.agent_id ?? "-"} · adapter_id=${e.adapter_id ?? "-"} · bridge_id=${e.bridge_id ?? "null"}`);
  }
  console.log();
  process.exit(0);
}

const table: Record<string, () => Promise<void>> = {
  provision,
  connect,
  job3,
  "stream-probe": streamProbe,
  endpoints: endpointsPhase,
};
const run = table[phase];
if (!run) {
  console.error(`usage: live-walk.ts <provision|connect|job3|stream-probe|endpoints>`);
  process.exit(2);
}
run().catch((err) => {
  console.error("\nwalk failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
