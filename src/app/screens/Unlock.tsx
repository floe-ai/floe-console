import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { IncorrectPassphraseError } from "../../identity/key-store.js";

/**
 * The key exists on this machine but is locked. Ask for the passphrase, decrypt
 * in memory, and authenticate. A wrong passphrase is shown against the field —
 * it is a local decryption failure, not a substrate error.
 */
export function Unlock({
  npub,
  onUnlock,
}: {
  npub: string;
  onUnlock: (passphrase: string) => Promise<void>;
}): JSX.Element {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Unlock your identity</Text>
      <Text dimColor>{shortNpub(npub)}</Text>
      <Box>
        <Text>Passphrase: </Text>
        <TextInput
          mask="*"
          value={passphrase}
          onChange={(v) => {
            setPassphrase(v);
            setError(null);
          }}
          onSubmit={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await onUnlock(passphrase);
            } catch (err) {
              setError(
                err instanceof IncorrectPassphraseError
                  ? "That passphrase did not unlock this identity."
                  : err instanceof Error
                    ? err.message
                    : "Unlock failed.",
              );
              setPassphrase("");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Box>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

export function shortNpub(npub: string): string {
  return npub.length > 20 ? `${npub.slice(0, 12)}…${npub.slice(-6)}` : npub;
}
