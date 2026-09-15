/**
 * The exact shape of one data frame on GET /v1/events/stream, mirroring
 * floe-bus/src/transport-push-stream.ts::TransportPushEntry. Each carries its
 * own resume cursor. Control frames (authenticated / caught_up) are a different
 * shape and are handled separately by the event stream.
 */
export interface StreamEntry {
  readonly cursor: string;
  readonly sequence: number;
  readonly workspace_id: string | null;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly at: string;
}

/** True for a live data frame (has a numeric sequence); false for a control frame. */
export function isStreamEntry(frame: unknown): frame is StreamEntry {
  return (
    typeof frame === "object" &&
    frame !== null &&
    typeof (frame as { sequence?: unknown }).sequence === "number" &&
    typeof (frame as { cursor?: unknown }).cursor === "string" &&
    typeof (frame as { type?: unknown }).type === "string"
  );
}
