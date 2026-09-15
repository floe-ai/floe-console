import { useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { shortNpub } from "./Unlock.js";

/**
 * The key is held but not yet admitted (or was revoked). Admission is a human
 * action the operator takes out of band with `floe identity add`. There is no
 * push before first auth and this project does not ship a polling loop (C1), so
 * the honest mechanism is a human-triggered re-check: the operator admits the
 * npub, then the human presses "c".
 */
export function AdmissionWait({
  npub,
  message,
  onCheckNow,
}: {
  npub: string;
  message: string;
  onCheckNow: () => Promise<void>;
}): JSX.Element {
  const [busy, setBusy] = useState(false);

  useInput(async (input) => {
    if (busy) return;
    if (input === "c" || input === "C") {
      setBusy(true);
      try {
        await onCheckNow();
      } finally {
        setBusy(false);
      }
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Waiting to be admitted</Text>
      <Text>{message}</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text>Give the operator your public identity (npub):</Text>
        <Text bold color="cyan">
          {npub}
        </Text>
      </Box>
      <Text dimColor>They run: floe identity add --name "&lt;you&gt;" --pubkey {shortNpub(npub)}</Text>
      {busy ? (
        <Text>
          <Spinner type="dots" /> Checking…
        </Text>
      ) : (
        <Text>
          Press <Text bold>c</Text> to check now, once they tell you it is done.
        </Text>
      )}
    </Box>
  );
}
