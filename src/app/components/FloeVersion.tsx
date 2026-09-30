import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { describeTurn, type SwitchState, type VersionSwitch } from "../../version/version-switch.js";

/**
 * Floe's own version note, and beside it the offer to switch to the newer Floe
 * this console ships. Keys work only while `keys` is true (the main screen with
 * nothing being typed), and the hints show only then.
 */
export function FloeVersion({
  note,
  versionSwitch,
  keys,
  workspaceId,
  workspaceNames,
}: {
  note: string | null;
  versionSwitch: VersionSwitch;
  keys: boolean;
  workspaceId: string | null;
  workspaceNames: ReadonlyMap<string, string>;
}): JSX.Element | null {
  const [state, setState] = useState<SwitchState>(() => versionSwitch.getState());
  useEffect(() => {
    setState(versionSwitch.getState());
    return versionSwitch.subscribe(setState);
  }, [versionSwitch]);
  const offered = note !== null && versionSwitch.offered();

  useInput(
    (input, key) => {
      if (state.kind === "idle" || state.kind === "problem") {
        if (input === "u" && offered) void versionSwitch.start();
        if (key.escape && state.kind === "problem") versionSwitch.cancel();
      } else if (state.kind === "work_running") {
        if (input === "x") void versionSwitch.interrupt();
        if (input === "w") versionSwitch.wait(workspaceId);
        if (key.escape) versionSwitch.cancel();
      } else if (state.kind === "waiting") {
        if (input === "u") void versionSwitch.start();
        if (key.escape) versionSwitch.cancel();
      } else if (state.kind === "switched") {
        if (key.escape) versionSwitch.cancel();
      }
    },
    { isActive: keys },
  );

  const turns = (list: readonly { workspace_id: string; endpoint_id: string; name: string | null }[]) =>
    list.map((turn) => <Text key={turn.endpoint_id}>  · {describeTurn(turn, workspaceNames)}</Text>);

  switch (state.kind) {
    case "switching":
      return (
        <Text color="yellow">
          <Spinner type="dots" /> {state.interrupting ? "Interrupting the work in progress and switching" : "Switching"} to
          the newer Floe…
        </Text>
      );
    case "work_running":
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">{state.message}</Text>
          {turns(state.running)}
          {keys && <Text dimColor>x interrupt it and switch · w wait for it to finish · Esc cancel</Text>}
        </Box>
      );
    case "waiting":
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          {state.watched.length > 0 && (
            <>
              <Text>Waiting for this to finish, then switching:</Text>
              {turns(state.watched)}
            </>
          )}
          {state.unwatched.length > 0 && (
            <>
              <Text>Floe does not tell this console when work in another workspace finishes:</Text>
              {turns(state.unwatched)}
            </>
          )}
          {keys && (
            <Text dimColor>
              {state.unwatched.length > 0 ? "u try again now · " : ""}Esc stop waiting
            </Text>
          )}
        </Box>
      );
    case "switched":
      return (
        <Box flexDirection="column">
          <Text color="green">Floe {state.to} is now running{state.from ? ` (it was ${state.from})` : ""}.</Text>
          {state.interrupted.length > 0 && (
            <>
              <Text>Interrupted:</Text>
              {turns(state.interrupted)}
            </>
          )}
          {note && <Text color="yellow">{note}</Text>}
        </Box>
      );
    case "problem":
      return (
        <Box flexDirection="column">
          {note && <Text color="yellow">{note}</Text>}
          <Text color="red">Floe was not switched: {state.message}</Text>
          {keys && <Text dimColor>{offered ? "u try again · " : ""}Esc dismiss</Text>}
        </Box>
      );
    case "idle":
      if (!note) return null;
      return (
        <Box flexDirection="column">
          <Text color="yellow">{note}</Text>
          {offered && keys && <Text dimColor>u switch to the newer Floe</Text>}
        </Box>
      );
  }
}
