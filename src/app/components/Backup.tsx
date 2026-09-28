import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { SecretKind } from "floe/identity";

/**
 * The one way an identity's backup is shown: first run, reveal, and after a
 * replace. A recovery phrase is shown as numbered words to copy onto paper. An
 * identity made before recovery phrases has none, so its secret key (nsec) is
 * shown instead, and called what it is. The secret is only held while shown.
 */
export function BackupView({ kind, secret }: { kind: SecretKind; secret: string }): JSX.Element {
  if (kind === "nsec") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          This identity was made before Floe used recovery phrases, so it has no phrase. Its backup is
          this secret key. Anyone who has it can act as you.
        </Text>
        <Box borderStyle="round" paddingX={1}>
          <Text>{secret}</Text>
        </Box>
      </Box>
    );
  }
  const words = secret.trim().split(/\s+/);
  const rows: string[][] = [];
  for (let i = 0; i < words.length; i += 4) rows.push(words.slice(i, i + 4));
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {rows.map((row, i) => (
        <Text key={i}>
          {row.map((w, j) => `${String(i * 4 + j + 1).padStart(2, " ")}. ${w}`).join("    ")}
        </Text>
      ))}
    </Box>
  );
}

export interface Backup {
  readonly kind: SecretKind;
  readonly secret: string;
  /** Said above the backup, for example after a replace. */
  readonly note?: string;
}

/** Shown once after create or replace. The person confirms before moving on. */
export function BackupScreen({ backup, onDone }: { backup: Backup; onDone: () => void }): JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Write down your recovery phrase</Text>
      {backup.note && <Text>{backup.note}</Text>}
      <Text>
        These words are the only backup of this identity. Write them down, in order, and keep them
        somewhere safe. No one can recover them for you. You can see them again later in settings.
      </Text>
      <BackupView kind={backup.kind} secret={backup.secret} />
      <SelectInput items={[{ label: "I have written it down and stored it safely", value: "done" }]} onSelect={onDone} />
    </Box>
  );
}
