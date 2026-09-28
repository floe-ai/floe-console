import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { IdentityError } from "floe/identity";
import { messageOf } from "../../identity/identity-link.js";
import { ForgotPassphrase } from "./ForgotPassphrase.js";
/**
 * A passphrase identity that Floe has locked. Only ever shown for
 * `protection: "passphrase"`; a device identity unlocks by itself. The way out,
 * "Forgot passphrase", is always on screen, so this can never be a trap.
 */
export function Unlock({ identity, onBackup, }) {
    const [passphrase, setPassphrase] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [forgot, setForgot] = useState(false);
    useInput((_input, key) => {
        if (key.escape && !busy)
            setForgot(true);
    }, { isActive: !forgot });
    if (forgot) {
        return _jsx(ForgotPassphrase, { identity: identity, onBackup: onBackup, onCancel: () => setForgot(false) });
    }
    const name = identity.state.kind === "none" ? "" : identity.state.display_name;
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsxs(Text, { bold: true, children: ["Unlock your identity", name ? ` (${name})` : ""] }), _jsxs(Box, { children: [_jsx(Text, { children: "Passphrase: " }), _jsx(TextInput, { mask: "*", value: passphrase, onChange: (v) => {
                            setPassphrase(v);
                            setError(null);
                        }, onSubmit: async () => {
                            if (busy)
                                return;
                            setBusy(true);
                            try {
                                await identity.unlock(passphrase);
                            }
                            catch (err) {
                                setError(err instanceof IdentityError && err.code === "wrong_passphrase"
                                    ? "That passphrase did not unlock this identity."
                                    : messageOf(err));
                                setPassphrase("");
                                setBusy(false);
                            }
                        } })] }), error && _jsx(Text, { color: "red", children: error }), _jsx(Text, { dimColor: true, children: "Forgot your passphrase? Press Esc." })] }));
}
