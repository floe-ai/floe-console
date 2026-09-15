import { describe, it, expect } from "vitest";
import {
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  phraseWords,
  deriveSecretKey,
  npubOf,
} from "./mnemonic.js";

describe("recovery phrase", () => {
  it("generates a valid 12-word phrase", () => {
    const phrase = generateRecoveryPhrase();
    expect(phraseWords(phrase)).toHaveLength(12);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
  });

  it("rejects a tampered phrase (bad checksum)", () => {
    const words = phraseWords(generateRecoveryPhrase());
    words[0] = words[0] === "zoo" ? "zone" : "zoo";
    expect(isValidRecoveryPhrase(words.join(" "))).toBe(false);
  });

  it("derives the same npub from the same phrase (re-import is stable)", () => {
    const phrase = generateRecoveryPhrase();
    const a = npubOf(deriveSecretKey(phrase));
    const b = npubOf(deriveSecretKey(`  ${phrase.toUpperCase()}  `));
    expect(a).toBe(b);
    expect(a.startsWith("npub1")).toBe(true);
  });

  it("derives the documented NIP-06 vector (locks interop with the Bus's nostr-tools)", () => {
    // Vector mnemonic from NIP-06, asserted against nostr-tools' own output —
    // the Bus verifies with the same library, so this pins cross-process
    // agreement and catches any accidental change to our derivation.
    const phrase =
      "leader monkey parrot ring guide accident before fringe cannon center pulse excite vital agree unusual violin post side entry evil gain warm fatigue verb";
    expect(npubOf(deriveSecretKey(phrase))).toBe(
      "npub18x0xfpk3fhm5wurrd5y95ur452rsyl8pydp8my4lxp98xjdfrq8qn4j82c",
    );
  });
});
