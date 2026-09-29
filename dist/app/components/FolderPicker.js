import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Box, Text, useInput } from "ink";
export function FolderPicker({ title, start = process.cwd(), hint, onChoose, onCancel, }) {
    const [dir, setDir] = useState(start);
    const [selected, setSelected] = useState(0);
    const entries = useMemo(() => listEntries(dir), [dir]);
    useEffect(() => {
        setSelected(0);
    }, [dir]);
    useInput((_input, key) => {
        if (key.escape)
            onCancel?.();
        if (key.upArrow)
            setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow)
            setSelected((i) => Math.min(entries.length - 1, i + 1));
        if (key.return) {
            const entry = entries[Math.min(selected, entries.length - 1)];
            if (!entry)
                return;
            if (entry.kind === "use")
                onChoose(dir);
            else if (entry.path)
                setDir(entry.path);
        }
    });
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: title }), _jsx(Text, { dimColor: true, children: dir }), _jsx(Box, { flexDirection: "column", children: entries.map((e, i) => (_jsxs(Text, { color: i === selected ? "cyan" : undefined, children: [i === selected ? "❯ " : "  ", e.kind === "use" ? _jsx(Text, { bold: true, children: e.label }) : e.label] }, `${e.kind}:${e.label}`))) }), _jsxs(Text, { dimColor: true, children: ["\u2191/\u2193 move \u00B7 Enter open folder or use this one", hint ? ` · ${hint}` : ""] })] }));
}
function listEntries(dir) {
    const entries = [{ kind: "use", label: `Use this folder (${basename(dir) || dir})` }];
    const parent = dirname(dir);
    if (parent && parent !== dir)
        entries.push({ kind: "up", label: "..", path: parent });
    try {
        const names = readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith("."))
            .map((d) => d.name)
            .sort((a, b) => a.localeCompare(b));
        for (const name of names)
            entries.push({ kind: "dir", label: `${name}/`, path: join(dir, name) });
    }
    catch {
        // An unreadable directory simply offers no children; the person can go up.
    }
    return entries;
}
