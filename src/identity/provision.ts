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
 *
 * A blank passphrase is a deliberate, supported choice (D-DEVICE-AUTH): the key
 * is still encrypted, but with an empty secret, so the device itself is the
 * authentication and the console unlocks it without prompting. The file records
 * that as `protection: "device"` so the console knows not to ask.
 */
export interface ProvisionedIdentity {
  readonly secretKey: Uint8Array;
  readonly npub: string;
}

export function provisionIdentity(phrase: string, passphrase: string): ProvisionedIdentity {
  const secretKey = deriveSecretKey(phrase);
  const npub = npubOf(secretKey);
  const protection = passphrase.length === 0 ? "device" : "passphrase";
  saveIdentityFile(encryptSecretKey(secretKey, npub, passphrase, protection));
  return { secretKey, npub };
}
