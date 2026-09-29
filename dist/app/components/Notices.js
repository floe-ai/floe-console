import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { COMMANDS_NOT_CONFINED } from "../../workspace/access.js";
/**
 * Floe's notices about access in this Workspace that the person has not seen
 * yet, newest first, in Floe's own words. `m` tells Floe the top one was seen;
 * it leaves when Floe pushes that it is seen, on every surface the person uses.
 */
export function Notices({ notices, canMarkSeen, onMarkSeen, }) {
    const [marking, setMarking] = useState(null);
    const [problem, setProblem] = useState(null);
    const top = notices[0];
    useInput((input) => {
        if (input !== "m" || !top || !canMarkSeen || marking)
            return;
        setMarking(top.record_id);
        setProblem(null);
        void onMarkSeen(top.record_id)
            .then((outcome) => setProblem(outcome.kind === "refused" ? outcome.message : null))
            .catch((error) => setProblem(error instanceof Error ? error.message : String(error)))
            .finally(() => setMarking(null));
    });
    if (!top)
        return null;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, children: [notices.map((notice) => (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, children: notice.summary }), notice.kind === "tool_access_given" && (_jsxs(_Fragment, { children: [_jsx(Text, { children: COMMANDS_NOT_CONFINED }), _jsx(Text, { dimColor: true, children: "Change the folders in g settings \u2192 Workspace folders and System access." })] }))] }, notice.record_id))), problem && _jsx(Text, { color: "red", children: problem }), marking ? (_jsx(Text, { dimColor: true, children: "Marking it seen\u2026" })) : (canMarkSeen && _jsxs(Text, { dimColor: true, children: ["m mark ", notices.length > 1 ? "the first" : "it", " seen"] }))] }));
}
