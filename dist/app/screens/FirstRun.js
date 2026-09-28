import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { NameInput } from "../components/NameInput.js";
import { NewPassphrase } from "../components/NewPassphrase.js";
import { messageOf } from "../../identity/identity-link.js";
import { Restore } from "./Restore.js";
export function FirstRun({ identity, onBackup, }) {
    const [step, setStep] = useState("welcome");
    const [name, setName] = useState("");
    const [error, setError] = useState(null);
    async function create(passphrase) {
        setStep("creating");
        try {
            const { phrase } = await identity.create({ display_name: name, passphrase });
            onBackup({ kind: "phrase", secret: phrase });
        }
        catch (err) {
            setError(messageOf(err));
            setStep("welcome");
        }
    }
    switch (step) {
        case "welcome":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Welcome to Floe." }), _jsx(Text, { children: "Floe keeps one identity for you on this machine. Every Floe surface uses it." }), error && _jsx(Text, { color: "red", children: error }), _jsx(SelectInput, { items: [
                            { label: "Create a new identity", value: "create" },
                            { label: "Restore from a recovery phrase", value: "restore" },
                        ], onSelect: (item) => setStep(item.value === "create" ? "name" : "restore") })] }));
        case "name":
            return (_jsx(NameInput, { intro: "This is the name workspaces show for you.", onDone: (n) => {
                    setName(n);
                    setStep("passphrase");
                } }));
        case "passphrase":
            return _jsx(NewPassphrase, { onDone: (p) => void create(p) });
        case "creating":
            return _jsx(Text, { children: "Creating your identity\u2026" });
        case "restore":
            return _jsx(Restore, { identity: identity, onCancel: () => setStep("welcome") });
    }
}
