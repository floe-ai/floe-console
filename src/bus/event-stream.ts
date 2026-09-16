import WebSocket from "ws";
import { isStreamEntry, isDeliveryAvailable, type StreamEntry, type DeliveryAvailable } from "./types.js";

/**
 * The live event stream over GET /v1/events/stream.
 *
 * Protocol (docs/guide/terminal/bus-api.md, "Resumable WebSocket stream"): the
 * client sends one `authenticate` frame first; the Bus replies `authenticated`,
 * replays backlog as `event_submitted` frames, then sends `caught_up`; live
 * `event_submitted` frames follow. There is no `hello` — a harness that waited
 * for one was wrong for months. Invalid auth closes 4401; an invalid cursor
 * closes 4400.
 *
 * This is push, not poll. The only timer here is reconnect backoff after a
 * dropped socket — recovering a broken transport, never asking the substrate
 * for state on a schedule.
 */

export type StreamStatus =
  | { readonly kind: "connecting" }
  | { readonly kind: "authenticating" }
  | { readonly kind: "replaying" }
  | { readonly kind: "caught_up"; readonly cursor: string | null }
  | { readonly kind: "reconnecting"; readonly attempt: number; readonly retryInMs: number }
  | { readonly kind: "closed"; readonly reason: string };

export interface EventStreamHandlers {
  onEntry(entry: StreamEntry): void;
  onCaughtUp(cursor: string | null): void;
  onStatus(status: StreamStatus): void;
  /**
   * A delivery is waiting for a client-executed Endpoint. Optional: only the
   * answer path (a client executing an Actor) reacts to this; a plain reader
   * does not. This is the push that replaces polling for work.
   */
  onDeliveryAvailable?(frame: DeliveryAvailable): void;
}

/** Minimal socket surface, so tests can drive the client without a real network. */
export interface MinimalSocket {
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: (code: number, reason: unknown) => void): void;
  on(event: "error", listener: (err: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

export interface EventStreamOptions {
  readonly wsBaseUrl: string;
  readonly bearerToken: string;
  readonly workspaceId: string;
  readonly handlers: EventStreamHandlers;
  /** Start from live only (skip backlog) instead of replaying from a cursor. */
  readonly startAtCurrent?: boolean;
  readonly createSocket?: (url: string) => MinimalSocket;
  readonly now?: () => number;
  readonly maxBackoffMs?: number;
}

const DEFAULT_MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;

export class EventStream {
  private socket: MinimalSocket | null = null;
  private lastCursor: string | null = null;
  private attempt = 0;
  private stopped = false;
  private hasConnectedOnce = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: EventStreamOptions) {}

  /** Open the stream and keep it open, reconnecting on transport failures. */
  start(): void {
    this.stopped = false;
    this.connect();
  }

  /** Close the stream permanently. */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.emit({ kind: "closed", reason: "stopped by client" });
  }

  private connect(): void {
    this.emit({ kind: "connecting" });
    const url = `${this.options.wsBaseUrl.replace(/\/$/, "")}/v1/events/stream`;
    const factory = this.options.createSocket ?? ((u: string) => new WebSocket(u) as unknown as MinimalSocket);
    const socket = factory(url);
    this.socket = socket;

    socket.on("open", () => {
      this.emit({ kind: "authenticating" });
      socket.send(JSON.stringify(this.authenticateFrame()));
    });
    socket.on("message", (data) => this.onMessage(data));
    socket.on("close", (code, reason) => this.onClose(code, reason));
    socket.on("error", () => {
      // A socket error is followed by a close; recovery happens there.
    });
  }

  private authenticateFrame(): Record<string, unknown> {
    const frame: Record<string, unknown> = {
      type: "authenticate",
      bearer_token: this.options.bearerToken,
      workspace_id: this.options.workspaceId,
    };
    // On the first connection, honour startAtCurrent; on any reconnect always
    // resume from the last cursor we saw so nothing is missed or duplicated.
    if (this.lastCursor) {
      frame.after_cursor = this.lastCursor;
    } else if (this.options.startAtCurrent && !this.hasConnectedOnce) {
      frame.start_at = "current";
    }
    return frame;
  }

  private onMessage(data: unknown): void {
    let frame: unknown;
    try {
      frame = JSON.parse(typeof data === "string" ? data : String(data));
    } catch {
      return;
    }

    if (isStreamEntry(frame)) {
      this.lastCursor = frame.cursor;
      this.options.handlers.onEntry(frame);
      return;
    }

    if (isDeliveryAvailable(frame)) {
      this.options.handlers.onDeliveryAvailable?.(frame);
      return;
    }

    const control = frame as { type?: string; payload?: { cursor?: string | null } };
    switch (control.type) {
      case "authenticated":
        this.hasConnectedOnce = true;
        this.attempt = 0;
        if (typeof control.payload?.cursor === "string") this.lastCursor = control.payload.cursor;
        this.emit({ kind: "replaying" });
        return;
      case "caught_up": {
        const cursor = control.payload?.cursor ?? this.lastCursor;
        if (typeof cursor === "string") this.lastCursor = cursor;
        this.options.handlers.onCaughtUp(cursor ?? null);
        this.emit({ kind: "caught_up", cursor: cursor ?? null });
        return;
      }
      default:
        // Any unknown control frame is ignored; this client is a
        // workspace_operation reader and never acknowledges cursors.
        return;
    }
  }

  private onClose(code: number, reason: unknown): void {
    this.socket = null;
    if (this.stopped) return;

    // 4401 is an authentication/authority rejection (bus-api.md): reconnecting
    // with the same bearer will not help, so surface it rather than loop.
    if (code === 4401) {
      this.emit({ kind: "closed", reason: `authentication rejected (${code})` });
      return;
    }

    // 4400 is an invalid cursor (bus-api.md): the resume point is bad, so drop
    // it and reconnect from a fresh position rather than looping on it.
    if (code === 4400) {
      this.lastCursor = null;
    }

    this.attempt += 1;
    const retryInMs = Math.min(
      this.options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * 2 ** (this.attempt - 1),
    );
    this.emit({ kind: "reconnecting", attempt: this.attempt, retryInMs });
    void reason;
    this.reconnectTimer = setTimeout(() => this.connect(), retryInMs);
  }

  private emit(status: StreamStatus): void {
    this.options.handlers.onStatus(status);
  }
}
