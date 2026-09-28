import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError } from "floe/identity";
import { NameInput } from "../components/NameInput.js";
import { NewPassphrase } from "../components/NewPassphrase.js";
import { messageOf } from "../../identity/identity-link.js";
import { deleteLegacyFile, setAsideLegacyFile } from "../../migration/legacy-file.js";
export function Migrate({ identity, legacy, onBackup, onDone, }) {
    const [step, setStep] = useState({ name: "offer" });
    const [passphrase, setPassphrase] = useState("");
    const floeHasIdentity = identity.state.kind !== "none";
    const floeName = identity.state.kind === "none" ? "" : identity.state.display_name;
    useInput((_input, key) => {
        if (step.name === "passphrase" && key.escape)
            setAside("You said you do not know its passphrase.");
        if (step.name === "done" && key.return)
            onDone();
    });
    function setAside(why) {
        try {
            const target = setAsideLegacyFile(legacy);
            setStep({ name: "done", message: `${why} The earlier console's file was set aside as ${target}. Nothing was deleted.` });
        }
        catch (error) {
            setStep({ name: "unreadable", message: `Could not set the file aside: ${messageOf(error)}` });
        }
    }
    async function bringIn(args) {
        setStep({ name: "working" });
        try {
            const result = await identity.importLegacy({ file: legacy.contents, ...args });
            deleteLegacyFile(legacy);
            if (result.already_present) {
                setStep({ name: "done", message: "This identity was already in Floe. The earlier console's copy has been removed." });
            }
            else if (result.secret_kind === "nsec") {
                setStep({ name: "no-phrase" });
            }
            else {
                setStep({ name: "done", message: "Your identity is now kept by Floe. The earlier console's file has been removed." });
            }
        }
        catch (error) {
            const code = error instanceof IdentityError ? error.code : "";
            if (code === "wrong_passphrase") {
                setPassphrase("");
                setStep({ name: "passphrase", error: "That passphrase did not open the file." });
            }
            else if (code === "display_name_required")
                setStep({ name: "display-name", args });
            else if (code === "identity_exists")
                setStep({ name: "other-identity", args });
            else
                setStep({ name: "unreadable", message: messageOf(error) });
        }
    }
    async function replaceWithPhrase(newPassphrase) {
        setStep({ name: "working" });
        try {
            const result = await identity.replace({ passphrase: newPassphrase });
            onBackup({
                kind: "phrase",
                secret: result.phrase,
                note: "Floe made a new identity with a recovery phrase and gave it the same workspaces on this machine. Work done before stays credited to the old identity.",
            });
            onDone();
        }
        catch (error) {
            setStep({ name: "unreadable", message: messageOf(error) });
        }
    }
    function start() {
        if (legacy.protection === "device")
            void bringIn({ passphrase: "" });
        else
            setStep({ name: "passphrase" });
    }
    switch (step.name) {
        case "offer":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "You have an identity from an earlier console" }), _jsx(Text, { children: floeHasIdentity
                            ? `Floe now keeps your identity for every surface, and it already has one on this machine${floeName ? ` (${floeName})` : ""}. The earlier console kept its own.`
                            : "Floe now keeps your identity for every surface. The earlier console kept its own. Bring it into Floe, or start fresh." }), _jsx(SelectInput, { items: floeHasIdentity
                            ? [
                                { label: "Bring the earlier console's identity into Floe", value: "import" },
                                { label: "Keep Floe's identity and set the earlier file aside", value: "aside" },
                            ]
                            : [
                                { label: "Bring it into Floe", value: "import" },
                                { label: "Start fresh (the earlier file is set aside, not deleted)", value: "aside" },
                            ], onSelect: (item) => (item.value === "import" ? start() : setAside("You chose not to bring it in.")) })] }));
        case "passphrase":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "The earlier console's passphrase" }), _jsx(Text, { children: "Enter the passphrase you used in the earlier console. Floe opens the file with it." }), _jsxs(Box, { children: [_jsx(Text, { children: "Passphrase: " }), _jsx(TextInput, { mask: "*", value: passphrase, onChange: setPassphrase, onSubmit: () => void bringIn({ passphrase }) })] }), step.error && _jsx(Text, { color: "red", children: step.error }), _jsx(Text, { dimColor: true, children: "Don't know this passphrase? Press Esc to set the file aside and carry on." })] }));
        case "display-name":
            return (_jsx(NameInput, { intro: "Floe does not know a name for this identity yet. Workspaces will show this name.", onDone: (name) => void bringIn({ ...step.args, display_name: name }) }));
        case "other-identity":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Two different identities" }), _jsxs(Text, { children: ["Floe already has identity A", floeName ? ` (${floeName})` : "", ". The earlier console's file has a different one, B. Keep A, or replace it with B? The one not kept is set aside, never deleted."] }), _jsx(SelectInput, { items: [
                            { label: "Keep A, the identity Floe has", value: "keep" },
                            { label: "Replace it with B, the earlier console's identity", value: "replace" },
                        ], onSelect: (item) => item.value === "keep"
                            ? setAside("You kept Floe's identity.")
                            : void bringIn({ ...step.args, replace_existing: true }) })] }));
        case "unreadable":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { color: "red", children: step.message }), _jsx(SelectInput, { items: [
                            { label: "Try again", value: "retry" },
                            { label: "Set the earlier file aside and carry on", value: "aside" },
                        ], onSelect: (item) => (item.value === "retry" ? setStep({ name: "offer" }) : setAside("It could not be brought in.")) })] }));
        case "no-phrase":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Your identity is now kept by Floe" }), _jsx(Text, { children: "This identity was made before Floe used recovery phrases, so it has no phrase. Its backup is its secret key (nsec), which you can reveal in settings. You can keep it, or start a new identity with a phrase that keeps the same workspaces on this machine." }), _jsx(SelectInput, { items: [
                            { label: "Keep it", value: "keep" },
                            { label: "Start a new identity with a recovery phrase", value: "replace" },
                        ], onSelect: (item) => item.value === "keep"
                            ? setStep({ name: "done", message: "Kept. The earlier console's file has been removed." })
                            : setStep({ name: "replace-passphrase" }) })] }));
        case "replace-passphrase":
            return _jsx(NewPassphrase, { onDone: (p) => void replaceWithPhrase(p) });
        case "working":
            return _jsx(Text, { children: "Working\u2026" });
        case "done":
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { children: step.message }), _jsx(Text, { dimColor: true, children: "Enter to continue." })] }));
    }
}
