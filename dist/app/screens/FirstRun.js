import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { generateRecoveryPhrase, isValidRecoveryPhrase } from "../../identity/mnemonic.js";
import { provisionIdentity } from "../../identity/provision.js";
import { RecoveryPhraseView } from "../components/RecoveryPhrase.js";
const MIN_PASSPHRASE_LENGTH = 8;
export function FirstRun({ onProvisioned, }) {
    const [step, setStep] = useState("welcome");
    const [mode, setMode] = useState("create");
    const [phrase, setPhrase] = useState("");
    const [importText, setImportText] = useState("");
    const [importError, setImportError] = useState(null);
    const [passphrase, setPassphrase] = useState("");
    const [passphrase2, setPassphrase2] = useState("");
    const [passError, setPassError] = useState(null);
    const [provisionError, setProvisionError] = useState(null);
    const [provisioned, setProvisioned] = useState(null);
    function provision(finalPhrase, finalPassphrase) {
        setStep("provisioning");
        try {
            const { secretKey, npub } = provisionIdentity(finalPhrase, finalPassphrase);
            if (mode === "create") {
                // Hold the key back until the person confirms they have the phrase; the
                // identity is on disk, but we do not leave first run until backup is done.
                setProvisioned({ secretKey, npub });
                setStep("show-phrase");
            }
            else {
                onProvisioned(secretKey, npub);
            }
        }
        catch (err) {
            setProvisionError(err instanceof Error ? err.message : "Could not store the identity.");
        }
    }
    if (step === "welcome") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Welcome to Floe." }), _jsx(Text, { children: "Floe proves who you are with a key only this machine holds. It never leaves this machine, and the substrate only ever sees its public half." }), _jsx(SelectInput, { items: [
                        { label: "Create a new identity", value: "create" },
                        { label: "Restore from a recovery phrase", value: "restore" },
                    ], onSelect: (item) => {
                        if (item.value === "create") {
                            setMode("create");
                            setPhrase(generateRecoveryPhrase());
                            setStep("passphrase");
                        }
                        else {
                            setMode("restore");
                            setStep("import");
                        }
                    } })] }));
    }
    if (step === "import") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Restore from a recovery phrase" }), _jsx(Text, { children: "Type or paste your 12 or 24 word phrase, separated by spaces." }), _jsxs(Box, { children: [_jsx(Text, { children: "> " }), _jsx(TextInput, { value: importText, onChange: (v) => {
                                setImportText(v);
                                setImportError(null);
                            }, onSubmit: () => {
                                if (!isValidRecoveryPhrase(importText)) {
                                    setImportError("That is not a valid recovery phrase (check spelling and word order).");
                                    return;
                                }
                                setPhrase(importText);
                                setStep("passphrase");
                            } })] }), importError && _jsx(Text, { color: "red", children: importError })] }));
    }
    if (step === "passphrase" || step === "passphrase-confirm") {
        const first = step === "passphrase";
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Protect this identity" }), _jsx(Text, { children: "A passphrase encrypts your key on this machine; you will enter it to unlock the console." }), _jsx(Text, { color: "yellow", children: "Leave it blank and this device is your authentication \u2014 anyone with access to this machine is this identity." }), _jsxs(Box, { children: [_jsx(Text, { children: first ? "Passphrase (blank = device auth): " : "Confirm passphrase:               " }), _jsx(TextInput, { mask: "*", value: first ? passphrase : passphrase2, onChange: first ? setPassphrase : setPassphrase2, onSubmit: () => {
                                if (first) {
                                    if (passphrase.length === 0) {
                                        setPassError(null);
                                        provision(phrase, "");
                                        return;
                                    }
                                    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
                                        setPassError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters, or leave it blank.`);
                                        return;
                                    }
                                    setPassError(null);
                                    setStep("passphrase-confirm");
                                    return;
                                }
                                if (passphrase2 !== passphrase) {
                                    setPassError("The passphrases do not match.");
                                    setPassphrase2("");
                                    setStep("passphrase");
                                    return;
                                }
                                provision(phrase, passphrase);
                            } })] }), passError && _jsx(Text, { color: "red", children: passError })] }));
    }
    if (step === "show-phrase") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Write down your recovery phrase" }), _jsx(Text, { children: "These words are the only backup of this identity. Write them down, in order, on paper and keep them somewhere safe. No one \u2014 not Floe, not anyone else \u2014 can recover them for you. You can see them again later in settings." }), _jsx(RecoveryPhraseView, { phrase: phrase }), _jsx(SelectInput, { items: [{ label: "I have written it down and stored it safely", value: "done" }], onSelect: () => {
                        if (provisioned)
                            onProvisioned(provisioned.secretKey, provisioned.npub);
                    } })] }));
    }
    // provisioning
    return (_jsx(Box, { flexDirection: "column", children: provisionError ? (_jsx(Text, { color: "red", children: provisionError })) : (_jsx(Text, { children: "Creating your identity\u2026" })) }));
}
