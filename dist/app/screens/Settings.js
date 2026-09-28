import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { loadIdentityFile } from "../../identity/store-fs.js";
import { revealRecoveryPhrase } from "../../identity/provision.js";
import { IncorrectPassphraseError } from "../../identity/key-store.js";
import { RecoveryPhraseView } from "../components/RecoveryPhrase.js";
import { shortNpub } from "./Unlock.js";
export function Settings({ npub, onClose }) {
    const protection = useMemo(() => loadIdentityFile()?.protection ?? "passphrase", []);
    const [phase, setPhase] = useState({ name: "menu" });
    const [passphrase, setPassphrase] = useState("");
    const [error, setError] = useState(null);
    useInput((_input, key) => {
        if (key.escape) {
            if (phase.name === "menu")
                onClose();
            else {
                setPassphrase("");
                setError(null);
                setPhase({ name: "menu" });
            }
        }
    });
    function reveal(withPassphrase) {
        try {
            setPhase({ name: "revealed", phrase: revealRecoveryPhrase(withPassphrase) });
        }
        catch (err) {
            setError(err instanceof IncorrectPassphraseError
                ? "That passphrase did not unlock this identity."
                : err instanceof Error
                    ? err.message
                    : "Could not reveal the recovery phrase.");
        }
    }
    const header = (_jsxs(Text, { children: [_jsx(Text, { bold: true, children: "Settings" }), " ", _jsxs(Text, { dimColor: true, children: ["\u00B7 ", shortNpub(npub)] })] }));
    if (phase.name === "revealed") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { bold: true, children: "Your recovery phrase" }), protection === "device" && (_jsx(Text, { color: "yellow", children: "This identity has no passphrase \u2014 the device is the only thing protecting it. This phrase is the only copy that survives this machine, so write it down and keep it safe." })), _jsx(Text, { children: "Write these words down, in order. This is a backup to keep, not an address to share." }), _jsx(RecoveryPhraseView, { phrase: phase.phrase }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
    }
    if (phase.name === "passphrase") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { children: "Enter your passphrase to reveal your recovery phrase." }), _jsxs(Box, { children: [_jsx(Text, { children: "Passphrase: " }), _jsx(TextInput, { mask: "*", value: passphrase, onChange: (v) => {
                                setPassphrase(v);
                                setError(null);
                            }, onSubmit: () => reveal(passphrase) })] }), error && _jsx(Text, { color: "red", children: error }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
    }
    // menu
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(SelectInput, { items: [{ label: "Reveal recovery phrase (back up this identity)", value: "reveal" }], onSelect: () => {
                    if (protection === "device")
                        reveal("");
                    else
                        setPhase({ name: "passphrase" });
                } }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
}
