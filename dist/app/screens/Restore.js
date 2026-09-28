import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError } from "floe/identity";
import { NewPassphrase } from "../components/NewPassphrase.js";
import { NameInput } from "../components/NameInput.js";
import { messageOf } from "../../identity/identity-link.js";
export function Restore({ identity, onCancel }) {
    const [step, setStep] = useState({ name: "phrase" });
    const [phrase, setPhrase] = useState("");
    const [passphrase, setPassphrase] = useState("");
    useInput((_input, key) => {
        if (key.escape && step.name !== "working")
            onCancel();
        if (key.return && step.name === "problem")
            setStep({ name: "phrase" });
    });
    async function run(args) {
        setStep({ name: "working" });
        try {
            await identity.restore({ phrase, ...args });
        }
        catch (error) {
            if (error instanceof IdentityError && error.code === "invalid_phrase") {
                setStep({ name: "phrase", error: error.message });
            }
            else if (error instanceof IdentityError && error.code === "display_name_required") {
                setStep({ name: "display-name" });
            }
            else if (error instanceof IdentityError && error.code === "identity_exists") {
                setStep({ name: "other-identity", floeName: floeDisplayName(identity) });
            }
            else {
                setStep({ name: "problem", message: messageOf(error) });
            }
        }
    }
    switch (step.name) {
        case "phrase":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Restore from your recovery phrase" }), _jsx(Text, { children: "Type your 12 or 24 words, in order, separated by spaces." }), _jsxs(Box, { children: [_jsx(Text, { children: "> " }), _jsx(TextInput, { value: phrase, onChange: setPhrase, onSubmit: () => setStep({ name: "passphrase" }) })] }), step.error && _jsx(Text, { color: "red", children: step.error }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
        case "passphrase":
            return (_jsx(NewPassphrase, { intro: "Choose a passphrase for this identity on this machine. It does not have to match any earlier one.", onDone: (p) => {
                    setPassphrase(p);
                    void run({ passphrase: p });
                } }));
        case "display-name":
            return (_jsx(NameInput, { intro: "Floe does not know a name for this identity yet. Workspaces will show this name.", onDone: (name) => void run({ passphrase, display_name: name }) }));
        case "other-identity":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "This phrase belongs to a different identity" }), _jsxs(Text, { children: ["Floe on this machine already has an identity", step.floeName ? ` (${step.floeName})` : "", ". This phrase restores a different one. Keep the one Floe has, or replace it with the one from this phrase? Floe sets the replaced identity aside; nothing is deleted."] }), _jsx(SelectInput, { items: [
                            { label: "Keep the identity Floe has", value: "keep" },
                            { label: "Replace it with the identity from this phrase", value: "replace" },
                        ], onSelect: (item) => {
                            if (item.value === "keep")
                                onCancel();
                            else
                                void run({ passphrase, replace_existing: true });
                        } })] }));
        case "problem":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { color: "red", children: step.message }), _jsx(Text, { dimColor: true, children: "Enter to try again \u00B7 Esc to go back" })] }));
        case "working":
            return _jsx(Text, { children: "Restoring your identity\u2026" });
    }
}
function floeDisplayName(identity) {
    const state = identity.state;
    return state.kind === "none" ? "" : state.display_name;
}
