import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { Workspace } from "floe/identity";

/**
 * The identity is in several workspaces and named none, so Floe
 * returned the list to choose from. The human picks from names the substrate
 * gave us — never a workspace id they typed.
 */
export function SelectWorkspace({
  workspaces,
  onSelect,
}: {
  workspaces: readonly Workspace[];
  onSelect: (workspaceId: string) => Promise<void>;
}): JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Choose a workspace</Text>
      <Text>Your identity is in more than one. Each session acts in exactly one.</Text>
      <SelectInput
        items={workspaces.map((w) => ({ label: w.name, value: w.workspace_id }))}
        onSelect={(item) => {
          void onSelect(item.value);
        }}
      />
    </Box>
  );
}
