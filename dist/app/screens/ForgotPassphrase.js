import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { NewPassphrase } from "../components/NewPassphrase.js";
import { messageOf } from "../../identity/identity-link.js";
import { Restore } from "./Restore.js";
export function ForgotPassphrase({ identity, onBackup, onCancel, }) {
    const [step, setStep] = useState("choose");
    const [error, setError] = useState(null);
    useInput((_input, key) => {
        if (key.escape)
            onCancel();
    }, { isActive: step === "choose" || step === "replace-warning" });
    async function replace(passphrase) {
        setStep("replacing");
        try {
            const result = await identity.replace({ passphrase });
            const carried = result.workspaces.length;
            onBackup({
                kind: "phrase",
                secret: result.phrase,
                note: `Floe made a new identity and gave it ${carried === 1 ? "your 1 workspace" : `your ${carried} workspaces`} on this machine.`,
            });
        }
        catch (err) {
            setError(messageOf(err));
            setStep("choose");
        }
    }
    switch (step) {
        case "choose":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Forgot your passphrase" }), error && _jsx(Text, { color: "red", children: error }), _jsx(SelectInput, { items: [
                            { label: "I have my recovery phrase", value: "restore" },
                            { label: "I don't have my recovery phrase", value: "replace" },
                            { label: "Go back to unlock", value: "back" },
                        ], onSelect: (item) => {
                            if (item.value === "back")
                                onCancel();
                            else
                                setStep(item.value === "restore" ? "restore" : "replace-warning");
                        } })] }));
        case "restore":
            return _jsx(Restore, { identity: identity, onCancel: () => setStep("choose") });
        case "replace-warning":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Start a new identity" }), _jsx(Text, { children: "Your old identity cannot be recovered. Floe will create a new one and give it the same workspaces on this machine. Work done before stays credited to the old identity." }), _jsx(SelectInput, { items: [
                            { label: "Create the new identity", value: "go" },
                            { label: "Go back", value: "back" },
                        ], onSelect: (item) => setStep(item.value === "go" ? "replace-passphrase" : "choose") })] }));
        case "replace-passphrase":
            return _jsx(NewPassphrase, { onDone: (p) => void replace(p) });
        case "replacing":
            return _jsx(Text, { children: "Creating your new identity and carrying your workspaces over\u2026" });
    }
}
