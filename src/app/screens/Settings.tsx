import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError, type IdentityClient, type SecretKind } from "floe/identity";
import { BackupView } from "../components/Backup.js";
import { Identities } from "./Identities.js";
import { WorkspaceAccessScreen } from "./WorkspaceAccess.js";
import type { WorkspaceClient } from "../../bus/workspace-client.js";
import type { WorkspaceAccess } from "../../workspace/access.js";
import { messageOf } from "../../identity/identity-link.js";

/**
 * Settings, reachable from the main surface. Its job is the identity's backup:
 * reveal the recovery phrase (or, for an identity made before phrases, its
 * secret key). Floe opens it; a passphrase identity needs the passphrase, and a
 * device identity needs an explicit confirmation because the device is its only
 * guard. Restoring on another machine is first run's "Restore". "Your identities"
 * lists every identity kept on this machine and deletes them. "Workspace folders
 * and System access" shows and changes which folders Actors' file tools may use.
 */

type Phase =
  | { readonly name: "menu" }
  | { readonly name: "passphrase" }
  | { readonly name: "confirm" }
  | { readonly name: "identities" }
  | { readonly name: "workspace" }
  | { readonly name: "revealed"; readonly kind: SecretKind; readonly secret: string };

export function Settings({
  identity,
  workspace,
  onClose,
}: {
  identity: IdentityClient;
  workspace: { access: WorkspaceAccess | null; client: WorkspaceClient; name: string };
  onClose: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ name: "menu" });
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const state = identity.state;
  const device = state.kind !== "none" && state.protection === "device";

  useInput((_input, key) => {
    if (!key.escape) return;
    if (phase.name === "menu") onClose();
    else {
      setPassphrase("");
      setError(null);
      setPhase({ name: "menu" });
    }
  }, { isActive: phase.name !== "identities" && phase.name !== "workspace" });

  async function reveal(args: { passphrase?: string; confirm?: boolean }): Promise<void> {
    try {
      const { secret_kind, secret } = await identity.reveal(args);
      setPhase({ name: "revealed", kind: secret_kind, secret });
    } catch (err) {
      setPassphrase("");
      setError(
        err instanceof IdentityError && err.code === "wrong_passphrase"
          ? "That passphrase did not unlock this identity."
          : messageOf(err),
      );
    }
  }

  const header = <Text bold>Settings{state.kind !== "none" ? ` · ${state.display_name}` : ""}</Text>;

  if (phase.name === "identities") {
    return <Identities identity={identity} onBack={() => setPhase({ name: "menu" })} />;
  }

  if (phase.name === "workspace") {
    return (
      <WorkspaceAccessScreen
        access={workspace.access}
        client={workspace.client}
        workspaceName={workspace.name}
        onBack={() => setPhase({ name: "menu" })}
      />
    );
  }

  if (phase.name === "revealed") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text bold>{phase.kind === "phrase" ? "Your recovery phrase" : "Your secret key"}</Text>
        {device && (
          <Text color="yellow">
            This identity has no passphrase: the device is the only thing protecting it. This backup is the
            only copy that survives this machine, so write it down and keep it safe.
          </Text>
        )}
        <Text>Write it down. It is a backup to keep, not an address to share.</Text>
        <BackupView kind={phase.kind} secret={phase.secret} />
        <Text dimColor>Esc to go back.</Text>
      </Box>
    );
  }

  if (phase.name === "confirm") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text>
          This identity is guarded only by this device. Anyone who can use this computer as you can see its
          backup. Show it now?
        </Text>
        {error && <Text color="red">{error}</Text>}
        <SelectInput
          items={[
            { label: "Yes, show my backup", value: "yes" },
            { label: "No, go back", value: "no" },
          ]}
          onSelect={(item) => (item.value === "yes" ? void reveal({ confirm: true }) : setPhase({ name: "menu" }))}
        />
      </Box>
    );
  }

  if (phase.name === "passphrase") {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text>Enter your passphrase to reveal your backup.</Text>
        <Box>
          <Text>Passphrase: </Text>
          <TextInput
            mask="*"
            value={passphrase}
            onChange={(v) => {
              setPassphrase(v);
              setError(null);
            }}
            onSubmit={() => void reveal({ passphrase })}
          />
        </Box>
        {error && <Text color="red">{error}</Text>}
        <Text dimColor>Esc to go back.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <SelectInput
        items={[
          {
            label: `Reveal your backup (${state.kind !== "none" && state.secret_kind === "nsec" ? "secret key" : "recovery phrase"})`,
            value: "reveal",
          },
          { label: "Your identities", value: "identities" },
          { label: "Workspace folders and System access", value: "workspace" },
        ]}
        onSelect={(item) =>
          setPhase(
            item.value === "identities"
              ? { name: "identities" }
              : item.value === "workspace"
                ? { name: "workspace" }
                : device
                  ? { name: "confirm" }
                  : { name: "passphrase" },
          )
        }
      />
      <Text dimColor>Esc to go back.</Text>
    </Box>
  );
}
