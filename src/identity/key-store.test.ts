import { describe, it, expect } from "vitest";
import {
  encryptRecoveryPhrase,
  decryptRecoveryPhrase,
  decryptSecretKey,
  IncorrectPassphraseError,
} from "./key-store.js";
import { deriveSecretKey, generateRecoveryPhrase, npubOf } from "./mnemonic.js";

describe("identity key store", () => {
  it("round-trips the recovery phrase through encrypt/decrypt with the right passphrase", () => {
    const phrase = generateRecoveryPhrase();
    const npub = npubOf(deriveSecretKey(phrase));
    const file = encryptRecoveryPhrase(phrase, npub, "correct horse battery staple");
    expect(decryptRecoveryPhrase(file, "correct horse battery staple")).toBe(phrase);
  });

  it("derives the same secret key from the stored phrase on unlock", () => {
    const phrase = generateRecoveryPhrase();
    const secretKey = deriveSecretKey(phrase);
    const file = encryptRecoveryPhrase(phrase, npubOf(secretKey), "pass");
    const unlocked = decryptSecretKey(file, "pass");
    expect(Buffer.from(unlocked).equals(Buffer.from(secretKey))).toBe(true);
  });

  it("stores the npub in clear and never the plaintext phrase or key", () => {
    const phrase = generateRecoveryPhrase();
    const secretKey = deriveSecretKey(phrase);
    const npub = npubOf(secretKey);
    const file = encryptRecoveryPhrase(phrase, npub, "pass");
    expect(file.npub).toBe(npub);
    const serialized = JSON.stringify(file);
    expect(serialized).not.toContain(phrase);
    expect(serialized).not.toContain(Buffer.from(secretKey).toString("hex"));
    expect(serialized).not.toContain(Buffer.from(secretKey).toString("base64"));
  });

  it("records device protection when the passphrase is blank", () => {
    const phrase = generateRecoveryPhrase();
    const npub = npubOf(deriveSecretKey(phrase));
    const withPass = encryptRecoveryPhrase(phrase, npub, "pass", "passphrase");
    const withoutPass = encryptRecoveryPhrase(phrase, npub, "", "device");
    expect(withPass.protection).toBe("passphrase");
    expect(withoutPass.protection).toBe("device");
    // A device-protected phrase still reveals, with an empty passphrase.
    expect(decryptRecoveryPhrase(withoutPass, "")).toBe(phrase);
  });

  it("fails loudly on a wrong passphrase rather than returning garbage", () => {
    const phrase = generateRecoveryPhrase();
    const file = encryptRecoveryPhrase(phrase, npubOf(deriveSecretKey(phrase)), "right");
    expect(() => decryptRecoveryPhrase(file, "wrong")).toThrow(IncorrectPassphraseError);
    expect(() => decryptSecretKey(file, "wrong")).toThrow(IncorrectPassphraseError);
  });
});
