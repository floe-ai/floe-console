export function isPushFrame(frame) {
    if (typeof frame !== "object" || frame === null)
        return false;
    const f = frame;
    return (typeof f.type === "string" &&
        typeof f.cursor === "string" &&
        typeof f.payload === "object" &&
        f.payload !== null);
}
/** True for a live/replay data frame (`type: "event_submitted"` with a cursor). */
export function isStreamEntry(frame) {
    return (typeof frame === "object" &&
        frame !== null &&
        frame.type === "event_submitted" &&
        typeof frame.cursor === "string");
}
/** True for a `delivery_bundle_available` frame carrying a delivery id + endpoint. */
export function isDeliveryAvailable(frame) {
    if (typeof frame !== "object" || frame === null)
        return false;
    if (frame.type !== "delivery_bundle_available")
        return false;
    const delivery = frame.payload?.delivery;
    return (typeof delivery?.delivery_id === "string" && typeof delivery?.endpoint_id === "string");
}
