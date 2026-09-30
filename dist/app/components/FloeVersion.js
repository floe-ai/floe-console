import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { describeTurn } from "../../version/version-switch.js";
/**
 * Floe's own version note, and beside it the offer to switch to the newer Floe
 * this console ships. Keys work only while `keys` is true (the main screen with
 * nothing being typed), and the hints show only then.
 */
export function FloeVersion({ note, versionSwitch, keys, workspaceId, workspaceNames, }) {
    const [state, setState] = useState(() => versionSwitch.getState());
    useEffect(() => {
        setState(versionSwitch.getState());
        return versionSwitch.subscribe(setState);
    }, [versionSwitch]);
    const offered = note !== null && versionSwitch.offered();
    useInput((input, key) => {
        if (state.kind === "idle" || state.kind === "problem") {
            if (input === "u" && offered)
                void versionSwitch.start();
            if (key.escape && state.kind === "problem")
                versionSwitch.cancel();
        }
        else if (state.kind === "work_running") {
            if (input === "x")
                void versionSwitch.interrupt();
            if (input === "w")
                versionSwitch.wait(workspaceId);
            if (key.escape)
                versionSwitch.cancel();
        }
        else if (state.kind === "waiting") {
            if (input === "u")
                void versionSwitch.start();
            if (key.escape)
                versionSwitch.cancel();
        }
        else if (state.kind === "switched") {
            if (key.escape)
                versionSwitch.cancel();
        }
    }, { isActive: keys });
    const turns = (list) => list.map((turn) => _jsxs(Text, { children: ["  \u00B7 ", describeTurn(turn, workspaceNames)] }, turn.endpoint_id));
    switch (state.kind) {
        case "switching":
            return (_jsxs(Text, { color: "yellow", children: [_jsx(Spinner, { type: "dots" }), " ", state.interrupting ? "Interrupting the work in progress and switching" : "Switching", " to the newer Floe\u2026"] }));
        case "work_running":
            return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, children: [_jsx(Text, { color: "yellow", children: state.message }), turns(state.running), keys && _jsx(Text, { dimColor: true, children: "x interrupt it and switch \u00B7 w wait for it to finish \u00B7 Esc cancel" })] }));
        case "waiting":
            return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, children: [state.watched.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "Waiting for this to finish, then switching:" }), turns(state.watched)] })), state.unwatched.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "Floe does not tell this console when work in another workspace finishes:" }), turns(state.unwatched)] })), keys && (_jsxs(Text, { dimColor: true, children: [state.unwatched.length > 0 ? "u try again now · " : "", "Esc stop waiting"] }))] }));
        case "switched":
            return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: "green", children: ["Floe ", state.to, " is now running", state.from ? ` (it was ${state.from})` : "", "."] }), state.interrupted.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { children: "Interrupted:" }), turns(state.interrupted)] })), note && _jsx(Text, { color: "yellow", children: note })] }));
        case "problem":
            return (_jsxs(Box, { flexDirection: "column", children: [note && _jsx(Text, { color: "yellow", children: note }), _jsxs(Text, { color: "red", children: ["Floe was not switched: ", state.message] }), keys && _jsxs(Text, { dimColor: true, children: [offered ? "u try again · " : "", "Esc dismiss"] })] }));
        case "idle":
            if (!note)
                return null;
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: "yellow", children: note }), offered && keys && _jsx(Text, { dimColor: true, children: "u switch to the newer Floe" })] }));
    }
}
