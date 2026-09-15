import { finalizeEvent, type Event as NostrEvent } from "nostr-tools/pure";

/**
 * Build the NIP-42 authentication event the substrate verifies.
 *
 * The exact rules this must satisfy are defined by the Bus, not by us:
 * floe-bus/src/client-identity-auth.ts::verifyAuthEvent — kind 22242, a
 * `challenge` tag echoing the issued challenge, a `relay` tag echoing the issued
 * relay string, a created_at within ±600s, and a valid BIP-340 Schnorr
 * signature. The Bus carries this same event over HTTP rather than the relay
 * WebSocket (ADR-0015). We sign with the in-memory secret key only; no key
 * material leaves the machine.
 */

export const NIP42_AUTH_KIND = 22242;

export interface ChallengeGrant {
  /** The relay string the Bus issued; echoed verbatim in the `relay` tag. */
  readonly relay: string;
  /** The one-time challenge the Bus issued; echoed verbatim in the `challenge` tag. */
  readonly challenge: string;
}

/** Produce a signed kind-22242 event proving control of the secret key. */
export function buildAuthEvent(grant: ChallengeGrant, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(
    {
      kind: NIP42_AUTH_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["relay", grant.relay],
        ["challenge", grant.challenge],
      ],
      content: "",
    },
    secretKey,
  );
}
