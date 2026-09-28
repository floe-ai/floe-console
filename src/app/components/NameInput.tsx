import { useState } from "react";
import { userInfo } from "node:os";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

/** The name this identity goes by in workspaces. Defaults to the OS user name. */
export function NameInput({ intro, onDone }: { intro: string; onDone: (name: string) => void }): JSX.Element {
  const [name, setName] = useState(defaultUserName());
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Your name</Text>
      <Text>{intro}</Text>
      <Box>
        <Text>Name: </Text>
        <TextInput value={name} onChange={setName} onSubmit={() => onDone(name.trim() || defaultUserName())} />
      </Box>
    </Box>
  );
}

function defaultUserName(): string {
  try {
    return userInfo().username || "me";
  } catch {
    return "me";
  }
}
