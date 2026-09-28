import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { IdentityError, type IdentityClient } from "floe/identity";
import type { Backup } from "../components/Backup.js";
import { messageOf } from "../../identity/identity-link.js";
import { ForgotPassphrase } from "./ForgotPassphrase.js";

/**
 * A passphrase identity that Floe has locked. Only ever shown for
 * `protection: "passphrase"`; a device identity unlocks by itself. The way out,
 * "Forgot passphrase", is always on screen, so this can never be a trap.
 */
export function Unlock({
  identity,
  onBackup,
}: {
  identity: IdentityClient;
  onBackup: (backup: Backup) => void;
}): JSX.Element {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  useInput(
    (_input, key) => {
      if (key.escape && !busy) setForgot(true);
    },
    { isActive: !forgot },
  );

  if (forgot) {
    return <ForgotPassphrase identity={identity} onBackup={onBackup} onCancel={() => setForgot(false)} />;
  }

  const name = identity.state.kind === "none" ? "" : identity.state.display_name;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Unlock your identity{name ? ` (${name})` : ""}</Text>
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
              await identity.unlock(passphrase);
            } catch (err) {
              setError(
                err instanceof IdentityError && err.code === "wrong_passphrase"
                  ? "That passphrase did not unlock this identity."
                  : messageOf(err),
              );
              setPassphrase("");
              setBusy(false);
            }
          }}
        />
      </Box>
      {error && <Text color="red">{error}</Text>}
      <Text dimColor>Forgot your passphrase? Press Esc.</Text>
    </Box>
  );
}
