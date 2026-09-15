import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { generateRecoveryPhrase, isValidRecoveryPhrase, phraseWords } from "../../identity/mnemonic.js";
import { provisionIdentity } from "../../identity/provision.js";

/**
 * First run for a human who has never used Floe: they hold no key. This walks
 * generation (or import) of a recovery phrase, the honest seed-loss warning at
 * the moment it matters, a passphrase to encrypt the key at rest, then hands the
 * in-memory key up so the app can authenticate.
 */

type Step =
  | "welcome"
  | "show-phrase"
  | "confirm-warning"
  | "import"
  | "passphrase"
  | "passphrase-confirm"
  | "provisioning";

const CONFIRM_PHRASE = "I understand";

export function FirstRun({
  onProvisioned,
}: {
  onProvisioned: (secretKey: Uint8Array, npub: string) => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");
  const [phrase, setPhrase] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [understand, setUnderstand] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const words = useMemo(() => (phrase ? phraseWords(phrase) : []), [phrase]);

  useInput((_input, key) => {
    if (step === "show-phrase" && key.return) setStep("confirm-warning");
  });

  function provision(finalPhrase: string): void {
    setStep("provisioning");
    try {
      const { secretKey, npub } = provisionIdentity(finalPhrase, passphrase);
      onProvisioned(secretKey, npub);
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : "Could not store the identity.");
    }
  }

  if (step === "welcome") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Welcome to floe-console.</Text>
        <Text>
          Floe proves who you are with a key only you hold. First you need one. This never leaves
          this machine, and the substrate only ever sees its public half.
        </Text>
        <SelectInput
          items={[
            { label: "Generate a new identity", value: "generate" },
            { label: "Import an existing recovery phrase", value: "import" },
          ]}
          onSelect={(item) => {
            if (item.value === "generate") {
              setPhrase(generateRecoveryPhrase());
              setStep("show-phrase");
            } else {
              setStep("import");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "show-phrase") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Your recovery phrase</Text>
        <Text>Write these 12 words down, in order, on paper. This is the only backup that exists.</Text>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          {chunk(words, 4).map((row, i) => (
            <Text key={i}>
              {row
                .map((w, j) => `${String(i * 4 + j + 1).padStart(2, " ")}. ${w}`)
                .join("    ")}
            </Text>
          ))}
        </Box>
        <Text dimColor>Press Enter once you have written them down.</Text>
      </Box>
    );
  }

  if (step === "confirm-warning") {
    const ok = understand.trim() === CONFIRM_PHRASE;
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="yellow">
          Read this before you continue.
        </Text>
        <Text>
          If you lose this phrase, your identity is gone for good. No one — not the operator, not
          Floe — can recover it or reset it. Anything done under this key stays under it. A new
          phrase is a new identity that has to be admitted again from scratch.
        </Text>
        <Text>
          Type <Text bold>{CONFIRM_PHRASE}</Text> to confirm you have saved it and understand this.
        </Text>
        <Box>
          <Text>{"> "}</Text>
          <TextInput
            value={understand}
            onChange={setUnderstand}
            onSubmit={() => ok && setStep("passphrase")}
          />
        </Box>
      </Box>
    );
  }

  if (step === "import") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Import a recovery phrase</Text>
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
        <Text bold>Set a passphrase</Text>
        <Text>
          This passphrase encrypts your key on this machine. You will enter it to unlock the console.
          It is separate from your recovery phrase and is not a backup of it.
        </Text>
        <Box>
          <Text>{first ? "Passphrase:        " : "Confirm passphrase: "}</Text>
          <TextInput
            mask="*"
            value={first ? passphrase : passphrase2}
            onChange={first ? setPassphrase : setPassphrase2}
            onSubmit={() => {
              if (first) {
                if (passphrase.length < 8) {
                  setPassError("Use at least 8 characters.");
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
              provision(phrase);
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
        <Text>Storing your identity…</Text>
      )}
    </Box>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
