import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { IdentityLink, LinkState } from "../identity/identity-link.js";
import { findLegacyFile, type LegacyFile } from "../migration/legacy-file.js";
import { resolveBusEndpoints } from "../bus/config.js";
import { BackupScreen, type Backup } from "./components/Backup.js";
import { FirstRun } from "./screens/FirstRun.js";
import { Unlock } from "./screens/Unlock.js";
import { Migrate } from "./screens/Migrate.js";
import { RegisterWorkspace } from "./screens/RegisterWorkspace.js";
import { SelectWorkspace } from "./screens/SelectWorkspace.js";
import { MainSurface } from "./screens/MainSurface.js";

/**
 * The whole console, routed by what Floe's identity agent has pushed. A screen
 * only appears once Floe has confirmed the state it represents. Two things sit
 * above that routing because the person must finish them first: a backup being
 * shown once, and the offer to bring an earlier console's identity into Floe.
 */
export function App({ link }: { link: IdentityLink }): JSX.Element {
  const { exit } = useApp();
  const [state, setState] = useState<LinkState>(() => link.getState());
  const [legacy, setLegacy] = useState<LegacyFile | null>(() => findLegacyFile());
  const [backup, setBackup] = useState<Backup | null>(null);
  const [holdJoin, setHoldJoin] = useState(false);

  useEffect(() => {
    setState(link.getState());
    return link.subscribe(setState);
  }, [link]);

  // Hold the terminal in raw input mode for the console's whole life. Ink drops
  // raw mode whenever no mounted screen reads input (e.g. a spinner between two
  // screens), and on Windows re-entering it leaves the next screen deaf to keys.
  useInput((input, key) => {
    if (state.kind === "unavailable") {
      if (key.return) void link.connect();
      if (input === "q") exit();
    }
    if (state.kind === "connected" && state.session.kind === "stopped" && key.return) void link.reopen();
    if (state.kind === "connected" && idleDevice(state) && key.return) void link.reopen();
  });

  const endpoints = useMemo(() => (state.kind === "connected" ? resolveBusEndpoints() : null), [state.kind]);

  if (state.kind === "connecting") {
    return (
      <Text>
        <Spinner type="dots" /> Connecting to Floe (starting it if needed)…
      </Text>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red">{state.message}</Text>
        <Text dimColor>Enter to try again · q to quit</Text>
      </Box>
    );
  }

  const identity = link.identity;

  if (backup) return <BackupScreen backup={backup} onDone={() => setBackup(null)} />;

  if (legacy) {
    return <Migrate identity={identity} legacy={legacy} onBackup={setBackup} onDone={() => setLegacy(null)} />;
  }

  const id = state.identity;
  if (id.kind === "none") return <FirstRun identity={identity} onBackup={setBackup} />;
  if (id.kind === "locked" && id.protection === "passphrase") return <Unlock identity={identity} onBackup={setBackup} />;

  const session = state.session;
  if (holdJoin || session.kind === "needs-workspace") {
    return <RegisterWorkspace onJoin={(input) => identity.joinFolder(input)} onHold={setHoldJoin} />;
  }

  switch (session.kind) {
    case "ready":
      return (
        <MainSurface
          identity={identity}
          workspaceName={session.workspace.name}
          workspaceId={session.workspace.workspace_id}
          bearer={session.bearer}
          endpoints={endpoints ?? resolveBusEndpoints()}
        />
      );
    case "selecting":
      return <SelectWorkspace workspaces={session.workspaces} onSelect={(workspaceId) => link.select(workspaceId)} />;
    case "stopped":
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="red">{session.message}</Text>
          <Text dimColor>Enter to open a new session</Text>
        </Box>
      );
    default:
      if (idleDevice(state)) {
        return (
          <Box flexDirection="column" gap={1}>
            <Text>Floe locked this identity.</Text>
            <Text dimColor>Enter to use it again</Text>
          </Box>
        );
      }
      return (
        <Text>
          <Spinner type="dots" /> Opening your session…
        </Text>
      );
  }
}

/** A device identity Floe locked on purpose: it waits for the person rather than unlocking itself. */
function idleDevice(state: Extract<LinkState, { kind: "connected" }>): boolean {
  return state.identity.kind === "locked" && state.identity.protection === "device" && state.session.kind === "none";
}
