import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { userInfo } from "node:os";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
/** The name this identity goes by in workspaces. Defaults to the OS user name. */
export function NameInput({ intro, onDone }) {
    const [name, setName] = useState(defaultUserName());
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Your name" }), _jsx(Text, { children: intro }), _jsxs(Box, { children: [_jsx(Text, { children: "Name: " }), _jsx(TextInput, { value: name, onChange: setName, onSubmit: () => onDone(name.trim() || defaultUserName()) })] })] }));
}
function defaultUserName() {
    try {
        return userInfo().username || "me";
    }
    catch {
        return "me";
    }
}
