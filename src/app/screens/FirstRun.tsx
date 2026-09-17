import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { generateRecoveryPhrase } from "../../identity/mnemonic.js";
import { provisionIdentity } from "../../identity/provision.js";

/**
 * First run for a person who has never used Floe on this machine. Console is not
 * something you configure against Floe — it is what Floe looks like when a
 * person uses it — so this does the least a person must see and no more.
 *
 * The identity is created silently. A recovery phrase is generated under the
 * hood and never shown: the npub is not something to copy or carry, it simply
 * becomes this system's identity when run from this terminal. The only thing we
 * ask for is how the key is guarded at rest.
 *
 * A blank passphrase is a real, stated choice: the device itself becomes the
 * authentication. We say plainly what that means rather than hiding it behind a
 * softer phrase. A non-blank passphrase is confirmed once to catch a typo.
 *
 * There is no admission step here. Registering a workspace folder is the act of
 * joining it (that happens on the next screen), so first run ends by handing the
 * in-memory key up so the app can authenticate and discover it has no workspace
 * yet.
 */

type Step = "welcome" | "passphrase" | "passphrase-confirm" | "provisioning";

const MIN_PASSPHRASE_LENGTH = 8;

export function FirstRun({
  onProvisioned,
}: {
  onProvisioned: (secretKey: Uint8Array, npub: string) => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (step === "welcome" && key.return) setStep("passphrase");
  });

  function provision(finalPassphrase: string): void {
    setStep("provisioning");
    try {
      // The phrase is generated here and never persisted or shown; only the
      // derived key, encrypted, is written. This is the single provisioning path.
      const { secretKey, npub } = provisionIdentity(generateRecoveryPhrase(), finalPassphrase);
      onProvisioned(secretKey, npub);
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : "Could not store the identity.");
    }
  }

  if (step === "welcome") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Welcome to Floe.</Text>
        <Text>
          Floe proves who you are with a key only this machine holds. We will create one now — it
          never leaves this machine, and the substrate only ever sees its public half.
        </Text>
        <Text dimColor>Press Enter to continue.</Text>
      </Box>
    );
  }

  if (step === "passphrase" || step === "passphrase-confirm") {
    const first = step === "passphrase";
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Protect this identity</Text>
        <Text>
          A passphrase encrypts your key on this machine; you will enter it to unlock the console.
        </Text>
        <Text color="yellow">
          Leave it blank and this device is your authentication — anyone with access to this machine
          is this identity.
        </Text>
        <Box>
          <Text>{first ? "Passphrase (blank = device auth): " : "Confirm passphrase:               "}</Text>
          <TextInput
            mask="*"
            value={first ? passphrase : passphrase2}
            onChange={first ? setPassphrase : setPassphrase2}
            onSubmit={() => {
              if (first) {
                if (passphrase.length === 0) {
                  setPassError(null);
                  provision("");
                  return;
                }
                if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
                  setPassError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters, or leave it blank.`);
                  return;
                }
                setPassError(null);
                setStep("passphrase-confirm");
                return;
              }
              if (passphrase2 !== passphrase) {
                setPassError("The passphrases do not match.");
                setPassphrase2("");
                setStep("passphrase");
                return;
              }
              provision(passphrase);
            }}
          />
        </Box>
        {passError && <Text color="red">{passError}</Text>}
      </Box>
    );
  }

  // provisioning
  return (
    <Box flexDirection="column">
      {provisionError ? (
        <Text color="red">{provisionError}</Text>
      ) : (
        <Text>Creating your identity…</Text>
      )}
    </Box>
  );
}
