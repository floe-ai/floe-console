import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { userInfo } from "node:os";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
export function RegisterWorkspace({ onRegister, onJoined, }) {
    const [phase, setPhase] = useState({ name: "pick" });
    const [dir, setDir] = useState(process.cwd());
    const [selected, setSelected] = useState(0);
    const [chosen, setChosen] = useState(null);
    const [displayName, setDisplayName] = useState(defaultUserName());
    const [workspaceName, setWorkspaceName] = useState("");
    const [detailField, setDetailField] = useState("name");
    const entries = useMemo(() => listEntries(dir), [dir]);
    useEffect(() => {
        setSelected(0);
    }, [dir]);
    useInput((_input, key) => {
        if (phase.name === "pick") {
            if (key.upArrow)
                setSelected((i) => Math.max(0, i - 1));
            if (key.downArrow)
                setSelected((i) => Math.min(entries.length - 1, i + 1));
            if (key.return) {
                const entry = entries[Math.min(selected, entries.length - 1)];
                if (!entry)
                    return;
                if (entry.kind === "use") {
                    setChosen(dir);
                    setWorkspaceName(basename(dir) || dir);
                    setDetailField("name");
                    setPhase({ name: "details" });
                }
                else if (entry.path) {
                    setDir(entry.path);
                }
            }
        }
        else if (phase.name === "pending" && key.return) {
            phase.retry();
        }
        else if (phase.name === "problem" && key.return) {
            setPhase({ name: "pick" });
        }
    });
    async function submit() {
        if (!chosen)
            return;
        setPhase({ name: "submitting" });
        try {
            const result = await onRegister({
                locator: chosen,
                displayName: displayName.trim() || defaultUserName(),
                name: workspaceName.trim() || undefined,
            });
            await applyResult(result);
        }
        catch (err) {
            setPhase({
                name: "problem",
                message: (err instanceof Error ? err.message : "The workspace could not be registered.") +
                    " — is Floe running? Press Enter to choose another folder.",
            });
        }
    }
    async function applyResult(result) {
        switch (result.kind) {
            case "ready":
                await onJoined();
                return;
            case "pending":
                setPhase({ name: "pending", retry: () => void onJoined() });
                return;
            case "failed":
                setPhase({ name: "problem", message: failedReason(result.reason) + " Press Enter to choose another folder." });
                return;
            case "invalid":
            case "refused":
                setPhase({ name: "problem", message: result.message + " Press Enter to choose another folder." });
                return;
        }
    }
    if (phase.name === "submitting") {
        return (_jsxs(Text, { children: [_jsx(Spinner, { type: "dots" }), " Registering ", chosen, "\u2026"] }));
    }
    if (phase.name === "pending") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "Registered \u2014 finishing setup." }), _jsx(Text, { children: "Your workspace is registered and this identity is admitted to it. Floe's bridge has not confirmed the folder on disk yet, which usually just means it is not running. This is not an error; setup completes on its own once the bridge is up." }), _jsx(Text, { dimColor: true, children: "Press Enter to continue into the console." })] }));
    }
    if (phase.name === "problem") {
        return (_jsx(Box, { flexDirection: "column", gap: 1, children: _jsx(Text, { color: "red", children: phase.message }) }));
    }
    if (phase.name === "details") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Name this workspace" }), _jsx(Text, { dimColor: true, children: chosen }), _jsxs(Box, { children: [_jsxs(Text, { children: [detailField === "name" ? "❯ " : "  ", "Your name:     "] }), detailField === "name" ? (_jsx(TextInput, { value: displayName, onChange: setDisplayName, onSubmit: () => setDetailField("workspace") })) : (_jsx(Text, { children: displayName }))] }), _jsxs(Box, { children: [_jsxs(Text, { children: [detailField === "workspace" ? "❯ " : "  ", "Workspace name: "] }), detailField === "workspace" ? (_jsx(TextInput, { value: workspaceName, onChange: setWorkspaceName, onSubmit: () => void submit() })) : (_jsx(Text, { children: workspaceName }))] }), _jsx(Text, { dimColor: true, children: "Enter to accept each field \u00B7 registers when both are set" })] }));
    }
    // pick
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Choose a workspace folder" }), _jsx(Text, { dimColor: true, children: dir }), _jsx(Box, { flexDirection: "column", children: entries.map((e, i) => (_jsxs(Text, { color: i === selected ? "cyan" : undefined, children: [i === selected ? "❯ " : "  ", e.kind === "use" ? _jsx(Text, { bold: true, children: e.label }) : e.label] }, `${e.kind}:${e.label}`))) }), _jsx(Text, { dimColor: true, children: "\u2191/\u2193 move \u00B7 Enter open folder or use this one" })] }));
}
function listEntries(dir) {
    const entries = [{ kind: "use", label: `Use this folder (${basename(dir) || dir})` }];
    const parent = dirname(dir);
    if (parent && parent !== dir)
        entries.push({ kind: "up", label: "..", path: parent });
    try {
        const names = readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith("."))
            .map((d) => d.name)
            .sort((a, b) => a.localeCompare(b));
        for (const name of names)
            entries.push({ kind: "dir", label: `${name}/`, path: join(dir, name) });
    }
    catch {
        // An unreadable directory simply offers no children; the person can go up.
    }
    return entries;
}
function defaultUserName() {
    try {
        return userInfo().username || "me";
    }
    catch {
        return "me";
    }
}
function failedReason(reason) {
    switch (reason) {
        case "workspace_inaccessible":
            return "That folder cannot be read. Check its permissions, or pick another.";
        case "config_invalid":
            return "That folder has a broken Floe config (.floe). Fix it, or pick another.";
        default:
            return `That folder could not be set up (${reason}).`;
    }
}
