import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { KDF_PARAMS, deriveWrappingKey } from "./kdf.js";
import { deriveSecretKey } from "./mnemonic.js";

/**
 * At-rest protection for the identity, and the reason the *recovery phrase* is
 * what is stored rather than the derived key.
 *
 * Decision (D-STORE / D-KDF / D-PHRASE-AT-REST): an encrypted secret guarded by
 * a human passphrase, one code path on every OS. The secret sealed here is the
 * BIP-39 recovery phrase, not the secp256k1 key derived from it. That is a
 * deliberate correction: NIP-06 derivation (phrase -> key) is one-way, so a
 * stored key can never reproduce the phrase, which would make the identity
 * un-backable and un-recoverable. Storing the phrase keeps the key exactly as
 * derivable as before (it is re-derived on unlock) while making the phrase
 * retrievable for backup. The phrase and the key are equivalent secrets, so
 * sealing the phrase is no weaker than sealing the key — it is strictly more
 * recoverable.
 *
 * The KDF and its parameters live in ./kdf.ts (D-KDF). The wrapped key encrypts
 * the phrase with AES-256-GCM, whose auth tag makes a wrong passphrase fail
 * loudly rather than yield garbage.
 *
 * A blank passphrase is a supported choice (D-DEVICE-AUTH): the phrase is still
 * encrypted, but with an empty secret, so the device itself is the
 * authentication. That case is marked `protection: "device"` so callers can say
 * plainly that the device is the only thing guarding it — and therefore that the
 * revealed phrase is the only copy that survives this machine.
 */

export interface IdentityFile {
  readonly version: 1;
  /** Public identity, stored in clear so admission status shows without unlock. */
  readonly npub: string;
  readonly created_at: string;
  /**
   * How this machine's copy is guarded (D-DEVICE-AUTH):
   *  - `passphrase`: a human secret wraps the phrase; the console prompts to
   *    unlock and to reveal.
   *  - `device`: the passphrase is blank, so the device itself is the
   *    authentication — anyone with access to this machine is this identity.
   *    The console unlocks and reveals it without prompting. Absent means
   *    `passphrase` (older files).
   */
  readonly protection?: "passphrase" | "device";
  readonly kdf: {
    readonly name: "scrypt";
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly salt: string;
  };
  /** AES-256-GCM over the UTF-8 recovery phrase (never the derived key). */
  readonly cipher: {
    readonly name: "aes-256-gcm";
    readonly iv: string;
    readonly ciphertext: string;
    readonly tag: string;
  };
}

/** Thrown when a passphrase fails to decrypt the stored phrase (GCM auth failure). */
export class IncorrectPassphraseError extends Error {
  constructor() {
    super("That passphrase did not unlock this identity.");
    this.name = "IncorrectPassphraseError";
  }
}

/** Encrypt a recovery phrase under a passphrase, producing the on-disk shape. */
export function encryptRecoveryPhrase(
  phrase: string,
  npub: string,
  passphrase: string,
  protection: "passphrase" | "device" = "passphrase",
): IdentityFile {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = deriveWrappingKey(passphrase, salt, KDF_PARAMS);
  const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(phrase, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  wrappingKey.fill(0);

  return {
    version: 1,
    npub,
    created_at: new Date().toISOString(),
    protection,
    kdf: { name: "scrypt", N: KDF_PARAMS.N, r: KDF_PARAMS.r, p: KDF_PARAMS.p, salt: salt.toString("base64") },
    cipher: {
      name: "aes-256-gcm",
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: tag.toString("base64"),
    },
  };
}

/**
 * Decrypt the stored recovery phrase with a passphrase. This is the single
 * mechanism behind both reveal (settings / first-run backup) and import, and the
 * root of unlock. Throws IncorrectPassphraseError on mismatch.
 */
export function decryptRecoveryPhrase(file: IdentityFile, passphrase: string): string {
  const salt = Buffer.from(file.kdf.salt, "base64");
  const wrappingKey = deriveWrappingKey(passphrase, salt, {
    N: file.kdf.N,
    r: file.kdf.r,
    p: file.kdf.p,
  });
  const decipher = createDecipheriv("aes-256-gcm", wrappingKey, Buffer.from(file.cipher.iv, "base64"));
  decipher.setAuthTag(Buffer.from(file.cipher.tag, "base64"));
  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(file.cipher.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new IncorrectPassphraseError();
  } finally {
    wrappingKey.fill(0);
  }
}

/**
 * Unlock to the derived secret key: decrypt the stored phrase, then derive the
 * key from it (NIP-06). Keeps the session's unlock contract — it still receives
 * a raw 32-byte key — while the phrase remains the thing at rest.
 */
export function decryptSecretKey(file: IdentityFile, passphrase: string): Uint8Array {
  return deriveSecretKey(decryptRecoveryPhrase(file, passphrase));
}
