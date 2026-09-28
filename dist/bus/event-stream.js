import WebSocket from "ws";
import { isStreamEntry, isDeliveryAvailable } from "./types.js";
const DEFAULT_MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;
export class EventStream {
    options;
    socket = null;
    lastCursor = null;
    attempt = 0;
    stopped = false;
    hasConnectedOnce = false;
    reconnectTimer;
    constructor(options) {
        this.options = options;
    }
    /** Open the stream and keep it open, reconnecting on transport failures. */
    start() {
        this.stopped = false;
        this.connect();
    }
    /** Close the stream permanently. */
    stop() {
        this.stopped = true;
        clearTimeout(this.reconnectTimer);
        this.socket?.close();
        this.socket = null;
        this.emit({ kind: "closed", reason: "stopped by client" });
    }
    connect() {
        this.emit({ kind: "connecting" });
        const url = `${this.options.wsBaseUrl.replace(/\/$/, "")}/v1/events/stream`;
        const factory = this.options.createSocket ?? ((u) => new WebSocket(u));
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
    authenticateFrame() {
        const frame = {
            type: "authenticate",
            bearer_token: this.options.bearerToken,
            workspace_id: this.options.workspaceId,
        };
        // On the first connection, honour startAtCurrent; on any reconnect always
        // resume from the last cursor we saw so nothing is missed or duplicated.
        if (this.lastCursor) {
            frame.after_cursor = this.lastCursor;
        }
        else if (this.options.startAtCurrent && !this.hasConnectedOnce) {
            frame.start_at = "current";
        }
        return frame;
    }
    onMessage(data) {
        let frame;
        try {
            frame = JSON.parse(typeof data === "string" ? data : String(data));
        }
        catch {
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
        const control = frame;
        switch (control.type) {
            case "authenticated":
                this.hasConnectedOnce = true;
                this.attempt = 0;
                if (typeof control.payload?.cursor === "string")
                    this.lastCursor = control.payload.cursor;
                this.emit({ kind: "replaying" });
                return;
            case "caught_up": {
                const cursor = control.payload?.cursor ?? this.lastCursor;
                if (typeof cursor === "string")
                    this.lastCursor = cursor;
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
    onClose(code, reason) {
        this.socket = null;
        if (this.stopped)
            return;
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
        const retryInMs = Math.min(this.options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (this.attempt - 1));
        this.emit({ kind: "reconnecting", attempt: this.attempt, retryInMs });
        void reason;
        this.reconnectTimer = setTimeout(() => this.connect(), retryInMs);
    }
    emit(status) {
        this.options.handlers.onStatus(status);
    }
}
