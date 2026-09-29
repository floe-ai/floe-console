import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { EventStream } from "../../bus/event-stream.js";
import { WorkspaceClient, questionText, } from "../../bus/workspace-client.js";
import { Settings } from "./Settings.js";
import { SentTasks } from "../components/SentTasks.js";
import { TaskTracker } from "../../tasks/task-tracker.js";
export function MainSurface({ identity, workspaceName, workspaceId, bearer, endpoints, }) {
    const { exit } = useApp();
    const displayName = identity.state.kind === "none" ? "" : identity.state.display_name;
    const client = useMemo(() => new WorkspaceClient({ httpBaseUrl: endpoints.httpBaseUrl, bearerToken: bearer, workspaceId }), [endpoints.httpBaseUrl, bearer, workspaceId]);
    const [actor, setActor] = useState("unknown");
    const [actorNames, setActorNames] = useState(new Map());
    const [tasks, setTasks] = useState([]);
    const trackerRef = useRef(null);
    const cursorRef = useRef(null);
    const [waiting, setWaiting] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const [streamStatus, setStreamStatus] = useState({ kind: "connecting" });
    const [lastActivity, setLastActivity] = useState(null);
    const [answers, setAnswers] = useState({});
    const [mode, setMode] = useState({ name: "browse" });
    const [selected, setSelected] = useState(0);
    const answersRef = useRef(answers);
    answersRef.current = answers;
    // Claim whatever is waiting for our Endpoint and merge it into the list,
    // skipping deliveries we have already answered. Called once on startup to
    // drain backlog, then only in response to a push — never on a timer.
    async function claimInto(endpointId) {
        try {
            const claimed = await client.claimDeliveries(endpointId);
            setWaiting((current) => {
                const answered = answersRef.current;
                const byId = new Map(current.map((d) => [d.delivery_id, d]));
                for (const d of claimed) {
                    if (answered[d.delivery_id]?.kind === "answered")
                        continue;
                    byId.set(d.delivery_id, d);
                }
                return [...byId.values()];
            });
        }
        catch (err) {
            setLoadError(err instanceof Error ? err.message : "Could not claim deliveries.");
        }
    }
    // Discover the Actor we execute (the one whose adapter is `client`, never a
    // naming convention), drain any backlog, and open the stream.
    useEffect(() => {
        let stream = null;
        let endpointId = null;
        let disposed = false;
        (async () => {
            try {
                const all = await client.listEndpoints();
                if (disposed)
                    return;
                const mine = all.find((e) => e.adapter_id === "client") ?? null;
                setActorNames(new Map(all.map((e) => [e.endpoint_id, e.name ?? e.endpoint_id])));
                setActor(mine);
                if (!mine)
                    return;
                endpointId = mine.endpoint_id;
                // Survives a bearer renewal: the same Actor keeps tracking its tasks.
                if (!trackerRef.current || trackerRef.current.ownEndpointId !== endpointId) {
                    trackerRef.current = new TaskTracker(endpointId);
                    setTasks([]);
                }
                await claimInto(endpointId);
            }
            catch (err) {
                if (!disposed)
                    setLoadError(err instanceof Error ? err.message : "Could not reach the Bus.");
            }
        })();
        stream = new EventStream({
            wsBaseUrl: endpoints.wsBaseUrl,
            bearerToken: bearer,
            workspaceId,
            startAtCurrent: true,
            afterCursor: cursorRef.current,
            handlers: {
                onStatus: (s) => setStreamStatus(s),
                onCaughtUp: () => { },
                onEntry: () => { },
                onPush: (frame) => {
                    cursorRef.current = frame.cursor;
                    setLastActivity(`${frame.type} · ${new Date(frame.at).toLocaleTimeString()}`);
                    const tracker = trackerRef.current;
                    if (tracker?.push(frame))
                        setTasks(tracker.list());
                },
                onDeliveryAvailable: (frame) => {
                    if (endpointId && frame.payload.delivery.endpoint_id === endpointId) {
                        void claimInto(endpointId);
                    }
                },
            },
        });
        stream.start();
        return () => {
            disposed = true;
            stream?.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, endpoints.wsBaseUrl, bearer, workspaceId]);
    useInput((input, key) => {
        // Settings owns all input while open (including its own two-level Esc).
        if (mode.name === "settings")
            return;
        if (mode.name === "browse") {
            if (input === "q")
                exit();
            if (input === "s")
                setMode({ name: "send" });
            if (input === "g")
                setMode({ name: "settings" });
            if (waiting.length > 0) {
                if (key.upArrow)
                    setSelected((i) => Math.max(0, i - 1));
                if (key.downArrow)
                    setSelected((i) => Math.min(waiting.length - 1, i + 1));
                if (key.return) {
                    const item = waiting[Math.min(selected, waiting.length - 1)];
                    if (item)
                        setMode({ name: "answer", item });
                }
            }
        }
        else if (key.escape) {
            setMode({ name: "browse" });
        }
    });
    const header = (_jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, children: workspaceName }), displayName && _jsxs(Text, { dimColor: true, children: [" \u00B7 ", displayName] })] }), _jsx(Text, { dimColor: true, children: describeStream(streamStatus) })] }));
    if (actor === "unknown") {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { dimColor: true, children: "Discovering the Actor your identity executes\u2026" })] }));
    }
    if (actor === null) {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, _jsx(Text, { color: "yellow", children: "This workspace exposes no Actor your identity executes (none with adapter \u201Cclient\u201D). Registration provisions one, so a missing one means this workspace predates that or was set up incompletely \u2014 a substrate finding, not something the console can fill." }), _jsx(Text, { dimColor: true, children: "Press q to quit." })] }));
    }
    if (mode.name === "answer") {
        return (_jsx(AnswerPanel, { item: mode.item, answer: answers[mode.item.delivery_id], onCancel: () => setMode({ name: "browse" }), onSubmit: async (text) => {
                const deliveryId = mode.item.delivery_id;
                setAnswers((a) => ({ ...a, [deliveryId]: { kind: "sending" } }));
                setMode({ name: "browse" });
                try {
                    await client.endTurn({ deliveryId, text });
                    setAnswers((a) => ({ ...a, [deliveryId]: { kind: "answered" } }));
                    // The turn ended; the delivery is consumed. Drop it from the list.
                    setWaiting((current) => current.filter((d) => d.delivery_id !== deliveryId));
                }
                catch (err) {
                    setAnswers((a) => ({
                        ...a,
                        [deliveryId]: { kind: "error", message: err instanceof Error ? err.message : "Turn result failed." },
                    }));
                }
            } }));
    }
    if (mode.name === "settings") {
        return _jsx(Settings, { identity: identity, onClose: () => setMode({ name: "browse" }) });
    }
    if (mode.name === "send") {
        return (_jsx(SendWork, { client: client, sourceEndpointId: actor.endpoint_id, onDone: () => setMode({ name: "browse" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [header, loadError && _jsx(Text, { color: "red", children: loadError }), _jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { bold: true, children: ["Waiting on you (", waiting.length, ")"] }), waiting.length === 0 ? (_jsx(Text, { dimColor: true, children: "Nothing is waiting. When an actor asks you, it appears here." })) : (waiting.map((d, i) => {
                        const st = answers[d.delivery_id];
                        return (_jsxs(Text, { color: i === selected ? "cyan" : undefined, children: [i === selected ? "❯ " : "  ", truncate(questionText(d), 80), st ? _jsxs(Text, { dimColor: true, children: [" \u2014 ", describeAnswer(st)] }) : null] }, d.delivery_id));
                    }))] }), _jsx(SentTasks, { tasks: tasks, nameOf: (id) => (id ? actorNames.get(id) ?? "the Actor" : "the Actor") }), _jsx(Box, { flexDirection: "column", children: _jsxs(Text, { dimColor: true, children: ["Live: ", lastActivity ?? "waiting for activity…"] }) }), _jsx(Text, { dimColor: true, children: "\u2191/\u2193 select \u00B7 Enter answer \u00B7 s send work \u00B7 g settings \u00B7 q quit" })] }));
}
function AnswerPanel({ item, answer, onSubmit, onCancel, }) {
    const [body, setBody] = useState("");
    void onCancel;
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Answer" }), _jsx(Box, { flexDirection: "column", borderStyle: "round", paddingX: 1, children: _jsx(Text, { children: questionText(item) }) }), answer?.kind === "error" && _jsx(Text, { color: "red", children: answer.message }), _jsxs(Box, { children: [_jsx(Text, { children: "> " }), _jsx(TextInput, { value: body, onChange: setBody, onSubmit: () => body.trim() && onSubmit(body) })] }), _jsx(Text, { dimColor: true, children: "Enter to send \u00B7 Esc to go back" })] }));
}
function SendWork({ client, sourceEndpointId, onDone, }) {
    const [targets, setTargets] = useState(null);
    const [error, setError] = useState(null);
    const [target, setTarget] = useState(null);
    const [body, setBody] = useState("");
    const [selected, setSelected] = useState(0);
    useEffect(() => {
        client
            .listEndpoints()
            // Send work to model-backed actors (executed by a Bridge), not to
            // ourselves (the client-executed Actor).
            .then((all) => setTargets(all.filter((e) => e.adapter_id !== "client")))
            .catch((err) => setError(err instanceof Error ? err.message : "Could not list actors."));
    }, [client]);
    useInput((_input, key) => {
        if (key.escape)
            onDone();
        if (target || !targets)
            return;
        if (key.upArrow)
            setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow)
            setSelected((i) => Math.min(targets.length - 1, i + 1));
        if (key.return && targets[selected])
            setTarget(targets[selected]);
    });
    if (error)
        return _jsx(Text, { color: "red", children: error });
    if (!targets)
        return _jsx(Text, { children: "Loading actors\u2026" });
    if (!target) {
        return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsx(Text, { bold: true, children: "Send work \u2014 choose an actor" }), targets.length === 0 ? (_jsx(Text, { dimColor: true, children: "No actors to send to." })) : (targets.map((e, i) => (_jsxs(Text, { color: i === selected ? "cyan" : undefined, children: [i === selected ? "❯ " : "  ", e.name ?? e.endpoint_id] }, e.endpoint_id)))), _jsx(Text, { dimColor: true, children: "\u2191/\u2193 select \u00B7 Enter choose \u00B7 Esc cancel" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsxs(Text, { bold: true, children: ["Send work to ", target.name ?? target.endpoint_id] }), _jsxs(Box, { children: [_jsx(Text, { children: "> " }), _jsx(TextInput, { value: body, onChange: setBody, onSubmit: async () => {
                            if (!body.trim())
                                return;
                            try {
                                await client.sendWork({ sourceEndpointId, targetEndpointId: target.endpoint_id, body });
                                onDone();
                            }
                            catch (err) {
                                setError(err instanceof Error ? err.message : "Emit failed.");
                            }
                        } })] }), _jsx(Text, { dimColor: true, children: "Enter to send \u00B7 Esc to cancel" })] }));
}
function describeAnswer(state) {
    switch (state.kind) {
        case "sending":
            return "sending…";
        case "answered":
            return "answered";
        case "error":
            return `failed: ${state.message}`;
    }
}
function describeStream(status) {
    switch (status.kind) {
        case "connecting":
            return "connecting…";
        case "authenticating":
            return "authenticating…";
        case "replaying":
            return "syncing…";
        case "caught_up":
            return "live";
        case "reconnecting":
            return `reconnecting (try ${status.attempt})…`;
        case "closed":
            return `stream closed: ${status.reason}`;
    }
}
function truncate(s, n) {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
