/**
 * Live identity smoke walk. This is NOT a unit test — it executes the real
 * client-side identity flow end to end and prints what a human would rely on:
 * generate a phrase, derive the key, encrypt it to disk, unlock it, and sign a
 * NIP-42 challenge that the Bus verifier would accept.
 *
 * It writes to a throwaway FLOE_CONSOLE_HOME and cleans up after itself.
 *
 * Run: tsx scripts/identity-smoke.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyEvent } from "nostr-tools/pure";

const scratch = mkdtempSync(join(tmpdir(), "floe-console-smoke-"));
process.env.FLOE_CONSOLE_HOME = scratch;

const { generateRecoveryPhrase, deriveSecretKey, npubOf } = await import("../src/identity/mnemonic.js");
const { encryptSecretKey, decryptSecretKey } = await import("../src/identity/key-store.js");
const { saveIdentityFile, loadIdentityFile, identityExists } = await import("../src/identity/store-fs.js");
const { buildAuthEvent } = await import("../src/identity/auth-event.js");

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

try {
  console.log("\nFLOE-CONSOLE IDENTITY SMOKE WALK");
  console.log("scratch home:", scratch, "\n");

  console.log("S1  generate recovery phrase");
  const phrase = generateRecoveryPhrase();
  line("words", `${phrase.split(" ").length}-word phrase generated (not printed)`);

  console.log("\nS4  derive key + public identity");
  const secretKey = deriveSecretKey(phrase);
  const npub = npubOf(secretKey);
  line("npub", npub);

  console.log("\nS3  encrypt to disk under a passphrase");
  const passphrase = "smoke-test-passphrase";
  saveIdentityFile(encryptSecretKey(secretKey, npub, passphrase));
  line("identityExists()", String(identityExists()));

  console.log("\nS5a unlock from disk");
  const file = loadIdentityFile();
  if (!file) throw new Error("stored identity did not load back");
  const unlocked = decryptSecretKey(file, passphrase);
  line("key round-trips", String(Buffer.from(unlocked).equals(Buffer.from(secretKey))));
  line("npub still matches", String(npubOf(unlocked) === npub));

  console.log("\nS5b sign a Bus-issued challenge (NIP-42)");
  const grant = { relay: "https://bus.floe.local", challenge: "chal_live_smoke" };
  const authEvent = buildAuthEvent(grant, unlocked);
  line("kind", String(authEvent.kind));
  line("challenge tag", authEvent.tags.find((t) => t[0] === "challenge")?.[1] ?? "(missing)");
  line("signature valid", String(verifyEvent(authEvent)));

  const ok =
    identityExists() &&
    Buffer.from(unlocked).equals(Buffer.from(secretKey)) &&
    npubOf(unlocked) === npub &&
    authEvent.kind === 22242 &&
    verifyEvent(authEvent);

  console.log(`\nRESULT: ${ok ? "PASS — client identity half works live" : "FAIL"}\n`);
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
