import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError } from "floe/identity";
import { messageOf } from "../../identity/identity-link.js";
import { deleteLeftoverFile, listLeftoverFiles } from "../../migration/legacy-file.js";
export function Identities({ identity, onBack }) {
    const [rows, setRows] = useState(null);
    const [showNpub, setShowNpub] = useState(false);
    const [selected, setSelected] = useState(0);
    const [phase, setPhase] = useState({ name: "list" });
    const [notice, setNotice] = useState(null);
    const [error, setError] = useState(null);
    const [passphrase, setPassphrase] = useState("");
    async function load(withNpub = showNpub) {
        try {
            const { identities } = await identity.listIdentities({ include_npub: withNpub });
            const files = listLeftoverFiles();
            setRows([
                ...identities.map((held) => ({ key: `floe:${held.id}`, kind: "floe", held })),
                ...files.map((file) => ({ key: `file:${file.name}`, kind: "file", file })),
            ]);
            setShowNpub(withNpub);
        }
        catch (err) {
            setRows([]);
            setError(messageOf(err));
        }
    }
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useInput((input, key) => {
        if (phase.name === "list") {
            if (key.escape)
                onBack();
            if (input === "n")
                void load(!showNpub);
            const count = rows?.length ?? 0;
            if (key.upArrow)
                setSelected((i) => Math.max(0, i - 1));
            if (key.downArrow)
                setSelected((i) => Math.min(count - 1, i + 1));
            if (key.return && rows?.[selected]) {
                const row = rows[selected];
                setNotice(null);
                setError(null);
                setPhase(row.kind === "floe" && row.held.current ? { name: "current-warn", held: row.held } : { name: "confirm", row });
            }
        }
        else if (key.escape) {
            backToList();
        }
    }, { isActive: phase.name !== "working" });
    function backToList(message = null) {
        setPassphrase("");
        setError(null);
        setNotice(message);
        setPhase({ name: "list" });
    }
    async function deleteRow(row) {
        setPhase({ name: "working" });
        try {
            if (row.kind === "file")
                deleteLeftoverFile(row.file);
            else
                await identity.deleteIdentity({ id: row.held.id, confirm: true });
            await load();
            setSelected(0);
            backToList("Deleted. It is gone from this machine.");
        }
        catch (err) {
            await load();
            backToList(null);
            setError(refusal(err));
        }
    }
    async function deleteCurrent(held, revoke, secret) {
        setPhase({ name: "working" });
        try {
            await identity.deleteIdentity({
                id: "current",
                confirm: true,
                revoke_admissions: revoke,
                ...(secret !== undefined ? { passphrase: secret } : {}),
            });
            // Floe now has no identity: the console returns to first run by itself.
        }
        catch (err) {
            setPassphrase("");
            setError(refusal(err));
            setPhase({ name: "current-final", held, revoke });
        }
    }
    const title = _jsx(Text, { bold: true, children: "Your identities" });
    if (phase.name === "working") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsx(Text, { children: "Deleting\u2026" })] }));
    }
    if (phase.name === "confirm") {
        const { row } = phase;
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsx(Text, { children: describe(row) }), _jsx(Text, { color: "yellow", children: confirmWording(row) }), _jsx(SelectInput, { items: [
                        { label: "Delete it for good", value: "delete" },
                        { label: "Keep it", value: "keep" },
                    ], onSelect: (item) => (item.value === "delete" ? void deleteRow(row) : backToList()) })] }));
    }
    if (phase.name === "current-warn") {
        const { held } = phase;
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsxs(Text, { children: ["Delete ", held.display_name ?? "this identity", ", the identity this machine uses now?"] }), _jsx(Text, { color: "yellow", children: currentWording(held) }), _jsx(SelectInput, { items: [
                        { label: "Continue", value: "go" },
                        { label: "Keep it", value: "keep" },
                    ], onSelect: (item) => (item.value === "go" ? setPhase({ name: "current-revoke", held }) : backToList()) })] }));
    }
    if (phase.name === "current-revoke") {
        const { held } = phase;
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsx(Text, { children: "Should this identity also lose its access to the workspaces on this machine?" }), _jsx(SelectInput, { items: [
                        { label: "Yes, revoke its workspace access on this machine", value: "revoke" },
                        { label: "No, leave its workspace access in place", value: "keep" },
                    ], onSelect: (item) => setPhase({ name: "current-final", held, revoke: item.value === "revoke" }) }), _jsx(Text, { dimColor: true, children: "Esc to go back." })] }));
    }
    if (phase.name === "current-final") {
        const { held, revoke } = phase;
        const accessLine = revoke
            ? "Its access to this machine's workspaces will be revoked."
            : "Its access to this machine's workspaces stays in place.";
        if (held.protection === "passphrase") {
            return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsx(Text, { children: accessLine }), _jsx(Text, { children: "Enter this identity's passphrase to delete it." }), _jsxs(Box, { children: [_jsx(Text, { children: "Passphrase: " }), _jsx(TextInput, { mask: "*", value: passphrase, onChange: (v) => {
                                    setPassphrase(v);
                                    setError(null);
                                }, onSubmit: () => void deleteCurrent(held, revoke, passphrase) })] }), error && _jsx(Text, { color: "red", children: error }), _jsx(Text, { dimColor: true, children: "Esc to keep it." })] }));
        }
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsx(Text, { children: accessLine }), error && _jsx(Text, { color: "red", children: error }), _jsx(SelectInput, { items: [
                        { label: "Delete this identity for good", value: "delete" },
                        { label: "Keep it", value: "keep" },
                    ], onSelect: (item) => (item.value === "delete" ? void deleteCurrent(held, revoke) : backToList()) })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [title, _jsx(Text, { dimColor: true, children: "Every identity kept on this machine. Deleting one is final: nothing keeps a copy." }), rows === null ? (_jsx(Text, { dimColor: true, children: "Loading\u2026" })) : rows.length === 0 ? (_jsx(Text, { dimColor: true, children: "Floe holds no identity on this machine." })) : (_jsx(Box, { flexDirection: "column", children: rows.map((row, i) => {
                    const npub = showNpub ? (row.kind === "floe" ? row.held.npub : row.file.npub) : undefined;
                    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: i === selected ? "cyan" : undefined, children: [i === selected ? "❯ " : "  ", describe(row)] }), showNpub && _jsxs(Text, { dimColor: true, children: ["    ", npub ?? "npub not known"] })] }, row.key));
                }) })), notice && _jsx(Text, { color: "green", children: notice }), error && _jsx(Text, { color: "red", children: error }), _jsxs(Text, { dimColor: true, children: ["\u2191/\u2193 select \u00B7 Enter delete\u2026 \u00B7 n ", showNpub ? "hide" : "show", " npubs \u00B7 Esc back"] })] }));
}
function describe(row) {
    if (row.kind === "file") {
        const f = row.file;
        return [
            `Earlier console file ${f.name}`,
            f.createdAt ? `made ${day(f.createdAt)}` : null,
            protectionText(f.protection === "unknown" ? null : f.protection),
            "backup kind not known",
        ]
            .filter(Boolean)
            .join(" · ");
    }
    const h = row.held;
    const where = h.current ? "In use" : `Set aside ${h.set_aside_at ? day(h.set_aside_at) : ""}`.trim();
    if (!h.readable)
        return `${where} · unreadable`;
    return [
        where,
        h.display_name,
        h.created_at ? `made ${day(h.created_at)}` : null,
        protectionText(h.protection),
        h.has_recovery_phrase === null ? null : h.has_recovery_phrase ? "has a recovery phrase" : "no recovery phrase (secret key only)",
    ]
        .filter(Boolean)
        .join(" · ");
}
function protectionText(protection) {
    if (protection === "passphrase")
        return "passphrase";
    if (protection === "device")
        return "this device";
    return null;
}
function confirmWording(row) {
    if (row.kind === "file") {
        return "This is an identity file an earlier console left here. Deleting it is final. It survives only through its backup, if you wrote it down.";
    }
    if (!row.held.readable)
        return "Floe cannot read this copy, so nothing more is known about it. Deleting it is final.";
    const backup = row.held.has_recovery_phrase === false ? "its secret key" : "its recovery phrase";
    return `Deleting it is final: Floe keeps no copy. It survives only through ${backup}, if you wrote it down.`;
}
function currentWording(held) {
    const survives = held.has_recovery_phrase === false
        ? "It survives elsewhere only through its secret key (the nsec1… key Reveal shows); without that key it is gone forever."
        : "It survives elsewhere only through its recovery phrase; without those words it is gone forever.";
    return `This machine stops being this identity. Its key and its device key are removed. ${survives}`;
}
function refusal(err) {
    if (err instanceof IdentityError) {
        switch (err.code) {
            case "bus_unreachable":
                return "Floe could not reach its bus, so nothing was deleted. This identity is unchanged.";
            case "wrong_passphrase":
                return "That passphrase did not unlock this identity. Nothing was deleted.";
            case "identity_not_found":
                return "Floe no longer holds that identity.";
        }
    }
    return `Nothing was deleted: ${messageOf(err)}`;
}
function day(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
