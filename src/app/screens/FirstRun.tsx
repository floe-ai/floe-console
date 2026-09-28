import { useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { IdentityClient } from "floe/identity";
import { NameInput } from "../components/NameInput.js";
import { NewPassphrase } from "../components/NewPassphrase.js";
import type { Backup } from "../components/Backup.js";
import { messageOf } from "../../identity/identity-link.js";
import { Restore } from "./Restore.js";

/**
 * Floe has no identity on this machine yet. Create one (a name and a
 * passphrase, or blank), or restore one from its recovery phrase. Floe makes
 * and keeps the key; the console only shows the phrase once, for backup.
 */

type Step = "welcome" | "name" | "passphrase" | "creating" | "restore";

export function FirstRun({
  identity,
  onBackup,
}: {
  identity: IdentityClient;
  onBackup: (backup: Backup) => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(passphrase: string): Promise<void> {
    setStep("creating");
    try {
      const { phrase } = await identity.create({ display_name: name, passphrase });
      onBackup({ kind: "phrase", secret: phrase });
    } catch (err) {
      setError(messageOf(err));
      setStep("welcome");
    }
  }

  switch (step) {
    case "welcome":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Welcome to Floe.</Text>
          <Text>Floe keeps one identity for you on this machine. Every Floe surface uses it.</Text>
          {error && <Text color="red">{error}</Text>}
          <SelectInput
            items={[
              { label: "Create a new identity", value: "create" },
              { label: "Restore from a recovery phrase", value: "restore" },
            ]}
            onSelect={(item) => setStep(item.value === "create" ? "name" : "restore")}
          />
        </Box>
      );
    case "name":
      return (
        <NameInput
          intro="This is the name workspaces show for you."
          onDone={(n) => {
            setName(n);
            setStep("passphrase");
          }}
        />
      );
    case "passphrase":
      return <NewPassphrase onDone={(p) => void create(p)} />;
    case "creating":
      return <Text>Creating your identity…</Text>;
    case "restore":
      return <Restore identity={identity} onCancel={() => setStep("welcome")} />;
  }
}
