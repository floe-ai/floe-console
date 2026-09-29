import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { buttonFor, engineName, showSignIn, signInLine, toneOf } from "../../engines/engine-view.js";
const COLOR = {
    ok: "green",
    busy: "cyan",
    action: "yellow",
    problem: "red",
    quiet: undefined,
};
/**
 * Whether each AI engine can run work, exactly as Floe pushed it, with the one
 * action Floe asked for and any sign-in in progress. Keys live in the caller's
 * footer (engineKeys) so the screen has one place that lists them.
 */
export function EngineStatus({ view }) {
    if (view.kind === "connecting")
        return _jsx(Text, { dimColor: true, children: "AI engine: checking with Floe\u2026" });
    if (view.kind === "unavailable") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: "red", children: "AI engine: the console can't see whether it is ready." }), _jsx(Text, { dimColor: true, children: view.message })] }));
    }
    const engines = Object.values(view.engines);
    if (engines.length === 0)
        return _jsx(Text, { color: "yellow", children: "AI engine: Floe reported no engines." });
    return (_jsx(Box, { flexDirection: "column", children: engines.map((state) => {
            const button = buttonFor(state);
            const signIn = view.signIns[state.engine];
            const line = signIn && showSignIn(state, signIn) ? signInLine(signIn) : null;
            const problem = view.problems[state.engine];
            return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: COLOR[toneOf(state)], children: ["AI engine (", engineName(state.engine), "): ", state.message] }), button && !line?.cancellable && (_jsxs(Text, { children: ["  ", _jsx(Text, { bold: true, children: button.label }), button.note && _jsxs(Text, { dimColor: true, children: [" \u00B7 ", button.note] })] })), line && (_jsxs(Text, { color: COLOR[line.tone], children: ["  ", line.text, line.detail && line.detail !== line.text && _jsxs(Text, { dimColor: true, children: [" ", line.detail] })] })), problem && _jsxs(Text, { color: "red", children: ["  ", problem] })] }, state.engine));
        }) }));
}
