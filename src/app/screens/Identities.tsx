import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { IdentityError, type HeldIdentity, type IdentityClient } from "floe/identity";
import { messageOf } from "../../identity/identity-link.js";
import { deleteLeftoverFile, listLeftoverFiles, type LeftoverFile } from "../../migration/legacy-file.js";

/**
 * Your identities: every identity Floe holds (the current one and each copy set
 * aside by restore, replace or import), plus any identity file an earlier
 * console left in its own folder, so no identity on this machine is out of
 * sight. Each can be deleted for good. npubs stay hidden until asked for.
 */

type Row =
  | { readonly key: string; readonly kind: "floe"; readonly held: HeldIdentity }
  | { readonly key: string; readonly kind: "file"; readonly file: LeftoverFile };

type Phase =
  | { readonly name: "list" }
  | { readonly name: "confirm"; readonly row: Row }
  | { readonly name: "current-warn"; readonly held: HeldIdentity }
  | { readonly name: "current-revoke"; readonly held: HeldIdentity }
  | { readonly name: "current-final"; readonly held: HeldIdentity; readonly revoke: boolean }
  | { readonly name: "working" };

export function Identities({ identity, onBack }: { identity: IdentityClient; onBack: () => void }): JSX.Element {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showNpub, setShowNpub] = useState(false);
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "list" });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");

  async function load(withNpub = showNpub): Promise<void> {
    try {
      const { identities } = await identity.listIdentities({ include_npub: withNpub });
      const files = listLeftoverFiles();
      setRows([
        ...identities.map((held): Row => ({ key: `floe:${held.id}`, kind: "floe", held })),
        ...files.map((file): Row => ({ key: `file:${file.name}`, kind: "file", file })),
      ]);
    } catch (err) {
      setRows([]);
      setError(messageOf(err));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput(
    (input, key) => {
      if (phase.name === "list") {
        if (key.escape) onBack();
        if (input === "n") {
          const next = !showNpub;
          setShowNpub(next);
          void load(next);
        }
        const count = rows?.length ?? 0;
        if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelected((i) => Math.min(count - 1, i + 1));
        if (key.return && rows?.[selected]) {
          const row = rows[selected];
          setNotice(null);
          setError(null);
          setPhase(row.kind === "floe" && row.held.current ? { name: "current-warn", held: row.held } : { name: "confirm", row });
        }
      } else if (key.escape) {
        backToList();
      }
    },
    { isActive: phase.name !== "working" },
  );

  function backToList(message: string | null = null): void {
    setPassphrase("");
    setError(null);
    setNotice(message);
    setPhase({ name: "list" });
  }

  async function deleteRow(row: Row): Promise<void> {
    setPhase({ name: "working" });
    try {
      if (row.kind === "file") deleteLeftoverFile(row.file);
      else await identity.deleteIdentity({ id: row.held.id, confirm: true });
      await load();
      setSelected(0);
      backToList("Deleted. It is gone from this machine.");
    } catch (err) {
      await load();
      backToList(null);
      setError(refusal(err));
    }
  }

  async function deleteCurrent(held: HeldIdentity, revoke: boolean, secret?: string): Promise<void> {
    setPhase({ name: "working" });
    try {
      await identity.deleteIdentity({
        id: "current",
        confirm: true,
        revoke_admissions: revoke,
        ...(secret !== undefined ? { passphrase: secret } : {}),
      });
      // Floe now has no identity: the console returns to first run by itself.
    } catch (err) {
      setPassphrase("");
      setError(refusal(err));
      setPhase({ name: "current-final", held, revoke });
    }
  }

  const title = <Text bold>Your identities</Text>;

  if (phase.name === "working") {
    return (
      <Box flexDirection="column" gap={1}>
        {title}
        <Text>Deleting…</Text>
      </Box>
    );
  }

  if (phase.name === "confirm") {
    const { row } = phase;
    return (
      <Box flexDirection="column" gap={1}>
        {title}
        <Text>{describe(row)}</Text>
        <Text color="yellow">{confirmWording(row)}</Text>
        <SelectInput
          items={[
            { label: "Delete it for good", value: "delete" },
            { label: "Keep it", value: "keep" },
          ]}
          onSelect={(item) => (item.value === "delete" ? void deleteRow(row) : backToList())}
        />
      </Box>
    );
  }

  if (phase.name === "current-warn") {
    const { held } = phase;
    return (
      <Box flexDirection="column" gap={1}>
        {title}
        <Text>Delete {held.display_name ?? "this identity"}, the identity this machine uses now?</Text>
        <Text color="yellow">{currentWording(held)}</Text>
        <SelectInput
          items={[
            { label: "Continue", value: "go" },
            { label: "Keep it", value: "keep" },
          ]}
          onSelect={(item) => (item.value === "go" ? setPhase({ name: "current-revoke", held }) : backToList())}
        />
      </Box>
    );
  }

  if (phase.name === "current-revoke") {
    const { held } = phase;
    return (
      <Box flexDirection="column" gap={1}>
        {title}
        <Text>Should this identity also lose its access to the workspaces on this machine?</Text>
        <SelectInput
          items={[
            { label: "Yes, revoke its workspace access on this machine", value: "revoke" },
            { label: "No, leave its workspace access in place", value: "keep" },
          ]}
          onSelect={(item) => setPhase({ name: "current-final", held, revoke: item.value === "revoke" })}
        />
        <Text dimColor>Esc to go back.</Text>
      </Box>
    );
  }

  if (phase.name === "current-final") {
    const { held, revoke } = phase;
    const accessLine = revoke
      ? "Its access to this machine's workspaces will be revoked."
      : "Its access to this machine's workspaces stays in place.";
    if (held.protection === "passphrase") {
      return (
        <Box flexDirection="column" gap={1}>
          {title}
          <Text>{accessLine}</Text>
          <Text>Enter this identity's passphrase to delete it.</Text>
          <Box>
            <Text>Passphrase: </Text>
            <TextInput
              mask="*"
              value={passphrase}
              onChange={(v) => {
                setPassphrase(v);
                setError(null);
              }}
              onSubmit={() => void deleteCurrent(held, revoke, passphrase)}
            />
          </Box>
          {error && <Text color="red">{error}</Text>}
          <Text dimColor>Esc to keep it.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" gap={1}>
        {title}
        <Text>{accessLine}</Text>
        {error && <Text color="red">{error}</Text>}
        <SelectInput
          items={[
            { label: "Delete this identity for good", value: "delete" },
            { label: "Keep it", value: "keep" },
          ]}
          onSelect={(item) => (item.value === "delete" ? void deleteCurrent(held, revoke) : backToList())}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {title}
      <Text dimColor>Every identity kept on this machine. Deleting one is final: nothing keeps a copy.</Text>
      {rows === null ? (
        <Text dimColor>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text dimColor>Floe holds no identity on this machine.</Text>
      ) : (
        <Box flexDirection="column">
          {rows.map((row, i) => {
            const npub = showNpub ? (row.kind === "floe" ? row.held.npub : row.file.npub) : undefined;
            return (
              <Box key={row.key} flexDirection="column">
                <Text color={i === selected ? "cyan" : undefined}>
                  {i === selected ? "❯ " : "  "}
                  {describe(row)}
                </Text>
                {showNpub && <Text dimColor>{"    "}{npub ?? "npub not known"}</Text>}
              </Box>
            );
          })}
        </Box>
      )}
      {notice && <Text color="green">{notice}</Text>}
      {error && <Text color="red">{error}</Text>}
      <Text dimColor>↑/↓ select · Enter delete… · n {showNpub ? "hide" : "show"} npubs · Esc back</Text>
    </Box>
  );
}

function describe(row: Row): string {
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
  if (!h.readable) return `${where} · unreadable`;
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

function protectionText(protection: "passphrase" | "device" | null): string | null {
  if (protection === "passphrase") return "passphrase";
  if (protection === "device") return "this device";
  return null;
}

function confirmWording(row: Row): string {
  if (row.kind === "file") {
    return "This is an identity file an earlier console left here. Deleting it is final. It survives only through its backup, if you wrote it down.";
  }
  if (!row.held.readable) return "Floe cannot read this copy, so nothing more is known about it. Deleting it is final.";
  const backup = row.held.has_recovery_phrase === false ? "its secret key" : "its recovery phrase";
  return `Deleting it is final: Floe keeps no copy. It survives only through ${backup}, if you wrote it down.`;
}

function currentWording(held: HeldIdentity): string {
  const survives =
    held.has_recovery_phrase === false
      ? "It survives elsewhere only through its secret key (the nsec1… key Reveal shows); without that key it is gone forever."
      : "It survives elsewhere only through its recovery phrase; without those words it is gone forever.";
  return `This machine stops being this identity. Its key and its device key are removed. ${survives}`;
}

function refusal(err: unknown): string {
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

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
