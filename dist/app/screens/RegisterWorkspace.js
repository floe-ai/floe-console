import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { basename } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { FolderPicker } from "../components/FolderPicker.js";
export function RegisterWorkspace({ onJoin, onHold, }) {
    const [phase, setPhase] = useState({ name: "pick" });
    const [chosen, setChosen] = useState(null);
    const [workspaceName, setWorkspaceName] = useState("");
    useInput((_input, key) => {
        if (phase.name === "details" && key.escape) {
            setPhase({ name: "pick" });
        }
        else if (phase.name === "pending" && key.return) {
            onHold(false);
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
            const outcome = await onJoin({ locator: chosen, name: workspaceName.trim() || undefined });
            switch (outcome.kind) {
                case "ready":
                    return; // The bearer arrives by push and the console moves on.
                case "pending":
                    onHold(true);
                    setPhase({ name: "pending" });
                    return;
                case "failed":
                    setPhase({ name: "problem", message: failedReason(outcome.reason) + " Press Enter to choose another folder." });
                    return;
                case "invalid":
                case "refused":
                    setPhase({ name: "problem", message: outcome.message + " Press Enter to choose another folder." });
                    return;
            }
        }
        catch (err) {
            setPhase({
                name: "problem",
                message: (err instanceof Error ? err.message : "The workspace could not be registered.") +
                    " Press Enter to choose another folder.",
            });
        }
    }
    if (phase.name === "submitting") {
        return (_jsxs(Text, { children: [_jsx(Spinner, { type: "dots" }), " Registering ", chosen, "\u2026"] }));
    }
    if (phase.name === "pending") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "Registered \u2014 finishing setup." }), _jsx(Text, { children: "Your workspace is registered and this identity is in it. Floe's bridge has not confirmed the folder on disk yet, which usually just means it is not running. This is not an error; setup completes on its own once the bridge is up." }), _jsx(Text, { dimColor: true, children: "Press Enter to continue into the console." })] }));
    }
    if (phase.name === "problem") {
        return (_jsx(Box, { flexDirection: "column", gap: 1, children: _jsx(Text, { color: "red", children: phase.message }) }));
    }
    if (phase.name === "details") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Name this workspace" }), _jsx(Text, { dimColor: true, children: chosen }), _jsxs(Box, { children: [_jsx(Text, { children: "Workspace name: " }), _jsx(TextInput, { value: workspaceName, onChange: setWorkspaceName, onSubmit: () => void submit() })] }), _jsx(Text, { dimColor: true, children: "Enter to register \u00B7 Esc to pick another folder" })] }));
    }
    // pick
    return (_jsx(FolderPicker, { title: "Choose a workspace folder", onChoose: (dir) => {
            setChosen(dir);
            setWorkspaceName(basename(dir) || dir);
            setPhase({ name: "details" });
        } }));
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
