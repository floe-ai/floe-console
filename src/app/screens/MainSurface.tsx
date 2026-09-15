import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { EventStream, type StreamStatus } from "../../bus/event-stream.js";
import { WorkspaceClient, type Endpoint, type PendingResponse } from "../../bus/workspace-client.js";
import type { BusEndpoints } from "../../bus/config.js";
import type { BearerGrant } from "../../session/auth-session.js";
import { shortNpub } from "./Unlock.js";

/**
 * The default surface once authenticated. Three jobs, nothing else:
 *  1. see what the substrate is doing (a live activity line + status),
 *  2. answer what an actor asked the operator ("Waiting on you"),
 *  3. send work to an actor.
 *
 * "Waiting on you" is the documented /v1/pending-responses projection, not a
 * guess parsed from event payloads. The stream is only a nudge: every live frame
 * triggers a refresh of that authoritative list. This is push, not poll.
 *
 * C2 (honest failure): an answer is marked resolved ONLY when it is observed to
 * leave the pending list. Until then it shows "sent — not yet confirmed"; it is
 * never optimistically marked done, and never silently left ambiguous.
 */

type AnswerState =
  | { readonly kind: "sending" }
  | { readonly kind: "sent-unconfirmed"; readonly at: number }
  | { readonly kind: "answered" }
  | { readonly kind: "error"; readonly message: string };

type Mode = { readonly name: "browse" } | { readonly name: "answer"; readonly item: PendingResponse } | { readonly name: "send" };

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

  const [operator, setOperator] = useState<Endpoint | null | "unknown">("unknown");
  const [pending, setPending] = useState<PendingResponse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ kind: "connecting" });
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [mode, setMode] = useState<Mode>({ name: "browse" });
  const [selected, setSelected] = useState(0);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  async function refreshPending(operatorEndpointId: string): Promise<void> {
    try {
      const rows = await client.listPendingForOperator(operatorEndpointId);
      setPending(rows);
      // Observe resolution: any correlation we sent that is no longer pending
      // has actually been resolved on the substrate.
      const present = new Set(rows.map((r) => r.correlation_id));
      const current = answersRef.current;
      let changed = false;
      const next: Record<string, AnswerState> = { ...current };
      for (const [cid, st] of Object.entries(current)) {
        if ((st.kind === "sent-unconfirmed" || st.kind === "sending") && !present.has(cid)) {
          next[cid] = { kind: "answered" };
          changed = true;
        }
      }
      if (changed) setAnswers(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not read pending responses.");
    }
  }

  // Discover the operator endpoint, seed the pending list, and open the stream.
  useEffect(() => {
    let stream: EventStream | null = null;
    let operatorId: string | null = null;
    let disposed = false;

    (async () => {
      try {
        const op = await client.findOperatorEndpoint();
        if (disposed) return;
        setOperator(op);
        if (!op) return;
        operatorId = op.endpoint_id;
        await refreshPending(operatorId);
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
        onCaughtUp: () => {
          if (operatorId) void refreshPending(operatorId);
        },
        onEntry: (entry) => {
          const t = typeof entry.payload?.type === "string" ? entry.payload.type : "event";
          setLastActivity(`${t} · ${new Date(entry.at).toLocaleTimeString()}`);
          if (operatorId) void refreshPending(operatorId);
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
    if (mode.name === "browse") {
      if (input === "q") exit();
      if (input === "s") setMode({ name: "send" });
      if (pending.length > 0) {
        if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelected((i) => Math.min(pending.length - 1, i + 1));
        if (key.return) {
          const item = pending[Math.min(selected, pending.length - 1)];
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

  if (operator === null) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text color="yellow">
          No operator endpoint in this workspace (role "operator", bridgeless). Nothing can be
          waiting on you here, and answers cannot be emitted. This is a substrate finding, not
          something the console can fill.
        </Text>
        <Text dimColor>Press q to quit.</Text>
      </Box>
    );
  }

  if (mode.name === "answer") {
    return (
      <AnswerPanel
        item={mode.item}
        answer={answers[mode.item.correlation_id]}
        onCancel={() => setMode({ name: "browse" })}
        onSubmit={async (body) => {
          const op = operator;
          if (op === null || op === "unknown") return;
          const cid = mode.item.correlation_id;
          setAnswers((a) => ({ ...a, [cid]: { kind: "sending" } }));
          setMode({ name: "browse" });
          try {
            await client.emitOperatorReply({
              operatorEndpointId: op.endpoint_id,
              waitingEndpointId: mode.item.waiting_endpoint_id,
              correlationId: cid,
              body,
            });
            setAnswers((a) => ({ ...a, [cid]: { kind: "sent-unconfirmed", at: Date.now() } }));
            void refreshPending(op.endpoint_id);
          } catch (err) {
            setAnswers((a) => ({
              ...a,
              [cid]: { kind: "error", message: err instanceof Error ? err.message : "Emit failed." },
            }));
          }
        }}
      />
    );
  }

  if (mode.name === "send") {
    const op = operator;
    if (op === null || op === "unknown") {
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          <Text color="yellow">No operator endpoint to send from yet.</Text>
          <Text dimColor>Press q to quit.</Text>
        </Box>
      );
    }
    return (
      <SendWork
        client={client}
        operatorEndpointId={op.endpoint_id}
        onDone={() => setMode({ name: "browse" })}
      />
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {loadError && <Text color="red">{loadError}</Text>}

      <Box flexDirection="column">
        <Text bold>Waiting on you ({pending.length})</Text>
        {pending.length === 0 ? (
          <Text dimColor>Nothing is waiting. Actor questions to the operator will appear here.</Text>
        ) : (
          pending.map((row, i) => {
            const st = answers[row.correlation_id];
            return (
              <Text key={row.correlation_id} color={i === selected ? "cyan" : undefined}>
                {i === selected ? "❯ " : "  "}
                {questionSnippet(row)}
                {st ? <Text dimColor> — {describeAnswer(st)}</Text> : null}
              </Text>
            );
          })
        )}
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Live: {lastActivity ?? "waiting for activity…"}</Text>
      </Box>

      <Text dimColor>
        ↑/↓ select · Enter answer · s send work · q quit
      </Text>
    </Box>
  );
}

function AnswerPanel({
  item,
  answer,
  onSubmit,
  onCancel,
}: {
  item: PendingResponse;
  answer: AnswerState | undefined;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [body, setBody] = useState("");
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Answer</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text>{questionSnippet(item)}</Text>
        <Text dimColor>
          asked by {item.waiting_endpoint_id} · correlation {item.correlation_id}
        </Text>
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
  operatorEndpointId,
  onDone,
}: {
  client: WorkspaceClient;
  operatorEndpointId: string;
  onDone: () => void;
}): JSX.Element {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Endpoint | null>(null);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    client
      .listEndpoints()
      .then((all) => setEndpoints(all.filter((e) => e.bridge_id !== null)))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not list endpoints."));
  }, [client]);

  useInput((_input, key) => {
    if (key.escape) onDone();
    if (target || !endpoints) return;
    if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelected((i) => Math.min(endpoints.length - 1, i + 1));
    if (key.return && endpoints[selected]) setTarget(endpoints[selected]);
  });

  if (error) return <Text color="red">{error}</Text>;
  if (!endpoints) return <Text>Loading actor endpoints…</Text>;
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
        <Text bold>Send work — choose an actor endpoint</Text>
        {endpoints.length === 0 ? (
          <Text dimColor>No delivery endpoints available.</Text>
        ) : (
          endpoints.map((e, i) => (
            <Text key={e.endpoint_id} color={i === selected ? "cyan" : undefined}>
              {i === selected ? "❯ " : "  "}
              {e.endpoint_id}
            </Text>
          ))
        )}
        <Text dimColor>↑/↓ select · Enter choose · Esc cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Send work to {target.endpoint_id}</Text>
      <Box>
        <Text>{"> "}</Text>
        <TextInput
          value={body}
          onChange={setBody}
          onSubmit={async () => {
            if (!body.trim()) return;
            try {
              await client.sendWork({
                sourceEndpointId: operatorEndpointId,
                targetEndpointId: target.endpoint_id,
                body,
              });
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

function questionSnippet(row: PendingResponse): string {
  const candidates = ["prompt", "question", "text", "body", "message"];
  const payload = (row.payload ?? row) as Record<string, unknown>;
  for (const key of candidates) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return truncate(v.trim(), 80);
  }
  // Honest fallback: the question text shape is not fully documented (F-DOC).
  return `request from ${row.waiting_endpoint_id}`;
}

function describeAnswer(state: AnswerState): string {
  switch (state.kind) {
    case "sending":
      return "sending…";
    case "sent-unconfirmed":
      return `sent — not yet confirmed (${Math.round((Date.now() - state.at) / 1000)}s)`;
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
