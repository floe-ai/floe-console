import { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type { WorkspaceClient } from "../../bus/workspace-client.js";
import { FolderPicker } from "../components/FolderPicker.js";
import {
  COMMANDS_NOT_CONFINED,
  FOLDERS_UNRESTRICTED,
  SYSTEM_ACCESS_WARNING,
  accessChanges,
  type ChangeOutcome,
  type WorkspaceAccess,
  type WorkspaceFolder,
} from "../../workspace/access.js";
import { accessRows, rowKeys, systemAccessLine } from "../../workspace/access-view.js";

/**
 * Workspace folders and System access, from Settings. It shows only the access
 * Floe last pushed; a change is sent as a Floe operation and the screen updates
 * when Floe pushes the result. Refusals show Floe's own reason.
 */

type Phase =
  | { readonly name: "list" }
  | { readonly name: "pick" }
  | { readonly name: "remove"; readonly folder: WorkspaceFolder }
  | { readonly name: "system_on" }
  | { readonly name: "saving"; readonly what: string };

export function WorkspaceAccessScreen({
  access,
  client,
  workspaceName,
  onBack,
}: {
  /** Null until Floe has sent it. */
  access: WorkspaceAccess | null;
  client: WorkspaceClient;
  workspaceName: string;
  onBack: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ name: "list" });
  const [selected, setSelected] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const rows = access ? accessRows(access) : [];
  const row = rows[Math.min(selected, rows.length - 1)];

  async function run(what: string, work: () => Promise<ChangeOutcome>): Promise<void> {
    setProblem(null);
    setPhase({ name: "saving", what });
    try {
      const outcome = await work();
      if (outcome.kind === "refused") setProblem(outcome.message);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Floe could not be reached.");
    }
    setPhase({ name: "list" });
  }

  useInput(
    (_input, key) => {
      if (phase.name === "remove" || phase.name === "system_on") {
        if (key.escape) setPhase({ name: "list" });
        return;
      }
      if (key.escape) onBack();
      if (!access || !row) return;
      if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
      if (key.downArrow) setSelected((i) => Math.min(rows.length - 1, i + 1));
      if (!key.return) return;
      setProblem(null);
      if (row.kind === "add") setPhase({ name: "pick" });
      if (row.kind === "folder" && row.removable) setPhase({ name: "remove", folder: row.folder });
      if (row.kind === "system" && !row.on) setPhase({ name: "system_on" });
      // Turning it off narrows access, so it takes effect at once.
      if (row.kind === "system" && row.on) {
        void run("Turning System access off…", () => accessChanges.setSystemAccess(client, false));
      }
    },
    { isActive: phase.name !== "pick" && phase.name !== "saving" },
  );

  const header = <Text bold>Workspace folders · {workspaceName}</Text>;

  if (phase.name === "pick") {
    return (
      <FolderPicker
        title="Add a folder to this workspace"
        hint="Esc back"
        onCancel={() => setPhase({ name: "list" })}
        onChoose={(path) => void run(`Adding ${path}…`, () => accessChanges.addFolder(client, path))}
      />
    );
  }

  if (phase.name === "remove") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text bold>Remove this folder from the workspace?</Text>
        <Text>{phase.folder.path}</Text>
        <Text>
          Actors&apos; file tools will no longer be able to use it. Nothing in the folder is deleted. Commands an Actor
          runs are not confined, so they can still reach it.
        </Text>
        <SelectInput
          items={[
            { label: "No, keep it", value: "keep" },
            { label: "Yes, remove it", value: "remove" },
          ]}
          onSelect={(item) =>
            item.value === "remove"
              ? void run(`Removing ${phase.folder.path}…`, () => accessChanges.removeFolder(client, phase.folder.folder_id))
              : setPhase({ name: "list" })
          }
        />
        <Text dimColor>Esc back</Text>
      </Box>
    );
  }

  if (phase.name === "system_on") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text bold>Turn on System access?</Text>
        <Text color="yellow">{SYSTEM_ACCESS_WARNING}</Text>
        <Text>You can turn it off again here at any time; that takes effect at once.</Text>
        <SelectInput
          items={[
            { label: "No, keep it off", value: "off" },
            { label: "Yes, turn it on", value: "on" },
          ]}
          onSelect={(item) =>
            item.value === "on"
              ? void run("Turning System access on…", () => accessChanges.setSystemAccess(client, true))
              : setPhase({ name: "list" })
          }
        />
        <Text dimColor>Esc back</Text>
      </Box>
    );
  }

  if (!access) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text dimColor>Waiting for Floe to send this workspace&apos;s folders…</Text>
        <Text dimColor>Esc back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <Box flexDirection="column">
        <Text>{FOLDERS_UNRESTRICTED}</Text>
        <Text color="yellow">{COMMANDS_NOT_CONFINED}</Text>
      </Box>
      <Box flexDirection="column">
        {rows.map((r, i) => (
          <Box key={r.kind === "folder" ? r.folder.folder_id : r.kind} flexDirection="column">
            <Text color={i === selected ? "cyan" : undefined}>
              {i === selected ? "❯ " : "  "}
              {r.label}
            </Text>
            {r.kind === "system" && (
              <Text color={r.on ? "yellow" : undefined} dimColor={!r.on}>
                {"    "}
                {systemAccessLine(r.on)}
              </Text>
            )}
          </Box>
        ))}
      </Box>
      {phase.name === "saving" && (
        <Text>
          <Spinner type="dots" /> {phase.what}
        </Text>
      )}
      {problem && <Text color="red">{problem}</Text>}
      <Text dimColor>↑/↓ select · {rowKeys(row)} · Esc back</Text>
    </Box>
  );
}
