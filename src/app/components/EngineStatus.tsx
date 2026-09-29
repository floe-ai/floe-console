import { Box, Text } from "ink";
import type { EnginesView } from "../../engines/engine-link.js";
import { buttonFor, engineName, showSignIn, signInLine, toneOf, type Tone } from "../../engines/engine-view.js";

const COLOR: Record<Tone, string | undefined> = {
  ok: "green",
  busy: "cyan",
  action: "yellow",
  problem: "red",
  quiet: undefined,
};

/**
 * Whether each AI engine can run work, exactly as Floe pushed it, with the one
 * action Floe asked for and any sign-in in progress. Keys live in the caller's
 * footer (engineKeys) so the screen has one place that lists them.
 */
export function EngineStatus({ view }: { view: EnginesView }): JSX.Element {
  if (view.kind === "connecting") return <Text dimColor>AI engine: checking with Floe…</Text>;
  if (view.kind === "unavailable") {
    return (
      <Box flexDirection="column">
        <Text color="red">AI engine: the console can't see whether it is ready.</Text>
        <Text dimColor>{view.message}</Text>
      </Box>
    );
  }
  const engines = Object.values(view.engines);
  if (engines.length === 0) return <Text color="yellow">AI engine: Floe reported no engines.</Text>;
  return (
    <Box flexDirection="column">
      {engines.map((state) => {
        const button = buttonFor(state);
        const signIn = view.signIns[state.engine];
        const line = signIn && showSignIn(state, signIn) ? signInLine(signIn) : null;
        const problem = view.problems[state.engine];
        return (
          <Box key={state.engine} flexDirection="column">
            <Text color={COLOR[toneOf(state)]}>
              AI engine ({engineName(state.engine)}): {state.message}
            </Text>
            {button && !line?.cancellable && (
              <Text>
                {"  "}
                <Text bold>{button.label}</Text>
                {button.note && <Text dimColor> · {button.note}</Text>}
              </Text>
            )}
            {line && (
              <Text color={COLOR[line.tone]}>
                {"  "}
                {line.text}
                {line.detail && line.detail !== line.text && <Text dimColor> {line.detail}</Text>}
              </Text>
            )}
            {problem && <Text color="red">{"  "}{problem}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
