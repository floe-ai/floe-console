import { Box, Text } from "ink";
import { COMMANDS_NOT_CONFINED, type WorkspaceAccessRecord } from "../../workspace/access.js";

/**
 * Floe's one-time notice that this older Workspace's Floe Actors were given
 * tool access. The words are Floe's own. It stays while Floe keeps the record:
 * Floe 0.4 can mark it seen (workspace.notice.acknowledge), but the console
 * does not use that yet, so it does not pretend the notice was seen.
 */
export function ToolAccessNotice({ notice }: { notice: WorkspaceAccessRecord | null }): JSX.Element | null {
  if (!notice) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold>{notice.summary}</Text>
      <Text>{COMMANDS_NOT_CONFINED}</Text>
      <Text dimColor>Change the folders in g settings → Workspace folders and System access.</Text>
    </Box>
  );
}
