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
 *   4) tsx scripts/live-walk.ts emit-probe      # settle F-DOC: raw emit response
 *
 * Home + passphrase come from env so nothing is hand-baked into a screen:
 *   FLOE_CONSOLE_HOME  throwaway identity dir (required)
 *   FLOE_WALK_PASSPHRASE  passphrase for the throwaway key (required)
 */
import type { AuthSessionState } from "../src/session/auth-session.js";

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
    state = await session.selectWorkspace(state.workspaces[0]!.workspace_id);
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
      },
    });
    stream.start();
    setTimeout(() => resolve(), 8000);
  });
  await caughtUp;

  console.log("\nDiscovery (what is waiting on the operator):");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });
  const operator = await client.findOperatorEndpoint();
  log("operator endpoint", operator ? operator.endpoint_id : "(none found)");
  if (operator) {
    const pending = await client.listPendingForOperator(operator.endpoint_id);
    log("pending count", pending.length);
    for (const p of pending) log("  pending", `${p.correlation_id} <- ${p.waiting_endpoint_id}`);
  }
  console.log("\nconnect walk complete.\n");
  process.exit(0);
}

/**
 * F-DOC probe: get a real bearer through the real handshake, then record what
 * the running Bus actually returns from POST /v1/events/emit. This is the one
 * observational fetch the diagnostic makes directly, precisely because the
 * WorkspaceClient module hides the response body and F-DOC is the question of
 * what that body/route contract actually is. It reimplements no auth and no
 * stream — it only records the emit response verbatim so the doc can be fixed.
 */
async function emitProbe(): Promise<void> {
  const { state, endpoints } = await authenticate();
  if (state.kind !== "ready") {
    console.log(`\nnot ready (${state.kind}); cannot probe emit.\n`);
    process.exit(1);
  }
  const { WorkspaceClient } = await import("../src/bus/workspace-client.js");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });
  const operator = await client.findOperatorEndpoint();
  log("operator endpoint", operator ? operator.endpoint_id : "(none)");

  const url = new URL("/v1/events/emit", endpoints.httpBaseUrl).toString();
  const body = {
    workspace_id: state.workspace.workspace_id,
    source_endpoint_id: operator?.endpoint_id ?? null,
    payload: { body: "F-DOC probe" },
  };
  console.log("\nF-DOC raw probe -> POST /v1/events/emit");
  log("request body", body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${state.bearer.token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  log("response status", res.status);
  log("response body", text);
  console.log("\nemit-probe complete.\n");
  process.exit(0);
}

/**
 * Send work to the floe actor through the real WorkspaceClient.sendWork, and
 * print the Bus's actual emit response. Exercises job 2 (send work in) and
 * records the emit contract now that F-DOC is closed. The message asks the actor
 * to seek operator confirmation, so a model-driven turn should produce a request
 * addressed to the operator (a pending response to answer).
 *
 * The console emits AS the operator. If no operator endpoint is listed yet, use
 * the deterministic id the protocol doc's example uses (actor:<workspace>:operator).
 */
async function sendWorkPhase(): Promise<void> {
  const { state, endpoints } = await authenticate();
  if (state.kind !== "ready") {
    console.log(`\nnot ready (${state.kind}); cannot send work.\n`);
    process.exit(1);
  }
  const { WorkspaceClient, BusRequestError } = await import("../src/bus/workspace-client.js");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });
  const operator = await client.findOperatorEndpoint();
  const operatorId = operator?.endpoint_id ?? `actor:${state.workspace.workspace_id}:operator`;
  log("operator endpoint", operator ? operator.endpoint_id : `(none listed; using ${operatorId})`);

  const target = process.env.FLOE_WALK_TARGET ?? `actor:${state.workspace.workspace_id}:floe`;
  const body =
    process.env.FLOE_WALK_MESSAGE ??
    "Before doing anything else, use your request capability to ask me (the operator) to confirm: should you proceed? Wait for my answer.";
  log("target endpoint", target);
  try {
    const result = await client.sendWork({ sourceEndpointId: operatorId, targetEndpointId: target, body });
    console.log("\nBus emit response (job 2, send work):");
    log("result", result);
  } catch (err) {
    if (err instanceof BusRequestError) {
      log("emit refused status", err.status);
      log("emit refused message", err.message);
    } else {
      log("emit error", err instanceof Error ? err.message : String(err));
    }
  }
  console.log("\nsend-work complete.\n");
  process.exit(0);
}

/**
 * Answer the first pending question addressed to the operator, through the real
 * WorkspaceClient.emitOperatorReply, and print the Bus response + whether the
 * pending row is resolved afterward. Closes job 3 on the wire.
 */
async function answerPhase(): Promise<void> {
  const { state, endpoints } = await authenticate();
  if (state.kind !== "ready") {
    console.log(`\nnot ready (${state.kind}); cannot answer.\n`);
    process.exit(1);
  }
  const { WorkspaceClient } = await import("../src/bus/workspace-client.js");
  const client = new WorkspaceClient({
    httpBaseUrl: endpoints.httpBaseUrl,
    bearerToken: state.bearer.token,
    workspaceId: state.workspace.workspace_id,
  });
  const operator = await client.findOperatorEndpoint();
  if (!operator) {
    console.log("\nno operator endpoint; nothing can be waiting. Stopping.\n");
    process.exit(3);
  }
  const pending = await client.listPendingForOperator(operator.endpoint_id);
  log("pending count", pending.length);
  if (pending.length === 0) {
    console.log("\nnothing waiting to answer.\n");
    process.exit(0);
  }
  const first = pending[0]!;
  log("answering correlation", first.correlation_id);
  log("asked by", first.waiting_endpoint_id);
  const result = await client.emitOperatorReply({
    operatorEndpointId: operator.endpoint_id,
    waitingEndpointId: first.waiting_endpoint_id,
    correlationId: first.correlation_id,
    body: process.env.FLOE_WALK_ANSWER ?? "Yes, proceed. — the console operator",
  });
  console.log("\nBus emit response (job 3, answer):");
  log("result", result);
  const after = await client.listPendingForOperator(operator.endpoint_id);
  log("pending after answer", after.length);
  log("resolved on substrate", String(!after.some((r) => r.correlation_id === first.correlation_id)));
  console.log("\nanswer complete.\n");
  process.exit(0);
}

/**
 * Stream reject probe: drive the real EventStream module against the running
 * Bus with a bearer it will refuse, and record the socket lifecycle + the close
 * code. This proves the transport, the mandatory `authenticate` frame, and the
 * documented 4401 rejection path live — everything about the stream except the
 * parts that need an accepted bearer (which F-MIGRATE currently gates). No
 * bearer is faked into an "authenticated" state; we only observe the refusal.
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
          // A 4401 close is terminal (no reconnect); anything that reconnects
          // means the Bus dropped us some other way — stop after the first
          // terminal/reconnect signal so the probe does not loop.
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
    log("endpoint", `${e.endpoint_id} · role=${e.metadata?.role ?? "-"} · bridge_id=${e.bridge_id ?? "null"}`);
  }
  console.log();
  process.exit(0);
}

const table: Record<string, () => Promise<void>> = {
  provision,
  connect,
  "emit-probe": emitProbe,
  "stream-probe": streamProbe,
  endpoints: endpointsPhase,
  "send-work": sendWorkPhase,
  answer: answerPhase,
};
const run = table[phase];
if (!run) {
  console.error(`usage: live-walk.ts <provision|connect|emit-probe|stream-probe|endpoints|send-work|answer>`);
  process.exit(2);
}
run().catch((err) => {
  console.error("\nwalk failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
