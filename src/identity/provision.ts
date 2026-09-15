import { deriveSecretKey, npubOf } from "./mnemonic.js";
import { encryptSecretKey } from "./key-store.js";
import { saveIdentityFile } from "./store-fs.js";

/**
 * Turn a recovery phrase + passphrase into a stored, encrypted identity, and
 * hand back the in-memory key so the caller can authenticate immediately
 * without re-reading or re-decrypting what it just wrote.
 *
 * The phrase is never persisted — only the derived secret, encrypted. This is
 * the single path both first-run generation and import go through.
 */
export interface ProvisionedIdentity {
  readonly secretKey: Uint8Array;
  readonly npub: string;
}

export function provisionIdentity(phrase: string, passphrase: string): ProvisionedIdentity {
  const secretKey = deriveSecretKey(phrase);
  const npub = npubOf(secretKey);
  saveIdentityFile(encryptSecretKey(secretKey, npub, passphrase));
  return { secretKey, npub };
}
