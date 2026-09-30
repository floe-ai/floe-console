import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { COMMANDS_NOT_CONFINED, type ChangeOutcome, type WorkspaceAccessRecord } from "../../workspace/access.js";

/**
 * Floe's notices about access in this Workspace that the person has not seen
 * yet, newest first, in Floe's own words. `m` tells Floe the top one was seen;
 * it leaves when Floe pushes that it is seen, on every surface the person uses.
 */
export function Notices({
  notices,
  canMarkSeen,
  onMarkSeen,
}: {
  notices: readonly WorkspaceAccessRecord[];
  /** False when Floe did not say who is looking, so seen cannot be recorded. */
  canMarkSeen: boolean;
  onMarkSeen: (recordId: string) => Promise<ChangeOutcome>;
}): JSX.Element | null {
  const [marking, setMarking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const top = notices[0];

  useInput((input) => {
    if (input !== "m" || !top || !canMarkSeen || marking) return;
    setMarking(top.record_id);
    setProblem(null);
    void onMarkSeen(top.record_id)
      .then((outcome) => setProblem(outcome.kind === "refused" ? outcome.message : null))
      .catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)))
      .finally(() => setMarking(null));
  });

  if (!top) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      {notices.map((notice) => (
        <Box key={notice.record_id} flexDirection="column">
          <Text bold>{notice.summary}</Text>
          {notice.kind === "tool_access_given" && (
            <>
              <Text>{COMMANDS_NOT_CONFINED}</Text>
              <Text dimColor>Change the folders in g settings → Workspace folders and System access.</Text>
            </>
          )}
        </Box>
      ))}
      {problem && <Text color="red">{problem}</Text>}
      {marking ? (
        <Text dimColor>Marking it seen…</Text>
      ) : (
        canMarkSeen && <Text dimColor>m mark {notices.length > 1 ? "the first" : "it"} seen</Text>
      )}
    </Box>
  );
}
