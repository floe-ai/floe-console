import { describe, it, expect } from "vitest";
import { encryptSecretKey, decryptSecretKey, IncorrectPassphraseError } from "./key-store.js";
import { deriveSecretKey, generateRecoveryPhrase, npubOf } from "./mnemonic.js";

describe("identity key store", () => {
  it("round-trips a secret key through encrypt/decrypt with the right passphrase", () => {
    const secretKey = deriveSecretKey(generateRecoveryPhrase());
    const npub = npubOf(secretKey);
    const file = encryptSecretKey(secretKey, npub, "correct horse battery staple");
    const recovered = decryptSecretKey(file, "correct horse battery staple");
    expect(Buffer.from(recovered).equals(Buffer.from(secretKey))).toBe(true);
  });

  it("stores the npub in clear and never the plaintext key", () => {
    const secretKey = deriveSecretKey(generateRecoveryPhrase());
    const npub = npubOf(secretKey);
    const file = encryptSecretKey(secretKey, npub, "pass");
    expect(file.npub).toBe(npub);
    const serialized = JSON.stringify(file);
    expect(serialized).not.toContain(Buffer.from(secretKey).toString("hex"));
    expect(serialized).not.toContain(Buffer.from(secretKey).toString("base64"));
  });

  it("fails loudly on a wrong passphrase rather than returning garbage", () => {
    const secretKey = deriveSecretKey(generateRecoveryPhrase());
    const file = encryptSecretKey(secretKey, npubOf(secretKey), "right");
    expect(() => decryptSecretKey(file, "wrong")).toThrow(IncorrectPassphraseError);
  });
});
