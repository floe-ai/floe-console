import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
/**
 * The identity is in several workspaces and named none, so Floe
 * returned the list to choose from. The human picks from names the substrate
 * gave us — never a workspace id they typed.
 */
export function SelectWorkspace({ workspaces, onSelect, }) {
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Choose a workspace" }), _jsx(Text, { children: "Your identity is in more than one. Each session acts in exactly one." }), _jsx(SelectInput, { items: workspaces.map((w) => ({ label: w.name, value: w.workspace_id })), onSelect: (item) => {
                    void onSelect(item.value);
                } })] }));
}
