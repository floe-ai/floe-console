/**
 * The documented shape of frames on GET /v1/events/stream, per
 * docs/guide/terminal/bus-api.md ("Resumable WebSocket stream") and
 * client-identity-protocol.md ("Learn of work by push"). Every frame carries a
 * `type`. A data frame is `type: "event_submitted"` and carries an opaque
 * `payload`, an `at`, and its own resume `cursor`. A client-executed Actor also
 * receives `type: "delivery_bundle_available"` frames naming a delivery waiting
 * for one of its Endpoints — the only signal it waits on to answer.
 *
 * We treat the stream as a live nudge, not a source of truth: the payload event
 * shape is not fully specified for third-party clients, so what is "waiting on
 * you" comes from the delivery the console then claims, and the stream only
 * tells us when to claim. We expose frames verbatim and interpret little.
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

/**
 * A push telling a client-executed Actor that a delivery is waiting for one of
 * its Endpoints. `payload.delivery` names the `delivery_id` to claim and the
 * `endpoint_id` the work is for. This is the only signal the answer path waits
 * on; there is no polling.
 */
export interface DeliveryAvailable {
  readonly type: "delivery_bundle_available";
  readonly payload: {
    readonly delivery: {
      readonly delivery_id: string;
      readonly endpoint_id: string;
      readonly [key: string]: unknown;
    };
  };
  readonly [key: string]: unknown;
}

/** True for a `delivery_bundle_available` frame carrying a delivery id + endpoint. */
export function isDeliveryAvailable(frame: unknown): frame is DeliveryAvailable {
  if (typeof frame !== "object" || frame === null) return false;
  if ((frame as { type?: unknown }).type !== "delivery_bundle_available") return false;
  const delivery = (frame as { payload?: { delivery?: unknown } }).payload?.delivery as
    | { delivery_id?: unknown; endpoint_id?: unknown }
    | undefined;
  return (
    typeof delivery?.delivery_id === "string" && typeof delivery?.endpoint_id === "string"
  );
}
