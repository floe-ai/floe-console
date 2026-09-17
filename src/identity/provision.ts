import { deriveSecretKey, npubOf } from "./mnemonic.js";
import { encryptRecoveryPhrase, decryptRecoveryPhrase } from "./key-store.js";
import { saveIdentityFile, loadIdentityFile } from "./store-fs.js";

/**
 * Turn a recovery phrase + passphrase into a stored, encrypted identity, and
 * hand back the in-memory key so the caller can authenticate immediately
 * without re-reading or re-decrypting what it just wrote.
 *
 * The recovery phrase is what gets persisted, encrypted (D-PHRASE-AT-REST) — the
 * key is derived from it on demand. This is the single path both first-run
 * generation and import go through, which is also why import and reveal are the
 * same mechanism reversed rather than a second code path.
 *
 * A blank passphrase is a deliberate, supported choice (D-DEVICE-AUTH): the
 * phrase is still encrypted, but with an empty secret, so the device itself is
 * the authentication and the console unlocks it without prompting. The file
 * records that as `protection: "device"` so the console knows not to ask.
 */
export interface ProvisionedIdentity {
  readonly secretKey: Uint8Array;
  readonly npub: string;
}

export function provisionIdentity(phrase: string, passphrase: string): ProvisionedIdentity {
  const secretKey = deriveSecretKey(phrase);
  const npub = npubOf(secretKey);
  const protection = passphrase.length === 0 ? "device" : "passphrase";
  saveIdentityFile(encryptRecoveryPhrase(phrase, npub, passphrase, protection));
  return { secretKey, npub };
}

/**
 * Reveal this machine's recovery phrase — the backup half of the same mechanism
 * import uses. Gated on the passphrase where one exists; a device-protected
 * identity (blank passphrase) reveals with an empty passphrase because the
 * device is the only thing guarding it, which the caller must state plainly.
 *
 * Throws if no identity exists, or IncorrectPassphraseError on a wrong passphrase.
 */
export function revealRecoveryPhrase(passphrase: string): string {
  const file = loadIdentityFile();
  if (!file) throw new Error("There is no identity on this machine to reveal.");
  return decryptRecoveryPhrase(file, passphrase);
}
