import { useState } from "react";
import { basename } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { JoinOutcome } from "floe/identity";
import { FolderPicker } from "../components/FolderPicker.js";

/**
 * The identity is in no workspace yet. Registering a folder on this machine is
 * the act of joining it, so there is no admission screen. The person picks a
 * folder and names the workspace; Floe's identity agent registers it under the
 * identity's own name and, once it is joined, pushes this console a bearer by
 * itself, which moves the console on.
 *
 * The folder list comes from the shared FolderPicker, which reads local disk.
 *
 * Outcomes are shown honestly and never collapsed: `ready` waits for the pushed
 * bearer, `pending` says plainly that the bridge has not finished setting the
 * folder up (usually because it is not running yet) without implying anything
 * went wrong, and `failed` shows the real reason.
 */

type Phase =
  | { readonly name: "pick" }
  | { readonly name: "details" }
  | { readonly name: "submitting" }
  | { readonly name: "pending" }
  | { readonly name: "problem"; readonly message: string };

export function RegisterWorkspace({
  onJoin,
  onHold,
}: {
  onJoin: (input: { locator: string; name?: string }) => Promise<JoinOutcome>;
  /** True while the pending notice must stay on screen after the bearer arrives. */
  onHold: (holding: boolean) => void;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ name: "pick" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");

  useInput((_input, key) => {
    if (phase.name === "details" && key.escape) {
      setPhase({ name: "pick" });
    } else if (phase.name === "pending" && key.return) {
      onHold(false);
    } else if (phase.name === "problem" && key.return) {
      setPhase({ name: "pick" });
    }
  });

  async function submit(): Promise<void> {
    if (!chosen) return;
    setPhase({ name: "submitting" });
    try {
      const outcome = await onJoin({ locator: chosen, name: workspaceName.trim() || undefined });
      switch (outcome.kind) {
        case "ready":
          return; // The bearer arrives by push and the console moves on.
        case "pending":
          onHold(true);
          setPhase({ name: "pending" });
          return;
        case "failed":
          setPhase({ name: "problem", message: failedReason(outcome.reason) + " Press Enter to choose another folder." });
          return;
        case "invalid":
        case "refused":
          setPhase({ name: "problem", message: outcome.message + " Press Enter to choose another folder." });
          return;
      }
    } catch (err) {
      setPhase({
        name: "problem",
        message:
          (err instanceof Error ? err.message : "The workspace could not be registered.") +
          " Press Enter to choose another folder.",
      });
    }
  }

  if (phase.name === "submitting") {
    return (
      <Text>
        <Spinner type="dots" /> Registering {chosen}…
      </Text>
    );
  }

  if (phase.name === "pending") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="yellow">
          Registered — finishing setup.
        </Text>
        <Text>
          Your workspace is registered and this identity is in it. Floe&apos;s bridge has not confirmed the
          folder on disk yet, which usually just means it is not running. This is not an error; setup
          completes on its own once the bridge is up.
        </Text>
        <Text dimColor>Press Enter to continue into the console.</Text>
      </Box>
    );
  }

  if (phase.name === "problem") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red">{phase.message}</Text>
      </Box>
    );
  }

  if (phase.name === "details") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Name this workspace</Text>
        <Text dimColor>{chosen}</Text>
        <Box>
          <Text>Workspace name: </Text>
          <TextInput value={workspaceName} onChange={setWorkspaceName} onSubmit={() => void submit()} />
        </Box>
        <Text dimColor>Enter to register · Esc to pick another folder</Text>
      </Box>
    );
  }

  // pick
  return (
    <FolderPicker
      title="Choose a workspace folder"
      onChoose={(dir) => {
        setChosen(dir);
        setWorkspaceName(basename(dir) || dir);
        setPhase({ name: "details" });
      }}
    />
  );
}

function failedReason(reason: string): string {
  switch (reason) {
    case "workspace_inaccessible":
      return "That folder cannot be read. Check its permissions, or pick another.";
    case "config_invalid":
      return "That folder has a broken Floe config (.floe). Fix it, or pick another.";
    default:
      return `That folder could not be set up (${reason}).`;
  }
}
