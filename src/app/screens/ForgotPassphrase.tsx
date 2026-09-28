import { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import type { IdentityClient } from "floe/identity";
import { NewPassphrase } from "../components/NewPassphrase.js";
import type { Backup } from "../components/Backup.js";
import { messageOf } from "../../identity/identity-link.js";
import { Restore } from "./Restore.js";

/**
 * "I forgot my passphrase." With the recovery phrase, restore keeps the same
 * identity. Without it, Floe makes a new identity and gives it the old one's
 * workspaces on this machine: re-admission, not recovery, and said so plainly.
 */

type Step = "choose" | "restore" | "replace-warning" | "replace-passphrase" | "replacing";

export function ForgotPassphrase({
  identity,
  onBackup,
  onCancel,
}: {
  identity: IdentityClient;
  onBackup: (backup: Backup) => void;
  onCancel: () => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);

  useInput(
    (_input, key) => {
      if (key.escape) onCancel();
    },
    { isActive: step === "choose" || step === "replace-warning" },
  );

  async function replace(passphrase: string): Promise<void> {
    setStep("replacing");
    try {
      const result = await identity.replace({ passphrase });
      const carried = result.workspaces.length;
      onBackup({
        kind: "phrase",
        secret: result.phrase,
        note: `Floe made a new identity and gave it ${carried === 1 ? "your 1 workspace" : `your ${carried} workspaces`} on this machine.`,
      });
    } catch (err) {
      setError(messageOf(err));
      setStep("choose");
    }
  }

  switch (step) {
    case "choose":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Forgot your passphrase</Text>
          {error && <Text color="red">{error}</Text>}
          <SelectInput
            items={[
              { label: "I have my recovery phrase", value: "restore" },
              { label: "I don't have my recovery phrase", value: "replace" },
              { label: "Go back to unlock", value: "back" },
            ]}
            onSelect={(item) => {
              if (item.value === "back") onCancel();
              else setStep(item.value === "restore" ? "restore" : "replace-warning");
            }}
          />
        </Box>
      );
    case "restore":
      return <Restore identity={identity} onCancel={() => setStep("choose")} />;
    case "replace-warning":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Start a new identity</Text>
          <Text>
            Your old identity cannot be recovered. Floe will create a new one and give it the same
            workspaces on this machine. Work done before stays credited to the old identity.
          </Text>
          <SelectInput
            items={[
              { label: "Create the new identity", value: "go" },
              { label: "Go back", value: "back" },
            ]}
            onSelect={(item) => setStep(item.value === "go" ? "replace-passphrase" : "choose")}
          />
        </Box>
      );
    case "replace-passphrase":
      return <NewPassphrase onDone={(p) => void replace(p)} />;
    case "replacing":
      return <Text>Creating your new identity and carrying your workspaces over…</Text>;
  }
}
