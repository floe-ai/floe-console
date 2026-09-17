import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { EventStream, type StreamStatus } from "../../bus/event-stream.js";
import {
  WorkspaceClient,
  questionText,
  type Delivery,
  type Endpoint,
} from "../../bus/workspace-client.js";
import type { BusEndpoints } from "../../bus/config.js";
import type { BearerGrant } from "../../session/auth-session.js";
import { shortNpub } from "./Unlock.js";
import { Settings } from "./Settings.js";

/**
 * The default surface once authenticated. Three jobs, nothing else:
 *  1. see what the substrate is doing (a live activity line + status),
 *  2. answer what an actor asked ("Waiting on you"),
 *  3. send work to an actor.
 *
 * Answering is a client-executed Actor's turn ending, per the client identity
 * protocol. The console discovers the Actor its identity executes (the one whose
 * adapter is `client`), learns of waiting work by push on the stream
 * (delivery_bundle_available), claims the delivery, and ends the turn by
 * delivery id and text alone. It never assembles a reply event and never touches
 * a correlation id or context — the substrate resumes the asking Actor itself.
 *
 * "Waiting on you" is the set of claimed deliveries the human has not yet
 * answered. The stream is only a nudge to claim; this is push, not poll.
 *
 * C2 (honest failure): an answer shows "sending…" until the turn-result route
 * accepts it, then "answered"; if the route rejects it, it shows the failure. It
 * is never optimistically marked done and never silently left ambiguous.
 */

type AnswerState =
  | { readonly kind: "sending" }
  | { readonly kind: "answered" }
  | { readonly kind: "error"; readonly message: string };

type Mode =
  | { readonly name: "browse" }
  | { readonly name: "answer"; readonly item: Delivery }
  | { readonly name: "send" }
  | { readonly name: "settings" };

export function MainSurface({
  npub,
  workspaceName,
  workspaceId,
  bearer,
  endpoints,
}: {
  npub: string;
  workspaceName: string;
  workspaceId: string;
  bearer: BearerGrant;
  endpoints: BusEndpoints;
}): JSX.Element {
  const { exit } = useApp();
  const client = useMemo(
    () => new WorkspaceClient({ httpBaseUrl: endpoints.httpBaseUrl, bearerToken: bearer.token, workspaceId }),
    [endpoints.httpBaseUrl, bearer.token, workspaceId],
  );

  const [actor, setActor] = useState<Endpoint | null | "unknown">("unknown");
  const [waiting, setWaiting] = useState<Delivery[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ kind: "connecting" });
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [mode, setMode] = useState<Mode>({ name: "browse" });
  const [selected, setSelected] = useState(0);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Claim whatever is waiting for our Endpoint and merge it into the list,
  // skipping deliveries we have already answered. Called once on startup to
  // drain backlog, then only in response to a push — never on a timer.
  async function claimInto(endpointId: string): Promise<void> {
    try {
      const claimed = await client.claimDeliveries(endpointId);
      setWaiting((current) => {
        const answered = answersRef.current;
        const byId = new Map(current.map((d) => [d.delivery_id, d]));
        for (const d of claimed) {
          if (answered[d.delivery_id]?.kind === "answered") continue;
          byId.set(d.delivery_id, d);
        }
        return [...byId.values()];
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not claim deliveries.");
    }
  }

  // Discover the Actor we execute, drain any backlog, and open the stream.
  useEffect(() => {
    let stream: EventStream | null = null;
    let endpointId: string | null = null;
    let disposed = false;

    (async () => {
      try {
        const mine = await client.findClientActor();
        if (disposed) return;
        setActor(mine);
        if (!mine) return;
        endpointId = mine.endpoint_id;
        await claimInto(endpointId);
      } catch (err) {
        if (!disposed) setLoadError(err instanceof Error ? err.message : "Could not reach the Bus.");
      }
    })();

    stream = new EventStream({
      wsBaseUrl: endpoints.wsBaseUrl,
      bearerToken: bearer.token,
      workspaceId,
      startAtCurrent: true,
      handlers: {
        onStatus: (s) => setStreamStatus(s),
        onCaughtUp: () => {},
        onEntry: (entry) => {
          const t = typeof entry.payload?.type === "string" ? entry.payload.type : "event";
          setLastActivity(`${t} · ${new Date(entry.at).toLocaleTimeString()}`);
        },
        onDeliveryAvailable: (frame) => {
          setLastActivity(`work available · ${new Date().toLocaleTimeString()}`);
          if (endpointId && frame.payload.delivery.endpoint_id === endpointId) {
            void claimInto(endpointId);
          }
        },
      },
    });
    stream.start();

    return () => {
      disposed = true;
      stream?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, endpoints.wsBaseUrl, bearer.token, workspaceId]);

  useInput((input, key) => {
    // Settings owns all input while open (including its own two-level Esc).
    if (mode.name === "settings") return;
    if (mode.name === "browse") {
      if (input === "q") exit();
      if (input === "s") setMode({ name: "send" });
      if (input === "g") setMode({ name: "settings" });
      if (waiting.length > 0) {
        if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelected((i) => Math.min(waiting.length - 1, i + 1));
        if (key.return) {
          const item = waiting[Math.min(selected, waiting.length - 1)];
          if (item) setMode({ name: "answer", item });
        }
      }
    } else if (key.escape) {
      setMode({ name: "browse" });
    }
  });

  const header = (
    <Box justifyContent="space-between">
      <Text>
        <Text bold>{workspaceName}</Text> <Text dimColor>· {shortNpub(npub)}</Text>
      </Text>
      <Text dimColor>{describeStream(streamStatus)}</Text>
    </Box>
  );

  if (actor === "unknown") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text dimColor>Discovering the Actor your identity executes…</Text>
      </Box>
    );
  }

  if (actor === null) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text color="yellow">
          This workspace exposes no Actor your identity executes (none with adapter “client”).
          Registration provisions one, so a missing one means this workspace predates that or was
          set up incompletely — a substrate finding, not something the console can fill.
        </Text>
        <Text dimColor>Press q to quit.</Text>
      </Box>
    );
  }

  if (mode.name === "answer") {
    return (
      <AnswerPanel
        item={mode.item}
        answer={answers[mode.item.delivery_id]}
        onCancel={() => setMode({ name: "browse" })}
        onSubmit={async (text) => {
          const deliveryId = mode.item.delivery_id;
          setAnswers((a) => ({ ...a, [deliveryId]: { kind: "sending" } }));
          setMode({ name: "browse" });
          try {
            await client.endTurn({ deliveryId, text });
            setAnswers((a) => ({ ...a, [deliveryId]: { kind: "answered" } }));
            // The turn ended; the delivery is consumed. Drop it from the list.
            setWaiting((current) => current.filter((d) => d.delivery_id !== deliveryId));
          } catch (err) {
            setAnswers((a) => ({
              ...a,
              [deliveryId]: { kind: "error", message: err instanceof Error ? err.message : "Turn result failed." },
            }));
          }
        }}
      />
    );
  }

  if (mode.name === "settings") {
    return <Settings npub={npub} onClose={() => setMode({ name: "browse" })} />;
  }

  if (mode.name === "send") {
    return (
      <SendWork
        client={client}
        sourceEndpointId={actor.endpoint_id}
        onDone={() => setMode({ name: "browse" })}
      />
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {loadError && <Text color="red">{loadError}</Text>}

      <Box flexDirection="column">
        <Text bold>Waiting on you ({waiting.length})</Text>
        {waiting.length === 0 ? (
          <Text dimColor>Nothing is waiting. When an actor asks you, it appears here.</Text>
        ) : (
          waiting.map((d, i) => {
            const st = answers[d.delivery_id];
            return (
              <Text key={d.delivery_id} color={i === selected ? "cyan" : undefined}>
                {i === selected ? "❯ " : "  "}
                {truncate(questionText(d), 80)}
                {st ? <Text dimColor> — {describeAnswer(st)}</Text> : null}
              </Text>
            );
          })
        )}
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Live: {lastActivity ?? "waiting for activity…"}</Text>
      </Box>

      <Text dimColor>↑/↓ select · Enter answer · s send work · g settings · q quit</Text>
    </Box>
  );
}

function AnswerPanel({
  item,
  answer,
  onSubmit,
  onCancel,
}: {
  item: Delivery;
  answer: AnswerState | undefined;
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [body, setBody] = useState("");
  void onCancel;
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Answer</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text>{questionText(item)}</Text>
        <Text dimColor>asked on delivery {item.delivery_id}</Text>
      </Box>
      {answer?.kind === "error" && <Text color="red">{answer.message}</Text>}
      <Box>
        <Text>{"> "}</Text>
        <TextInput value={body} onChange={setBody} onSubmit={() => body.trim() && onSubmit(body)} />
      </Box>
      <Text dimColor>Enter to send · Esc to go back</Text>
    </Box>
  );
}

function SendWork({
  client,
  sourceEndpointId,
  onDone,
}: {
  client: WorkspaceClient;
  sourceEndpointId: string;
  onDone: () => void;
}): JSX.Element {
  const [targets, setTargets] = useState<Endpoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Endpoint | null>(null);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    client
      .listEndpoints()
      // Send work to model-backed actors (executed by a Bridge), not to
      // ourselves (the client-executed Actor).
      .then((all) => setTargets(all.filter((e) => e.adapter_id !== "client")))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not list actors."));
  }, [client]);

  useInput((_input, key) => {
    if (key.escape) onDone();
    if (target || !targets) return;
    if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelected((i) => Math.min(targets.length - 1, i + 1));
    if (key.return && targets[selected]) setTarget(targets[selected]);
  });

  if (error) return <Text color="red">{error}</Text>;
  if (!targets) return <Text>Loading actors…</Text>;
  if (sent)
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="green">Sent.</Text>
        <Text dimColor>Esc to go back.</Text>
      </Box>
    );

  if (!target) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Send work — choose an actor</Text>
        {targets.length === 0 ? (
          <Text dimColor>No actors to send to.</Text>
        ) : (
          targets.map((e, i) => (
            <Text key={e.endpoint_id} color={i === selected ? "cyan" : undefined}>
              {i === selected ? "❯ " : "  "}
              {e.name ?? e.endpoint_id}
            </Text>
          ))
        )}
        <Text dimColor>↑/↓ select · Enter choose · Esc cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Send work to {target.name ?? target.endpoint_id}</Text>
      <Box>
        <Text>{"> "}</Text>
        <TextInput
          value={body}
          onChange={setBody}
          onSubmit={async () => {
            if (!body.trim()) return;
            try {
              await client.sendWork({ sourceEndpointId, targetEndpointId: target.endpoint_id, body });
              setSent(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Emit failed.");
            }
          }}
        />
      </Box>
      <Text dimColor>Enter to send · Esc to cancel</Text>
    </Box>
  );
}

function describeAnswer(state: AnswerState): string {
  switch (state.kind) {
    case "sending":
      return "sending…";
    case "answered":
      return "answered";
    case "error":
      return `failed: ${state.message}`;
  }
}

function describeStream(status: StreamStatus): string {
  switch (status.kind) {
    case "connecting":
      return "connecting…";
    case "authenticating":
      return "authenticating…";
    case "replaying":
      return "syncing…";
    case "caught_up":
      return "live";
    case "reconnecting":
      return `reconnecting (try ${status.attempt})…`;
    case "closed":
      return `stream closed: ${status.reason}`;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
