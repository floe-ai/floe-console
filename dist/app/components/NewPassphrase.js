import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
const MIN_PASSPHRASE_LENGTH = 8;
/**
 * Choosing a passphrase for an identity: create, restore and replace all use
 * this. Blank is a real choice, and it is stated plainly.
 */
export function NewPassphrase({ intro, onDone, }) {
    const [first, setFirst] = useState("");
    const [second, setSecond] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState(null);
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Protect this identity" }), _jsx(Text, { children: intro ?? "A passphrase encrypts your identity on this machine. You enter it to unlock Floe." }), _jsx(Text, { color: "yellow", children: "Leave it blank and this device protects it instead: anyone who can use this computer as you can act as you, and the recovery phrase is the only copy that survives this machine." }), _jsxs(Box, { children: [_jsx(Text, { children: confirming ? "Confirm passphrase:               " : "Passphrase (blank = this device): " }), _jsx(TextInput, { mask: "*", value: confirming ? second : first, onChange: (v) => {
                            setError(null);
                            (confirming ? setSecond : setFirst)(v);
                        }, onSubmit: () => {
                            if (!confirming) {
                                if (first.length === 0)
                                    return onDone("");
                                if (first.length < MIN_PASSPHRASE_LENGTH) {
                                    setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters, or leave it blank.`);
                                    return;
                                }
                                setConfirming(true);
                                return;
                            }
                            if (second !== first) {
                                setError("The passphrases do not match. Start again.");
                                setFirst("");
                                setSecond("");
                                setConfirming(false);
                                return;
                            }
                            onDone(first);
                        } })] }), error && _jsx(Text, { color: "red", children: error })] }));
}
