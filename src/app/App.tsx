import { useEffect, useMemo } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { createServices } from "./services.js";
import { useAuthSession } from "./useAuthSession.js";
import { FirstRun } from "./screens/FirstRun.js";
import { Unlock } from "./screens/Unlock.js";
import { AdmissionWait } from "./screens/AdmissionWait.js";
import { SelectWorkspace } from "./screens/SelectWorkspace.js";
import { MainSurface } from "./screens/MainSurface.js";

/**
 * The whole console, routed purely by the auth session state. A screen only
 * appears once the substrate (or a local, honest fact like "no key on disk")
 * has confirmed the state it represents — there is no screen that claims a
 * status it has not observed.
 */
export function App(): JSX.Element {
  const services = useMemo(() => createServices(), []);
  const state = useAuthSession(services.session);

  useEffect(() => {
    services.session.init();
  }, [services.session]);

  switch (state.kind) {
    case "no-key":
      return (
        <FirstRun
          onProvisioned={(secretKey, npub) => {
            void services.session.adoptFreshKey(secretKey, npub);
          }}
        />
      );

    case "locked":
      return (
        <Unlock npub={state.npub} onUnlock={async (passphrase) => void (await services.session.unlock(passphrase))} />
      );

    case "authenticating":
      return (
        <Text>
          <Spinner type="dots" /> Authenticating…
        </Text>
      );

    case "selecting-workspace":
      return (
        <SelectWorkspace
          workspaces={state.workspaces}
          onSelect={async (workspaceId) => void (await services.session.selectWorkspace(workspaceId))}
        />
      );

    case "awaiting-admission":
      return (
        <AdmissionWait
          npub={state.npub}
          message={state.message}
          onCheckNow={async () => void (await services.session.checkNow())}
        />
      );

    case "ready":
      return (
        <MainSurface
          npub={state.npub}
          workspaceName={state.workspace.name}
          workspaceId={state.workspace.workspace_id}
          bearer={state.bearer}
          endpoints={services.endpoints}
        />
      );

    case "error":
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="red">{state.message}</Text>
          <Text dimColor>{services.endpoints.httpBaseUrl} ({services.endpoints.source})</Text>
        </Box>
      );
  }
}
