/**
 * The documented shape of frames on GET /v1/events/stream, per
 * docs/guide/terminal/bus-api.md ("Resumable WebSocket stream"). Every frame
 * carries a `type`; a data frame is `type: "event_submitted"` and carries an
 * opaque `payload`, an `at`, and its own resume `cursor`.
 *
 * We treat the stream as a live nudge, not a source of truth: the payload event
 * shape is not fully specified for third-party clients, so what is "waiting on
 * you" comes from the documented /v1/pending-responses projection, and the
 * stream only tells us when to refresh. We therefore expose the frame verbatim
 * and interpret as little of `payload` as possible.
 */
export interface StreamEntry {
  readonly type: "event_submitted";
  readonly payload: Record<string, unknown>;
  readonly at: string;
  readonly cursor: string;
}

/** True for a live/replay data frame (`type: "event_submitted"` with a cursor). */
export function isStreamEntry(frame: unknown): frame is StreamEntry {
  return (
    typeof frame === "object" &&
    frame !== null &&
    (frame as { type?: unknown }).type === "event_submitted" &&
    typeof (frame as { cursor?: unknown }).cursor === "string"
  );
}
