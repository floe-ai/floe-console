import { useEffect, useMemo, useState } from "react";
import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { userInfo } from "node:os";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { RegisterWorkspaceInput, RegisterWorkspaceResult } from "../../bus/identity-auth.js";

/**
 * The identity exists but is in no workspace yet. Registering a folder on this
 * machine is the act of joining it — you are the host, so there is no admission
 * screen and no operator step. The person picks a folder, names it, and the
 * substrate imports its `.floe` (or creates one) and admits this identity.
 *
 * The folder list is read straight off local disk with Node `fs`. That is not a
 * privileged reach around the bus: the console runs on this machine, and the
 * bus's own browse route is host-gated precisely so a client reads its own disk
 * directly rather than asking the substrate to.
 *
 * The three outcomes the register-and-join route can return are shown honestly
 * and never collapsed: `ready` continues, `pending` says plainly that the
 * bridge has not finished setting the folder up (usually because it is not
 * running yet) without implying anything went wrong, and `failed` shows the real
 * reason so the person can fix it or pick another folder.
 */

type Phase =
  | { readonly name: "pick" }
  | { readonly name: "details" }
  | { readonly name: "submitting" }
  | { readonly name: "pending"; readonly retry: () => void }
  | { readonly name: "problem"; readonly message: string };

interface Entry {
  readonly kind: "use" | "up" | "dir";
  readonly label: string;
  readonly path?: string;
}

export function RegisterWorkspace({
  onRegister,
  onJoined,
}: {
  onRegister: (input: RegisterWorkspaceInput) => Promise<RegisterWorkspaceResult>;
  onJoined: () => Promise<void>;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ name: "pick" });
  const [dir, setDir] = useState<string>(process.cwd());
  const [selected, setSelected] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(defaultUserName());
  const [workspaceName, setWorkspaceName] = useState("");
  const [detailField, setDetailField] = useState<"name" | "workspace">("name");

  const entries = useMemo(() => listEntries(dir), [dir]);

  useEffect(() => {
    setSelected(0);
  }, [dir]);

  useInput((_input, key) => {
    if (phase.name === "pick") {
      if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
      if (key.downArrow) setSelected((i) => Math.min(entries.length - 1, i + 1));
      if (key.return) {
        const entry = entries[Math.min(selected, entries.length - 1)];
        if (!entry) return;
        if (entry.kind === "use") {
          setChosen(dir);
          setWorkspaceName(basename(dir) || dir);
          setDetailField("name");
          setPhase({ name: "details" });
        } else if (entry.path) {
          setDir(entry.path);
        }
      }
    } else if (phase.name === "pending" && key.return) {
      phase.retry();
    } else if (phase.name === "problem" && key.return) {
      setPhase({ name: "pick" });
    }
  });

  async function submit(): Promise<void> {
    if (!chosen) return;
    setPhase({ name: "submitting" });
    try {
      const result = await onRegister({
        locator: chosen,
        displayName: displayName.trim() || defaultUserName(),
        name: workspaceName.trim() || undefined,
      });
      await applyResult(result);
    } catch (err) {
      setPhase({
        name: "problem",
        message:
          (err instanceof Error ? err.message : "The workspace could not be registered.") +
          " — is Floe running? Press Enter to choose another folder.",
      });
    }
  }

  async function applyResult(result: RegisterWorkspaceResult): Promise<void> {
    switch (result.kind) {
      case "ready":
        await onJoined();
        return;
      case "pending":
        setPhase({ name: "pending", retry: () => void onJoined() });
        return;
      case "failed":
        setPhase({ name: "problem", message: failedReason(result.reason) + " Press Enter to choose another folder." });
        return;
      case "invalid":
      case "refused":
        setPhase({ name: "problem", message: result.message + " Press Enter to choose another folder." });
        return;
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
          Your workspace is registered and this identity is admitted to it. Floe&apos;s bridge has not
          confirmed the folder on disk yet, which usually just means it is not running. This is not
          an error; setup completes on its own once the bridge is up.
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
          <Text>{detailField === "name" ? "❯ " : "  "}Your name:     </Text>
          {detailField === "name" ? (
            <TextInput
              value={displayName}
              onChange={setDisplayName}
              onSubmit={() => setDetailField("workspace")}
            />
          ) : (
            <Text>{displayName}</Text>
          )}
        </Box>
        <Box>
          <Text>{detailField === "workspace" ? "❯ " : "  "}Workspace name: </Text>
          {detailField === "workspace" ? (
            <TextInput
              value={workspaceName}
              onChange={setWorkspaceName}
              onSubmit={() => void submit()}
            />
          ) : (
            <Text>{workspaceName}</Text>
          )}
        </Box>
        <Text dimColor>Enter to accept each field · registers when both are set</Text>
      </Box>
    );
  }

  // pick
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Choose a workspace folder</Text>
      <Text dimColor>{dir}</Text>
      <Box flexDirection="column">
        {entries.map((e, i) => (
          <Text key={`${e.kind}:${e.label}`} color={i === selected ? "cyan" : undefined}>
            {i === selected ? "❯ " : "  "}
            {e.kind === "use" ? <Text bold>{e.label}</Text> : e.label}
          </Text>
        ))}
      </Box>
      <Text dimColor>↑/↓ move · Enter open folder or use this one</Text>
    </Box>
  );
}

function listEntries(dir: string): Entry[] {
  const entries: Entry[] = [{ kind: "use", label: `Use this folder (${basename(dir) || dir})` }];
  const parent = dirname(dir);
  if (parent && parent !== dir) entries.push({ kind: "up", label: "..", path: parent });
  try {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
    for (const name of names) entries.push({ kind: "dir", label: `${name}/`, path: join(dir, name) });
  } catch {
    // An unreadable directory simply offers no children; the person can go up.
  }
  return entries;
}

function defaultUserName(): string {
  try {
    return userInfo().username || "me";
  } catch {
    return "me";
  }
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
