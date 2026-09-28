import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { KDF_PARAMS, deriveWrappingKey } from "./kdf.js";
import { deriveSecretKey } from "./mnemonic.js";
/** Thrown when a passphrase fails to decrypt the stored phrase (GCM auth failure). */
export class IncorrectPassphraseError extends Error {
    constructor() {
        super("That passphrase did not unlock this identity.");
        this.name = "IncorrectPassphraseError";
    }
}
/** Encrypt a recovery phrase under a passphrase, producing the on-disk shape. */
export function encryptRecoveryPhrase(phrase, npub, passphrase, protection = "passphrase") {
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
export function decryptRecoveryPhrase(file, passphrase) {
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
    }
    catch {
        throw new IncorrectPassphraseError();
    }
    finally {
        wrappingKey.fill(0);
    }
}
/**
 * Unlock to the derived secret key: decrypt the stored phrase, then derive the
 * key from it (NIP-06). Keeps the session's unlock contract — it still receives
 * a raw 32-byte key — while the phrase remains the thing at rest.
 */
export function decryptSecretKey(file, passphrase) {
    return deriveSecretKey(decryptRecoveryPhrase(file, passphrase));
}
