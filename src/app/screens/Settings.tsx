import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { loadIdentityFile } from "../../identity/store-fs.js";
import { revealRecoveryPhrase } from "../../identity/provision.js";
import { IncorrectPassphraseError } from "../../identity/key-store.js";
import { RecoveryPhraseView } from "../components/RecoveryPhrase.js";
import { shortNpub } from "./Unlock.js";

/**
 * Settings, reachable from the main surface. Its one job today is the backup
 * half of identity: reveal this machine's recovery phrase so it can be written
 * down or carried to another machine (where first-run restore imports it).
 * Reveal and import are the same mechanism reversed; import lives at first run
 * because a new machine has no identity to open settings with.
 *
 * Reveal is gated on the passphrase where one exists. Where the identity is
 * device protected (the passphrase was left blank), there is nothing to prompt
 * for, so this says plainly that the device is the only thing protecting it and
 * that the phrase is the only copy that survives this machine.
 */

type Phase =
  | { readonly name: "menu" }
  | { readonly name: "passphrase" }
  | { readonly name: "revealed"; readonly phrase: string };

export function Settings({ npub, onClose }: { npub: string; onClose: () => void }): JSX.Element {
  const protection = useMemo(() => loadIdentityFile()?.protection ?? "passphrase", []);
  const [phase, setPhase] = useState<Phase>({ name: "menu" });
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      if (phase.name === "menu") onClose();
      else {
        setPassphrase("");
        setError(null);
        setPhase({ name: "menu" });
      }
    }
  });

  function reveal(withPassphrase: string): void {
    try {
      setPhase({ name: "revealed", phrase: revealRecoveryPhrase(withPassphrase) });
    } catch (err) {
      setError(
        err instanceof IncorrectPassphraseError
          ? "That passphrase did not unlock this identity."
          : err instanceof Error
            ? err.message
            : "Could not reveal the recovery phrase.",
      );
    }
  }

  const header = (
    <Text>
      <Text bold>Settings</Text> <Text dimColor>· {shortNpub(npub)}</Text>
    </Text>
  );

  if (phase.name === "revealed") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text bold>Your recovery phrase</Text>
        {protection === "device" && (
          <Text color="yellow">
            This identity has no passphrase — the device is the only thing protecting it. This phrase
            is the only copy that survives this machine, so write it down and keep it safe.
          </Text>
        )}
        <Text>Write these words down, in order. This is a backup to keep, not an address to share.</Text>
        <RecoveryPhraseView phrase={phase.phrase} />
        <Text dimColor>Esc to go back.</Text>
      </Box>
    );
  }

  if (phase.name === "passphrase") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text>Enter your passphrase to reveal your recovery phrase.</Text>
        <Box>
          <Text>Passphrase: </Text>
          <TextInput
            mask="*"
            value={passphrase}
            onChange={(v) => {
              setPassphrase(v);
              setError(null);
            }}
            onSubmit={() => reveal(passphrase)}
          />
        </Box>
        {error && <Text color="red">{error}</Text>}
        <Text dimColor>Esc to go back.</Text>
      </Box>
    );
  }

  // menu
  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <SelectInput
        items={[{ label: "Reveal recovery phrase (back up this identity)", value: "reveal" }]}
        onSelect={() => {
          if (protection === "device") reveal("");
          else setPhase({ name: "passphrase" });
        }}
      />
      <Text dimColor>Esc to go back.</Text>
    </Box>
  );
}
