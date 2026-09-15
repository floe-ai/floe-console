import { describe, it, expect } from "vitest";
import { verifyEvent } from "nostr-tools/pure";
import { buildAuthEvent, NIP42_AUTH_KIND } from "./auth-event.js";
import { deriveSecretKey, generateRecoveryPhrase, publicKeyHex } from "./mnemonic.js";

/**
 * These assertions reproduce the Bus verifier's contract
 * (floe-bus/src/client-identity-auth.ts::verifyAuthEvent) so the client half is
 * proven against the exact rules the substrate will enforce, without importing
 * across repos.
 */
const AUTH_EVENT_MAX_SKEW_SECONDS = 600;

function tagValue(tags: readonly string[][], name: string): string | null {
  for (const tag of tags) if (tag.length >= 2 && tag[0] === name) return tag[1];
  return null;
}

describe("NIP-42 auth event", () => {
  const secretKey = deriveSecretKey(generateRecoveryPhrase());
  const grant = { relay: "https://bus.floe.local", challenge: "chal_abc123" };

  it("produces an event that satisfies the verifier contract", () => {
    const event = buildAuthEvent(grant, secretKey);
    expect(event.kind).toBe(NIP42_AUTH_KIND);
    expect(tagValue(event.tags, "challenge")).toBe(grant.challenge);
    expect(tagValue(event.tags, "relay")).toBe(grant.relay);

    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(Math.abs(nowSeconds - event.created_at)).toBeLessThanOrEqual(AUTH_EVENT_MAX_SKEW_SECONDS);

    expect(event.pubkey).toBe(publicKeyHex(secretKey));
    expect(verifyEvent(event)).toBe(true);
  });

  it("binds the signature to this exact challenge (a swapped challenge would be rejected)", () => {
    const event = buildAuthEvent(grant, secretKey);
    // JSON round-trip drops nostr-tools' cached-verification symbol so the
    // tampered copy is verified afresh rather than from the original's cache.
    const forged = JSON.parse(JSON.stringify(event)) as typeof event;
    forged.tags = [["relay", grant.relay], ["challenge", "different"]];
    // Signature covers the tags, so mutating the challenge invalidates the event.
    expect(verifyEvent(forged)).toBe(false);
  });
});
