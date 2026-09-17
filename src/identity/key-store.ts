import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { KDF_PARAMS, deriveWrappingKey } from "./kdf.js";

/**
 * At-rest protection for the identity secret key.
 *
 * Decision (D-STORE / D-KDF): an encrypted file guarded by a human passphrase,
 * one code path on every OS. This is the only option that keeps the guarantee
 * the whole identity primitive exists for — the private key is never usable by
 * another process merely because it runs as the same OS user. An OS keychain
 * would prove the machine, not the human.
 *
 * The KDF and its parameters live in ./kdf.ts (D-KDF) so they are visible in one
 * place rather than buried here. The wrapped key encrypts the secret with
 * AES-256-GCM, whose auth tag makes a wrong passphrase fail loudly rather than
 * yield garbage.
 *
 * The recovery phrase is the true backup and is never stored here. Losing the
 * passphrase loses only this machine's copy; re-import the phrase to recover.
 */

export interface IdentityFile {
  readonly version: 1;
  /** Public identity, stored in clear so admission status shows without unlock. */
  readonly npub: string;
  readonly created_at: string;
  /**
   * How this machine's copy is guarded (D-DEVICE-AUTH):
   *  - `passphrase`: a human secret wraps the key; the console prompts to unlock.
   *  - `device`: the passphrase is blank, so the device itself is the
   *    authentication — anyone with access to this machine is this identity.
   *    The console unlocks it silently. Absent means `passphrase` (older files).
   */
  readonly protection?: "passphrase" | "device";
  readonly kdf: {
    readonly name: "scrypt";
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly salt: string;
  };
  readonly cipher: {
    readonly name: "aes-256-gcm";
    readonly iv: string;
    readonly ciphertext: string;
    readonly tag: string;
  };
}

/** Thrown when a passphrase fails to decrypt the stored key (GCM auth failure). */
export class IncorrectPassphraseError extends Error {
  constructor() {
    super("That passphrase did not unlock this identity.");
    this.name = "IncorrectPassphraseError";
  }
}

/** Encrypt a raw 32-byte secret key under a passphrase, producing the on-disk shape. */
export function encryptSecretKey(
  secretKey: Uint8Array,
  npub: string,
  passphrase: string,
  protection: "passphrase" | "device" = "passphrase",
): IdentityFile {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = deriveWrappingKey(passphrase, salt, KDF_PARAMS);
  const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(secretKey)), cipher.final()]);
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

/** Decrypt the stored key with a passphrase. Throws IncorrectPassphraseError on mismatch. */
export function decryptSecretKey(file: IdentityFile, passphrase: string): Uint8Array {
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
    return new Uint8Array(plaintext);
  } catch {
    throw new IncorrectPassphraseError();
  } finally {
    wrappingKey.fill(0);
  }
}
