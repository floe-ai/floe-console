import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError, type IdentityClient } from "floe/identity";
import { NameInput } from "../components/NameInput.js";
import { NewPassphrase } from "../components/NewPassphrase.js";
import type { Backup } from "../components/Backup.js";
import { messageOf } from "../../identity/identity-link.js";
import { deleteLegacyFile, setAsideLegacyFile, type LegacyFile } from "../../migration/legacy-file.js";

/**
 * An earlier console kept its own identity file. Floe owns the identity now, so
 * the console offers to bring that file into Floe, once. It is never adopted or
 * dropped silently: every outcome is the person's choice and is said on screen.
 * Floe decrypts the file; the console only hands it over.
 */

type ImportArgs = { passphrase: string; display_name?: string; replace_existing?: boolean };

type Step =
  | { readonly name: "offer" }
  | { readonly name: "passphrase"; readonly error?: string }
  | { readonly name: "working" }
  | { readonly name: "display-name"; readonly args: ImportArgs }
  | { readonly name: "other-identity"; readonly args: ImportArgs }
  | { readonly name: "unreadable"; readonly message: string }
  | { readonly name: "no-phrase" }
  | { readonly name: "replace-passphrase" }
  | { readonly name: "done"; readonly message: string };

export function Migrate({
  identity,
  legacy,
  onBackup,
  onDone,
}: {
  identity: IdentityClient;
  legacy: LegacyFile;
  onBackup: (backup: Backup) => void;
  onDone: () => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>({ name: "offer" });
  const [passphrase, setPassphrase] = useState("");
  const floeHasIdentity = identity.state.kind !== "none";
  const floeName = identity.state.kind === "none" ? "" : identity.state.display_name;

  useInput((_input, key) => {
    if (step.name === "passphrase" && key.escape) setAside("You said you do not know its passphrase.");
    if (step.name === "done" && key.return) onDone();
  });

  function setAside(why: string): void {
    try {
      const target = setAsideLegacyFile(legacy);
      setStep({ name: "done", message: `${why} The earlier console's file was set aside as ${target}. Nothing was deleted.` });
    } catch (error) {
      setStep({ name: "unreadable", message: `Could not set the file aside: ${messageOf(error)}` });
    }
  }

  async function bringIn(args: ImportArgs): Promise<void> {
    setStep({ name: "working" });
    try {
      const result = await identity.importLegacy({ file: legacy.contents, ...args });
      deleteLegacyFile(legacy);
      if (result.already_present) {
        setStep({ name: "done", message: "This identity was already in Floe. The earlier console's copy has been removed." });
      } else if (result.secret_kind === "nsec") {
        setStep({ name: "no-phrase" });
      } else {
        setStep({ name: "done", message: "Your identity is now kept by Floe. The earlier console's file has been removed." });
      }
    } catch (error) {
      const code = error instanceof IdentityError ? error.code : "";
      if (code === "wrong_passphrase") setStep({ name: "passphrase", error: "That passphrase did not open the file." });
      else if (code === "display_name_required") setStep({ name: "display-name", args });
      else if (code === "identity_exists") setStep({ name: "other-identity", args });
      else setStep({ name: "unreadable", message: messageOf(error) });
    }
  }

  async function replaceWithPhrase(newPassphrase: string): Promise<void> {
    setStep({ name: "working" });
    try {
      const result = await identity.replace({ passphrase: newPassphrase });
      onBackup({
        kind: "phrase",
        secret: result.phrase,
        note: "Floe made a new identity with a recovery phrase and gave it the same workspaces on this machine. Work done before stays credited to the old identity.",
      });
      onDone();
    } catch (error) {
      setStep({ name: "unreadable", message: messageOf(error) });
    }
  }

  function start(): void {
    if (legacy.protection === "device") void bringIn({ passphrase: "" });
    else setStep({ name: "passphrase" });
  }

  switch (step.name) {
    case "offer":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>You have an identity from an earlier console</Text>
          <Text>
            {floeHasIdentity
              ? `Floe now keeps your identity for every surface, and it already has one on this machine${floeName ? ` (${floeName})` : ""}. The earlier console kept its own.`
              : "Floe now keeps your identity for every surface. The earlier console kept its own. Bring it into Floe, or start fresh."}
          </Text>
          <SelectInput
            items={
              floeHasIdentity
                ? [
                    { label: "Bring the earlier console's identity into Floe", value: "import" },
                    { label: "Keep Floe's identity and set the earlier file aside", value: "aside" },
                  ]
                : [
                    { label: "Bring it into Floe", value: "import" },
                    { label: "Start fresh (the earlier file is set aside, not deleted)", value: "aside" },
                  ]
            }
            onSelect={(item) => (item.value === "import" ? start() : setAside("You chose not to bring it in."))}
          />
        </Box>
      );
    case "passphrase":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>The earlier console&apos;s passphrase</Text>
          <Text>Enter the passphrase you used in the earlier console. Floe opens the file with it.</Text>
          <Box>
            <Text>Passphrase: </Text>
            <TextInput
              mask="*"
              value={passphrase}
              onChange={setPassphrase}
              onSubmit={() => void bringIn({ passphrase })}
            />
          </Box>
          {step.error && <Text color="red">{step.error}</Text>}
          <Text dimColor>Don&apos;t know this passphrase? Press Esc to set the file aside and carry on.</Text>
        </Box>
      );
    case "display-name":
      return (
        <NameInput
          intro="Floe does not know a name for this identity yet. Workspaces will show this name."
          onDone={(name) => void bringIn({ ...step.args, display_name: name })}
        />
      );
    case "other-identity":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Two different identities</Text>
          <Text>
            Floe already has identity A{floeName ? ` (${floeName})` : ""}. The earlier console&apos;s file has a
            different one, B. Keep A, or replace it with B? The one not kept is set aside, never deleted.
          </Text>
          <SelectInput
            items={[
              { label: "Keep A, the identity Floe has", value: "keep" },
              { label: "Replace it with B, the earlier console's identity", value: "replace" },
            ]}
            onSelect={(item) =>
              item.value === "keep"
                ? setAside("You kept Floe's identity.")
                : void bringIn({ ...step.args, replace_existing: true })
            }
          />
        </Box>
      );
    case "unreadable":
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="red">{step.message}</Text>
          <SelectInput
            items={[
              { label: "Try again", value: "retry" },
              { label: "Set the earlier file aside and carry on", value: "aside" },
            ]}
            onSelect={(item) => (item.value === "retry" ? setStep({ name: "offer" }) : setAside("It could not be brought in."))}
          />
        </Box>
      );
    case "no-phrase":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Your identity is now kept by Floe</Text>
          <Text>
            This identity was made before Floe used recovery phrases, so it has no phrase. Its backup is its
            secret key (nsec), which you can reveal in settings. You can keep it, or start a new identity with
            a phrase that keeps the same workspaces on this machine.
          </Text>
          <SelectInput
            items={[
              { label: "Keep it", value: "keep" },
              { label: "Start a new identity with a recovery phrase", value: "replace" },
            ]}
            onSelect={(item) =>
              item.value === "keep"
                ? setStep({ name: "done", message: "Kept. The earlier console's file has been removed." })
                : setStep({ name: "replace-passphrase" })
            }
          />
        </Box>
      );
    case "replace-passphrase":
      return <NewPassphrase onDone={(p) => void replaceWithPhrase(p)} />;
    case "working":
      return <Text>Working…</Text>;
    case "done":
      return (
        <Box flexDirection="column" gap={1}>
          <Text>{step.message}</Text>
          <Text dimColor>Enter to continue.</Text>
        </Box>
      );
  }
}
