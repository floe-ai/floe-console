import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { IncorrectPassphraseError } from "../../identity/key-store.js";
/**
 * The key exists on this machine but is locked. Ask for the passphrase, decrypt
 * in memory, and authenticate. A wrong passphrase is shown against the field —
 * it is a local decryption failure, not a substrate error.
 */
export function Unlock({ npub, onUnlock, }) {
    const [passphrase, setPassphrase] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Unlock your identity" }), _jsx(Text, { dimColor: true, children: shortNpub(npub) }), _jsxs(Box, { children: [_jsx(Text, { children: "Passphrase: " }), _jsx(TextInput, { mask: "*", value: passphrase, onChange: (v) => {
                            setPassphrase(v);
                            setError(null);
                        }, onSubmit: async () => {
                            if (busy)
                                return;
                            setBusy(true);
                            try {
                                await onUnlock(passphrase);
                            }
                            catch (err) {
                                setError(err instanceof IncorrectPassphraseError
                                    ? "That passphrase did not unlock this identity."
                                    : err instanceof Error
                                        ? err.message
                                        : "Unlock failed.");
                                setPassphrase("");
                            }
                            finally {
                                setBusy(false);
                            }
                        } })] }), error && _jsx(Text, { color: "red", children: error })] }));
}
export function shortNpub(npub) {
    return npub.length > 20 ? `${npub.slice(0, 12)}…${npub.slice(-6)}` : npub;
}
