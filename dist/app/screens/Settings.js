import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError } from "floe/identity";
import { BackupView } from "../components/Backup.js";
import { Identities } from "./Identities.js";
import { messageOf } from "../../identity/identity-link.js";
export function Settings({ identity, onClose }) {
    const [phase, setPhase] = useState({ name: "menu" });
    const [passphrase, setPassphrase] = useState("");
    const [error, setError] = useState(null);
    const state = identity.state;
    const device = state.kind !== "none" && state.protection === "device";
    useInput((_input, key) => {
        if (!key.escape)
            return;
        if (phase.name === "menu")
            onClose();
        else {
            setPassphrase("");
            setError(null);
            setPhase({ name: "menu" });
        }
    }, { isActive: phase.name !== "identities" });
    async function reveal(args) {
        try {
            const { secret_kind, secret } = await identity.reveal(args);
            setPhase({ name: "revealed", kind: secret_kind, secret });
        }
        catch (err) {
            setPassphrase("");
            setError(err instanceof IdentityError && err.code === "wrong_passphrase"
                ? "That passphrase did not unlock this identity."
                : messageOf(err));
        }
    }
    const header = _jsxs(Text, { bold: true, children: ["Settings", state.kind !== "none" ? ` · ${state.display_name}` : ""] });
    if (phase.name === "identities") {
        return _jsx(Identities, { identity: identity, onBack: () => setPhase({ name: "menu" }) });
    }
    if (phase.name === "revealed") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { bold: true, children: phase.kind === "phrase" ? "Your recovery phrase" : "Your secret key" }), device && (_jsx(Text, { color: "yellow", children: "This identity has no passphrase: the device is the only thing protecting it. This backup is the only copy that survives this machine, so write it down and keep it safe." })), _jsx(Text, { children: "Write it down. It is a backup to keep, not an address to share." }), _jsx(BackupView, { kind: phase.kind, secret: phase.secret }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
    }
    if (phase.name === "confirm") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { children: "This identity is guarded only by this device. Anyone who can use this computer as you can see its backup. Show it now?" }), error && _jsx(Text, { color: "red", children: error }), _jsx(SelectInput, { items: [
                        { label: "Yes, show my backup", value: "yes" },
                        { label: "No, go back", value: "no" },
                    ], onSelect: (item) => (item.value === "yes" ? void reveal({ confirm: true }) : setPhase({ name: "menu" })) })] }));
    }
    if (phase.name === "passphrase") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { children: "Enter your passphrase to reveal your backup." }), _jsxs(Box, { children: [_jsx(Text, { children: "Passphrase: " }), _jsx(TextInput, { mask: "*", value: passphrase, onChange: (v) => {
                                setPassphrase(v);
                                setError(null);
                            }, onSubmit: () => void reveal({ passphrase }) })] }), error && _jsx(Text, { color: "red", children: error }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(SelectInput, { items: [
                    {
                        label: `Reveal your backup (${state.kind !== "none" && state.secret_kind === "nsec" ? "secret key" : "recovery phrase"})`,
                        value: "reveal",
                    },
                    { label: "Your identities", value: "identities" },
                ], onSelect: (item) => setPhase(item.value === "identities" ? { name: "identities" } : device ? { name: "confirm" } : { name: "passphrase" }) }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
}
