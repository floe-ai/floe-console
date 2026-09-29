import { Box, Text } from "ink";
import type { Task } from "../../tasks/task-tracker.js";

/** How much of an answer is shown before it is marked as trimmed. */
const ANSWER_LIMIT = 700;
const SHOWN_TASKS = 3;

export function SentTasks({
  tasks,
  nameOf,
}: {
  tasks: Task[];
  nameOf: (endpointId: string | null) => string;
}): JSX.Element | null {
  if (tasks.length === 0) return null;
  const shown = tasks.slice(0, SHOWN_TASKS);
  return (
    <Box flexDirection="column">
      <Text bold>You sent</Text>
      {shown.map((task) => (
        <Box key={task.eventId} flexDirection="column" marginTop={1}>
          <Text>
            <Text dimColor>To {nameOf(task.targetEndpointId)}: </Text>
            {oneLine(task.text, 90)}
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Phase task={task} actor={nameOf(task.targetEndpointId)} />
          </Box>
        </Box>
      ))}
      {tasks.length > SHOWN_TASKS && <Text dimColor>and {tasks.length - SHOWN_TASKS} earlier</Text>}
    </Box>
  );
}

function Phase({ task, actor }: { task: Task; actor: string }): JSX.Element {
  const phase = task.phase;
  switch (phase.kind) {
    case "sent":
      return <Text dimColor>Sent. Not yet delivered to {actor}.</Text>;
    case "not_delivered":
      return <Text color="red">Floe accepted this but delivered it to no one.</Text>;
    case "received":
      return <Text dimColor>✓ Received by {actor}. Not started yet.</Text>;
    case "working":
      return <Text color="cyan">✓ Received · {actor} is working…</Text>;
    case "waiting":
      return phase.onYou ? (
        <Text color="yellow">{actor} asked you something. Answer it in Waiting on you.</Text>
      ) : (
        <Text dimColor>{actor} is waiting on another Actor.</Text>
      );
    case "resuming":
      return (
        <Text dimColor>
          You answered “{oneLine(phase.answer, 60)}” · {actor} is continuing…
        </Text>
      );
    case "done":
      return phase.text.trim() ? (
        <Box flexDirection="column">
          <Text color="green">{actor} answered:</Text>
          <Answer text={phase.text} />
        </Box>
      ) : (
        <Text color="green">{actor} finished without a reply.</Text>
      );
    case "failed":
      return (
        <Box flexDirection="column">
          <Text color="red">{actor}’s turn failed:</Text>
          <Answer text={phase.text || "No reason was given."} />
        </Box>
      );
  }
}

function Answer({ text }: { text: string }): JSX.Element {
  const clean = text.trim();
  if (clean.length <= ANSWER_LIMIT) return <Text>{clean}</Text>;
  const rest = clean.length - ANSWER_LIMIT;
  return (
    <Box flexDirection="column">
      <Text>{clean.slice(0, ANSWER_LIMIT).trimEnd()}…</Text>
      <Text color="yellow">[trimmed: {rest.toLocaleString()} more characters not shown]</Text>
    </Box>
  );
}

function oneLine(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}
