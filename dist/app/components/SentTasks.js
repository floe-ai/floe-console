import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { heldLine } from "../../engines/engine-view.js";
/** How much of an answer is shown before it is marked as trimmed. */
const ANSWER_LIMIT = 700;
const SHOWN_TASKS = 3;
export function SentTasks({ tasks, nameOf, engines, }) {
    if (tasks.length === 0)
        return null;
    const shown = tasks.slice(0, SHOWN_TASKS);
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, children: "You sent" }), shown.map((task) => (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { children: [_jsxs(Text, { dimColor: true, children: ["To ", nameOf(task.targetEndpointId), ": "] }), oneLine(task.text, 90)] }), _jsx(Box, { marginLeft: 2, flexDirection: "column", children: _jsx(Phase, { task: task, actor: nameOf(task.targetEndpointId), engines: engines }) })] }, task.eventId))), tasks.length > SHOWN_TASKS && _jsxs(Text, { dimColor: true, children: ["and ", tasks.length - SHOWN_TASKS, " earlier"] })] }));
}
function Phase({ task, actor, engines }) {
    const phase = task.phase;
    switch (phase.kind) {
        case "sent":
            return _jsxs(Text, { dimColor: true, children: ["Sent. Not yet delivered to ", actor, "."] });
        case "not_delivered":
            return _jsx(Text, { color: "red", children: "Floe accepted this but delivered it to no one." });
        case "received":
            return _jsxs(Text, { dimColor: true, children: ["\u2713 Received by ", actor, ". Not started yet."] });
        case "held":
            return _jsxs(Text, { color: "yellow", children: ["\u2713 Received \u00B7 ", heldLine(phase, engines)] });
        case "working":
            return _jsxs(Text, { color: "cyan", children: ["\u2713 Received \u00B7 ", actor, " is working\u2026"] });
        case "waiting":
            return phase.onYou ? (_jsxs(Text, { color: "yellow", children: [actor, " asked you something. Answer it in Waiting on you."] })) : (_jsxs(Text, { dimColor: true, children: [actor, " is waiting on another Actor."] }));
        case "resuming":
            return (_jsxs(Text, { dimColor: true, children: ["You answered \u201C", oneLine(phase.answer, 60), "\u201D \u00B7 ", actor, " is continuing\u2026"] }));
        case "done":
            return phase.text.trim() ? (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: "green", children: [actor, " answered:"] }), _jsx(Answer, { text: phase.text })] })) : (_jsxs(Text, { color: "green", children: [actor, " finished without a reply."] }));
        case "failed":
            return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: "red", children: [actor, "\u2019s turn failed:"] }), _jsx(Answer, { text: phase.text || "No reason was given." })] }));
    }
}
function Answer({ text }) {
    const clean = text.trim();
    if (clean.length <= ANSWER_LIMIT)
        return _jsx(Text, { children: clean });
    const rest = clean.length - ANSWER_LIMIT;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [clean.slice(0, ANSWER_LIMIT).trimEnd(), "\u2026"] }), _jsxs(Text, { color: "yellow", children: ["[trimmed: ", rest.toLocaleString(), " more characters not shown]"] })] }));
}
function oneLine(s, n) {
    const flat = s.replace(/\s+/g, " ").trim();
    return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}
