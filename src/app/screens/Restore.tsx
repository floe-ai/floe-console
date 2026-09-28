import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError, type IdentityClient } from "floe/identity";
import { NewPassphrase } from "../components/NewPassphrase.js";
import { NameInput } from "../components/NameInput.js";
import { messageOf } from "../../identity/identity-link.js";

/**
 * Restore an identity from its recovery phrase, then choose a new passphrase
 * (or blank). Used from first run and from "Forgot passphrase". Floe checks the
 * phrase; on success its state push moves the console on by itself.
 */

type Step =
  | { readonly name: "phrase"; readonly error?: string }
  | { readonly name: "passphrase" }
  | { readonly name: "working" }
  | { readonly name: "display-name" }
  | { readonly name: "other-identity"; readonly floeName: string }
  | { readonly name: "problem"; readonly message: string };

export function Restore({ identity, onCancel }: { identity: IdentityClient; onCancel: () => void }): JSX.Element {
  const [step, setStep] = useState<Step>({ name: "phrase" });
  const [phrase, setPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");

  useInput((_input, key) => {
    if (key.escape && step.name !== "working") onCancel();
    if (key.return && step.name === "problem") setStep({ name: "phrase" });
  });

  async function run(args: { passphrase: string; display_name?: string; replace_existing?: boolean }): Promise<void> {
    setStep({ name: "working" });
    try {
      await identity.restore({ phrase, ...args });
    } catch (error) {
      if (error instanceof IdentityError && error.code === "invalid_phrase") {
        setStep({ name: "phrase", error: error.message });
      } else if (error instanceof IdentityError && error.code === "display_name_required") {
        setStep({ name: "display-name" });
      } else if (error instanceof IdentityError && error.code === "identity_exists") {
        setStep({ name: "other-identity", floeName: floeDisplayName(identity) });
      } else {
        setStep({ name: "problem", message: messageOf(error) });
      }
    }
  }

  switch (step.name) {
    case "phrase":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Restore from your recovery phrase</Text>
          <Text>Type your 12 or 24 words, in order, separated by spaces.</Text>
          <Box>
            <Text>{"> "}</Text>
            <TextInput value={phrase} onChange={setPhrase} onSubmit={() => setStep({ name: "passphrase" })} />
          </Box>
          {step.error && <Text color="red">{step.error}</Text>}
          <Text dimColor>Esc to go back.</Text>
        </Box>
      );
    case "passphrase":
      return (
        <NewPassphrase
          intro="Choose a passphrase for this identity on this machine. It does not have to match any earlier one."
          onDone={(p) => {
            setPassphrase(p);
            void run({ passphrase: p });
          }}
        />
      );
    case "display-name":
      return (
        <NameInput
          intro="Floe does not know a name for this identity yet. Workspaces will show this name."
          onDone={(name) => void run({ passphrase, display_name: name })}
        />
      );
    case "other-identity":
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>This phrase belongs to a different identity</Text>
          <Text>
            Floe on this machine already has an identity{step.floeName ? ` (${step.floeName})` : ""}. This
            phrase restores a different one. Keep the one Floe has, or replace it with the one from this
            phrase? Floe sets the replaced identity aside; nothing is deleted.
          </Text>
          <SelectInput
            items={[
              { label: "Keep the identity Floe has", value: "keep" },
              { label: "Replace it with the identity from this phrase", value: "replace" },
            ]}
            onSelect={(item) => {
              if (item.value === "keep") onCancel();
              else void run({ passphrase, replace_existing: true });
            }}
          />
        </Box>
      );
    case "problem":
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="red">{step.message}</Text>
          <Text dimColor>Enter to try again · Esc to go back</Text>
        </Box>
      );
    case "working":
      return <Text>Restoring your identity…</Text>;
  }
}

function floeDisplayName(identity: IdentityClient): string {
  const state = identity.state;
  return state.kind === "none" ? "" : state.display_name;
}
