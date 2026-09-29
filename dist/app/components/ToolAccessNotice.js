import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { COMMANDS_NOT_CONFINED } from "../../workspace/access.js";
/**
 * Floe's one-time notice that this older Workspace's Floe Actors were given
 * tool access. The words are Floe's own. It stays while Floe keeps the record:
 * Floe has no way yet to mark it seen, so the console does not pretend to.
 */
export function ToolAccessNotice({ notice }) {
    if (!notice)
        return null;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, children: [_jsx(Text, { bold: true, children: notice.summary }), _jsx(Text, { children: COMMANDS_NOT_CONFINED }), _jsx(Text, { dimColor: true, children: "Change the folders in g settings \u2192 Workspace folders and System access." })] }));
}
