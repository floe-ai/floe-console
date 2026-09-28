import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
/**
 * The one way an identity's backup is shown: first run, reveal, and after a
 * replace. A recovery phrase is shown as numbered words to copy onto paper. An
 * identity made before recovery phrases has none, so its secret key (nsec) is
 * shown instead, and called what it is. The secret is only held while shown.
 */
export function BackupView({ kind, secret }) {
    if (kind === "nsec") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { children: "This identity was made before Floe used recovery phrases, so it has no phrase. Its backup is this secret key. Anyone who has it can act as you." }), _jsx(Box, { borderStyle: "round", paddingX: 1, children: _jsx(Text, { children: secret }) })] }));
    }
    const words = secret.trim().split(/\s+/);
    const rows = [];
    for (let i = 0; i < words.length; i += 4)
        rows.push(words.slice(i, i + 4));
    return (_jsx(Box, { flexDirection: "column", borderStyle: "round", paddingX: 1, children: rows.map((row, i) => (_jsx(Text, { children: row.map((w, j) => `${String(i * 4 + j + 1).padStart(2, " ")}. ${w}`).join("    ") }, i))) }));
}
/** Shown once after create or replace. The person confirms before moving on. */
export function BackupScreen({ backup, onDone }) {
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Write down your recovery phrase" }), backup.note && _jsx(Text, { children: backup.note }), _jsx(Text, { children: "These words are the only backup of this identity. Write them down, in order, and keep them somewhere safe. No one can recover them for you. You can see them again later in settings." }), _jsx(BackupView, { kind: backup.kind, secret: backup.secret }), _jsx(SelectInput, { items: [{ label: "I have written it down and stored it safely", value: "done" }], onSelect: onDone })] }));
}
