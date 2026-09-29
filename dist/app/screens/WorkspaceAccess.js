import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { FolderPicker } from "../components/FolderPicker.js";
import { COMMANDS_NOT_CONFINED, FOLDERS_UNRESTRICTED, SYSTEM_ACCESS_WARNING, accessChanges, } from "../../workspace/access.js";
import { accessRows, rowKeys, systemAccessLine } from "../../workspace/access-view.js";
export function WorkspaceAccessScreen({ access, client, workspaceName, onBack, }) {
    const [phase, setPhase] = useState({ name: "list" });
    const [selected, setSelected] = useState(0);
    const [problem, setProblem] = useState(null);
    const rows = access ? accessRows(access) : [];
    const row = rows[Math.min(selected, rows.length - 1)];
    async function run(what, work) {
        setProblem(null);
        setPhase({ name: "saving", what });
        try {
            const outcome = await work();
            if (outcome.kind === "refused")
                setProblem(outcome.message);
        }
        catch (err) {
            setProblem(err instanceof Error ? err.message : "Floe could not be reached.");
        }
        setPhase({ name: "list" });
    }
    useInput((_input, key) => {
        if (phase.name === "remove" || phase.name === "system_on") {
            if (key.escape)
                setPhase({ name: "list" });
            return;
        }
        if (key.escape)
            onBack();
        if (!access || !row)
            return;
        if (key.upArrow)
            setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow)
            setSelected((i) => Math.min(rows.length - 1, i + 1));
        if (!key.return)
            return;
        setProblem(null);
        if (row.kind === "add")
            setPhase({ name: "pick" });
        if (row.kind === "folder" && row.removable)
            setPhase({ name: "remove", folder: row.folder });
        if (row.kind === "system" && !row.on)
            setPhase({ name: "system_on" });
        // Turning it off narrows access, so it takes effect at once.
        if (row.kind === "system" && row.on) {
            void run("Turning System access off…", () => accessChanges.setSystemAccess(client, false));
        }
    }, { isActive: phase.name !== "pick" && phase.name !== "saving" });
    const header = _jsxs(Text, { bold: true, children: ["Workspace folders \u00B7 ", workspaceName] });
    if (phase.name === "pick") {
        return (_jsx(FolderPicker, { title: "Add a folder to this workspace", hint: "Esc back", onCancel: () => setPhase({ name: "list" }), onChoose: (path) => void run(`Adding ${path}…`, () => accessChanges.addFolder(client, path)) }));
    }
    if (phase.name === "remove") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { bold: true, children: "Remove this folder from the workspace?" }), _jsx(Text, { children: phase.folder.path }), _jsx(Text, { children: "Actors' file tools will no longer be able to use it. Nothing in the folder is deleted. Commands an Actor runs are not confined, so they can still reach it." }), _jsx(SelectInput, { items: [
                        { label: "No, keep it", value: "keep" },
                        { label: "Yes, remove it", value: "remove" },
                    ], onSelect: (item) => item.value === "remove"
                        ? void run(`Removing ${phase.folder.path}…`, () => accessChanges.removeFolder(client, phase.folder.folder_id))
                        : setPhase({ name: "list" }) }), _jsx(Text, { dimColor: true, children: "Esc back" })] }));
    }
    if (phase.name === "system_on") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { bold: true, children: "Turn on System access?" }), _jsx(Text, { color: "yellow", children: SYSTEM_ACCESS_WARNING }), _jsx(Text, { children: "You can turn it off again here at any time; that takes effect at once." }), _jsx(SelectInput, { items: [
                        { label: "No, keep it off", value: "off" },
                        { label: "Yes, turn it on", value: "on" },
                    ], onSelect: (item) => item.value === "on"
                        ? void run("Turning System access on…", () => accessChanges.setSystemAccess(client, true))
                        : setPhase({ name: "list" }) }), _jsx(Text, { dimColor: true, children: "Esc back" })] }));
    }
    if (!access) {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { dimColor: true, children: "Waiting for Floe to send this workspace's folders\u2026" }), _jsx(Text, { dimColor: true, children: "Esc back" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: FOLDERS_UNRESTRICTED }), _jsx(Text, { color: "yellow", children: COMMANDS_NOT_CONFINED })] }), _jsx(Box, { flexDirection: "column", children: rows.map((r, i) => (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: i === selected ? "cyan" : undefined, children: [i === selected ? "❯ " : "  ", r.label] }), r.kind === "system" && (_jsxs(Text, { color: r.on ? "yellow" : undefined, dimColor: !r.on, children: ["    ", systemAccessLine(r.on)] }))] }, r.kind === "folder" ? r.folder.folder_id : r.kind))) }), phase.name === "saving" && (_jsxs(Text, { children: [_jsx(Spinner, { type: "dots" }), " ", phase.what] })), problem && _jsx(Text, { color: "red", children: problem }), _jsxs(Text, { dimColor: true, children: ["\u2191/\u2193 select \u00B7 ", rowKeys(row), " \u00B7 Esc back"] })] }));
}
