import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { createServices } from "./services.js";
import { useAuthSession } from "./useAuthSession.js";
import { FirstRun } from "./screens/FirstRun.js";
import { Unlock } from "./screens/Unlock.js";
import { RegisterWorkspace } from "./screens/RegisterWorkspace.js";
import { SelectWorkspace } from "./screens/SelectWorkspace.js";
import { MainSurface } from "./screens/MainSurface.js";
/**
 * The whole console, routed purely by the auth session state. A screen only
 * appears once the substrate (or a local, honest fact like "no key on disk")
 * has confirmed the state it represents — there is no screen that claims a
 * status it has not observed.
 */
export function App() {
    const services = useMemo(() => createServices(), []);
    const state = useAuthSession(services.session);
    // Hold the terminal in raw input mode for the console's whole life. Ink drops
    // raw mode whenever no mounted screen reads input (e.g. the "Authenticating…"
    // spinner between first run and the folder picker), and on Windows re-entering
    // it leaves the next screen deaf to keys — Enter on the picker did nothing.
    useInput(() => { });
    useEffect(() => {
        services.session.init();
    }, [services.session]);
    switch (state.kind) {
        case "checking":
            return _jsx(Text, { dimColor: true, children: "Checking this machine for your identity\u2026" });
        case "no-key":
            return (_jsx(FirstRun, { onProvisioned: (secretKey, npub) => {
                    void services.session.adoptFreshKey(secretKey, npub);
                } }));
        case "locked":
            return (_jsx(Unlock, { npub: state.npub, onUnlock: async (passphrase) => void (await services.session.unlock(passphrase)) }));
        case "authenticating":
            return (_jsxs(Text, { children: [_jsx(Spinner, { type: "dots" }), " Authenticating\u2026"] }));
        case "selecting-workspace":
            return (_jsx(SelectWorkspace, { workspaces: state.workspaces, onSelect: async (workspaceId) => void (await services.session.selectWorkspace(workspaceId)) }));
        case "needs-workspace":
            return (_jsx(RegisterWorkspace, { onRegister: (input) => services.session.registerAndJoin(input), onJoined: async () => void (await services.session.checkNow()) }));
        case "ready":
            return (_jsx(MainSurface, { npub: state.npub, workspaceName: state.workspace.name, workspaceId: state.workspace.workspace_id, bearer: state.bearer, endpoints: services.endpoints }));
        case "error":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { color: "red", children: state.message }), _jsxs(Text, { dimColor: true, children: [services.endpoints.httpBaseUrl, " (", services.endpoints.source, ")"] })] }));
    }
}
