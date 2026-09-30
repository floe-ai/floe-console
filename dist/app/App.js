import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { findLegacyFile } from "../migration/legacy-file.js";
import { resolveBusEndpoints } from "../bus/config.js";
import { BackupScreen } from "./components/Backup.js";
import { FirstRun } from "./screens/FirstRun.js";
import { Unlock } from "./screens/Unlock.js";
import { Migrate } from "./screens/Migrate.js";
import { RegisterWorkspace } from "./screens/RegisterWorkspace.js";
import { SelectWorkspace } from "./screens/SelectWorkspace.js";
import { MainSurface } from "./screens/MainSurface.js";
import { FloeVersion } from "./components/FloeVersion.js";
/**
 * The console, with Floe's own note above every screen when the Floe already
 * running is a different version from the console's copy. When the console's
 * copy is newer, the main screen offers to switch to it; Floe does the switch.
 */
export function App({ link, engines, versionSwitch, }) {
    const [note, setNote] = useState(() => link.versionNote ?? engines.versionNote);
    const [linkState, setLinkState] = useState(() => link.getState());
    const [switching, setSwitching] = useState(() => versionSwitch.getState().kind === "switching");
    /** True while the main screen is showing and nothing is being typed, so the switch keys are free. */
    const [keys, setKeys] = useState(false);
    useEffect(() => {
        const read = () => {
            setNote(link.versionNote ?? engines.versionNote);
            setLinkState(link.getState());
        };
        read();
        const offLink = link.subscribe(read);
        const offEngines = engines.subscribe(read);
        const offSwitch = versionSwitch.subscribe((s) => setSwitching(s.kind === "switching"));
        return () => {
            offLink();
            offEngines();
            offSwitch();
        };
    }, [link, engines, versionSwitch]);
    const session = linkState.kind === "connected" ? linkState.session : null;
    const workspaceId = session?.kind === "ready" ? session.workspace.workspace_id : null;
    const workspaceNames = useMemo(() => new Map((session?.kind === "ready" || session?.kind === "selecting" ? session.workspaces : []).map((w) => [
        w.workspace_id,
        w.name,
    ])), [session]);
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(FloeVersion, { note: note, versionSwitch: versionSwitch, keys: keys, workspaceId: workspaceId, workspaceNames: workspaceNames }), !switching && _jsx(Routed, { link: link, engines: engines, versionSwitch: versionSwitch, onKeys: setKeys })] }));
}
/**
 * The whole console, routed by what Floe's identity agent has pushed. A screen
 * only appears once Floe has confirmed the state it represents. Two things sit
 * above that routing because the person must finish them first: a backup being
 * shown once, and the offer to bring an earlier console's identity into Floe.
 */
function Routed({ link, engines, versionSwitch, onKeys, }) {
    const { exit } = useApp();
    const [state, setState] = useState(() => link.getState());
    const [legacy, setLegacy] = useState(() => findLegacyFile());
    const [backup, setBackup] = useState(null);
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
            if (key.return)
                void link.connect();
            if (input === "q")
                exit();
        }
        if (state.kind === "connected" && state.session.kind === "stopped" && key.return)
            void link.reopen();
        if (state.kind === "connected" && idleDevice(state) && key.return)
            void link.reopen();
    });
    const endpoints = useMemo(() => (state.kind === "connected" ? resolveBusEndpoints() : null), [state.kind]);
    if (state.kind === "connecting") {
        return (_jsxs(Text, { children: [_jsx(Spinner, { type: "dots" }), " Connecting to Floe (starting it if needed)\u2026"] }));
    }
    if (state.kind === "unavailable") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { color: "red", children: state.message }), _jsx(Text, { dimColor: true, children: "Enter to try again \u00B7 q to quit" })] }));
    }
    const identity = link.identity;
    if (backup)
        return _jsx(BackupScreen, { backup: backup, onDone: () => setBackup(null) });
    if (legacy) {
        return _jsx(Migrate, { identity: identity, legacy: legacy, onBackup: setBackup, onDone: () => setLegacy(null) });
    }
    const id = state.identity;
    if (id.kind === "none")
        return _jsx(FirstRun, { identity: identity, onBackup: setBackup });
    if (id.kind === "locked" && id.protection === "passphrase")
        return _jsx(Unlock, { identity: identity, onBackup: setBackup });
    const session = state.session;
    if (holdJoin || session.kind === "needs-workspace") {
        return _jsx(RegisterWorkspace, { onJoin: (input) => identity.joinFolder(input), onHold: setHoldJoin });
    }
    switch (session.kind) {
        case "ready":
            return (_jsx(MainSurface, { identity: identity, engines: engines, workspaceName: session.workspace.name, workspaceId: session.workspace.workspace_id, bearer: session.bearer, endpoints: endpoints ?? resolveBusEndpoints(), versionSwitch: versionSwitch, onKeys: onKeys }));
        case "selecting":
            return _jsx(SelectWorkspace, { workspaces: session.workspaces, onSelect: (workspaceId) => link.select(workspaceId) });
        case "stopped":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { color: "red", children: session.message }), _jsx(Text, { dimColor: true, children: "Enter to open a new session" })] }));
        default:
            if (idleDevice(state)) {
                return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { children: "Floe locked this identity." }), _jsx(Text, { dimColor: true, children: "Enter to use it again" })] }));
            }
            return (_jsxs(Text, { children: [_jsx(Spinner, { type: "dots" }), " Opening your session\u2026"] }));
    }
}
/** A device identity Floe locked on purpose: it waits for the person rather than unlocking itself. */
function idleDevice(state) {
    return state.identity.kind === "locked" && state.identity.protection === "device" && state.session.kind === "none";
}
