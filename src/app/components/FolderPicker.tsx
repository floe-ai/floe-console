import { useEffect, useMemo, useState } from "react";
import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Box, Text, useInput } from "ink";

/**
 * Browse this machine's folders and choose one. The list is read straight off
 * local disk with Node `fs`: the console runs on this machine, and the Bus's own
 * browse route is host-gated precisely so a client reads its own disk directly.
 * Used by first run (the workspace's folder) and by Workspace folders (adding one).
 */

interface Entry {
  readonly kind: "use" | "up" | "dir";
  readonly label: string;
  readonly path?: string;
}

export function FolderPicker({
  title,
  start = process.cwd(),
  hint,
  onChoose,
  onCancel,
}: {
  title: string;
  start?: string;
  /** Added to the key line, e.g. "Esc back". */
  hint?: string;
  onChoose: (path: string) => void;
  onCancel?: () => void;
}): JSX.Element {
  const [dir, setDir] = useState<string>(start);
  const [selected, setSelected] = useState(0);
  const entries = useMemo(() => listEntries(dir), [dir]);

  useEffect(() => {
    setSelected(0);
  }, [dir]);

  useInput((_input, key) => {
    if (key.escape) onCancel?.();
    if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelected((i) => Math.min(entries.length - 1, i + 1));
    if (key.return) {
      const entry = entries[Math.min(selected, entries.length - 1)];
      if (!entry) return;
      if (entry.kind === "use") onChoose(dir);
      else if (entry.path) setDir(entry.path);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text dimColor>{dir}</Text>
      <Box flexDirection="column">
        {entries.map((e, i) => (
          <Text key={`${e.kind}:${e.label}`} color={i === selected ? "cyan" : undefined}>
            {i === selected ? "❯ " : "  "}
            {e.kind === "use" ? <Text bold>{e.label}</Text> : e.label}
          </Text>
        ))}
      </Box>
      <Text dimColor>↑/↓ move · Enter open folder or use this one{hint ? ` · ${hint}` : ""}</Text>
    </Box>
  );
}

function listEntries(dir: string): Entry[] {
  const entries: Entry[] = [{ kind: "use", label: `Use this folder (${basename(dir) || dir})` }];
  const parent = dirname(dir);
  if (parent && parent !== dir) entries.push({ kind: "up", label: "..", path: parent });
  try {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
    for (const name of names) entries.push({ kind: "dir", label: `${name}/`, path: join(dir, name) });
  } catch {
    // An unreadable directory simply offers no children; the person can go up.
  }
  return entries;
}
