import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { generateRecoveryPhrase, isValidRecoveryPhrase } from "../../identity/mnemonic.js";
import { provisionIdentity } from "../../identity/provision.js";
import { RecoveryPhraseView } from "../components/RecoveryPhrase.js";

/**
 * First run for a person on a machine that holds no identity yet. Console is
 * what Floe looks like when a person uses it, so this does the least a person
 * must see and no more — with one deliberate exception.
 *
 * Two ways in:
 *  - Create a new identity. It is created silently (no npub shown as something
 *    to copy). But an identity that cannot be backed up is unrecoverable, so
 *    after it is created the person is shown their recovery phrase exactly once
 *    and confirms they have written it down before moving on. This is the one
 *    moment in first run where something must be carried off the machine, and it
 *    is worth the friction. What they see is a backup to keep, not an address.
 *  - Restore from a recovery phrase. This is how an existing identity comes onto
 *    a new machine and reaches the workspaces it is already admitted to. They
 *    already hold the phrase, so it is not shown again.
 *
 * A blank passphrase is a real, stated choice: the device itself becomes the
 * authentication. There is no admission step here — registering a workspace
 * folder is the act of joining it, on the next screen.
 */

type Step = "welcome" | "import" | "passphrase" | "passphrase-confirm" | "provisioning" | "show-phrase";
type Mode = "create" | "restore";

const MIN_PASSPHRASE_LENGTH = 8;

export function FirstRun({
  onProvisioned,
}: {
  onProvisioned: (secretKey: Uint8Array, npub: string) => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<Mode>("create");
  const [phrase, setPhrase] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<{ secretKey: Uint8Array; npub: string } | null>(null);

  function provision(finalPhrase: string, finalPassphrase: string): void {
    setStep("provisioning");
    try {
      const { secretKey, npub } = provisionIdentity(finalPhrase, finalPassphrase);
      if (mode === "create") {
        // Hold the key back until the person confirms they have the phrase; the
        // identity is on disk, but we do not leave first run until backup is done.
        setProvisioned({ secretKey, npub });
        setStep("show-phrase");
      } else {
        onProvisioned(secretKey, npub);
      }
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : "Could not store the identity.");
    }
  }

  if (step === "welcome") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Welcome to Floe.</Text>
        <Text>
          Floe proves who you are with a key only this machine holds. It never leaves this machine,
          and the substrate only ever sees its public half.
        </Text>
        <SelectInput
          items={[
            { label: "Create a new identity", value: "create" },
            { label: "Restore from a recovery phrase", value: "restore" },
          ]}
          onSelect={(item) => {
            if (item.value === "create") {
              setMode("create");
              setPhrase(generateRecoveryPhrase());
              setStep("passphrase");
            } else {
              setMode("restore");
              setStep("import");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "import") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Restore from a recovery phrase</Text>
        <Text>Type or paste your 12 or 24 word phrase, separated by spaces.</Text>
        <Box>
          <Text>{"> "}</Text>
          <TextInput
            value={importText}
            onChange={(v) => {
              setImportText(v);
              setImportError(null);
            }}
            onSubmit={() => {
              if (!isValidRecoveryPhrase(importText)) {
                setImportError("That is not a valid recovery phrase (check spelling and word order).");
                return;
              }
              setPhrase(importText);
              setStep("passphrase");
            }}
          />
        </Box>
        {importError && <Text color="red">{importError}</Text>}
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
                  provision(phrase, "");
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
              provision(phrase, passphrase);
            }}
          />
        </Box>
        {passError && <Text color="red">{passError}</Text>}
      </Box>
    );
  }

  if (step === "show-phrase") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Write down your recovery phrase</Text>
        <Text>
          These words are the only backup of this identity. Write them down, in order, on paper and
          keep them somewhere safe. No one — not the operator, not Floe — can recover them for you.
          You can see them again later in settings.
        </Text>
        <RecoveryPhraseView phrase={phrase} />
        <SelectInput
          items={[{ label: "I have written it down and stored it safely", value: "done" }]}
          onSelect={() => {
            if (provisioned) onProvisioned(provisioned.secretKey, provisioned.npub);
          }}
        />
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
