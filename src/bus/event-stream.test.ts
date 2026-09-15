import { describe, it, expect, afterEach } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import type { AddressInfo } from "node:net";
import { EventStream, type StreamStatus } from "./event-stream.js";
import type { StreamEntry } from "./types.js";

/**
 * Conformance of the client against the documented /v1/events/stream protocol,
 * exercised with a local ws server that replays the exact frame sequence the Bus
 * sends. This proves the client's handshake and resume logic. It is NOT a claim
 * that the client has been validated against a running Bus — that is the live
 * gate and remains open until the substrate auth routes land.
 */

let servers: WebSocketServer[] = [];

afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
});

async function startServer(onConnection: (ws: WsSocket) => void): Promise<string> {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  server.on("connection", onConnection);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `ws://127.0.0.1:${port}`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const now = () => new Date().toISOString();
const entry = (cursor: string, sequence: number, type: string): StreamEntry => ({
  cursor,
  sequence,
  workspace_id: "ws:test",
  type,
  payload: {},
  at: now(),
});

describe("EventStream protocol", () => {
  it("authenticates, replays backlog, reports caught_up, then delivers live entries", async () => {
    let authFrame: Record<string, unknown> | undefined;
    const wsBase = await startServer((ws) => {
      ws.on("message", (raw) => {
        authFrame = JSON.parse(raw.toString());
        ws.send(JSON.stringify({ type: "authenticated", payload: { cursor: "c1" }, at: now() }));
        ws.send(JSON.stringify(entry("c2", 2, "delivery_created")));
        ws.send(JSON.stringify({ type: "caught_up", payload: { cursor: "c2" }, at: now() }));
        ws.send(JSON.stringify(entry("c3", 3, "request")));
      });
    });

    const entries: StreamEntry[] = [];
    const statuses: StreamStatus[] = [];
    let caughtUp: string | null | undefined;
    const stream = new EventStream({
      wsBaseUrl: wsBase,
      bearerToken: "bearer-x",
      workspaceId: "ws:test",
      handlers: {
        onEntry: (e) => entries.push(e),
        onCaughtUp: (c) => {
          caughtUp = c;
        },
        onStatus: (s) => statuses.push(s),
      },
    });
    stream.start();

    await waitFor(() => entries.length >= 2 && caughtUp !== undefined);

    expect(authFrame).toMatchObject({
      type: "authenticate",
      bearer_token: "bearer-x",
      workspace_id: "ws:test",
    });
    expect(entries.map((e) => e.type)).toEqual(["delivery_created", "request"]);
    expect(caughtUp).toBe("c2");
    expect(statuses.some((s) => s.kind === "caught_up")).toBe(true);

    stream.stop();
  });

  it("resumes from the last cursor after a dropped socket", async () => {
    let connectionCount = 0;
    const authFrames: Record<string, unknown>[] = [];
    const wsBase = await startServer((ws) => {
      connectionCount += 1;
      const connection = connectionCount;
      ws.on("message", (raw) => {
        authFrames.push(JSON.parse(raw.toString()));
        ws.send(JSON.stringify({ type: "authenticated", payload: { cursor: "c1" }, at: now() }));
        if (connection === 1) {
          ws.send(JSON.stringify(entry("cX", 5, "turn_started")));
          ws.send(JSON.stringify({ type: "caught_up", payload: { cursor: "cX" }, at: now() }));
          ws.close();
        } else {
          ws.send(JSON.stringify({ type: "caught_up", payload: { cursor: "cX" }, at: now() }));
        }
      });
    });

    const stream = new EventStream({
      wsBaseUrl: wsBase,
      bearerToken: "bearer-x",
      workspaceId: "ws:test",
      maxBackoffMs: 50,
      handlers: { onEntry: () => {}, onCaughtUp: () => {}, onStatus: () => {} },
    });
    stream.start();

    await waitFor(() => authFrames.length >= 2);

    expect(authFrames[0].after_cursor).toBeUndefined();
    expect(authFrames[1].after_cursor).toBe("cX");

    stream.stop();
  });

  it("stops reconnecting when the Bus rejects authentication (4401)", async () => {
    const statuses: StreamStatus[] = [];
    const wsBase = await startServer((ws) => {
      ws.on("message", () => ws.close(4401, "Authentication required"));
    });

    const stream = new EventStream({
      wsBaseUrl: wsBase,
      bearerToken: "bad",
      workspaceId: "ws:test",
      handlers: { onEntry: () => {}, onCaughtUp: () => {}, onStatus: (s) => statuses.push(s) },
    });
    stream.start();

    await waitFor(() => statuses.some((s) => s.kind === "closed"));
    expect(statuses.filter((s) => s.kind === "reconnecting")).toHaveLength(0);
    const closed = statuses.find((s) => s.kind === "closed");
    expect(closed?.kind === "closed" && closed.reason).toContain("4401");

    stream.stop();
  });
});
