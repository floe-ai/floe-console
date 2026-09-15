import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { privateKeyFromSeedWords } from "nostr-tools/nip06";
import { getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

/**
 * The human-facing half of Floe identity. A recovery phrase (BIP-39) is the
 * only durable backup of an identity; it is shown to the human, confirmed, then
 * used to derive the key (NIP-06). The phrase is NEVER persisted by the console
 * and NEVER sent to the substrate — only the derived key is stored, encrypted.
 */

/** Generate a fresh 12-word BIP-39 recovery phrase (128 bits of entropy). */
export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/** True if the phrase is a well-formed BIP-39 mnemonic with a valid checksum. */
export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normalizePhrase(phrase), wordlist);
}

/** The individual words of a phrase, normalised for display/confirmation. */
export function phraseWords(phrase: string): string[] {
  return normalizePhrase(phrase).split(" ");
}

/**
 * Derive the secp256k1 secret key from a recovery phrase using the NIP-06
 * derivation path (m/44'/1237'/0'/0/0). Returns raw 32 bytes.
 */
export function deriveSecretKey(phrase: string): Uint8Array {
  return privateKeyFromSeedWords(normalizePhrase(phrase));
}

/** Lowercase-hex x-only public key (NIP-01 form). */
export function publicKeyHex(secretKey: Uint8Array): string {
  return getPublicKey(secretKey);
}

/** The stable, shareable public identity (NIP-19 npub) for a secret key. */
export function npubOf(secretKey: Uint8Array): string {
  return nip19.npubEncode(getPublicKey(secretKey));
}

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}
