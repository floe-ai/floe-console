import { isCancellable } from "./engine-link.js";
export function engineName(engine) {
    return engine ? engine[0].toUpperCase() + engine.slice(1) : "The engine";
}
export function toneOf(state) {
    switch (state.phase) {
        case "ready":
            return "ok";
        case "checking":
            return "busy";
        case "action_required":
            return "action";
        case "unavailable":
            return "problem";
    }
}
export function buttonFor(state) {
    switch (state.action) {
        case "sign_in":
            return { action: "sign_in", label: "Sign in", note: null, key: "i", keyLabel: "sign in" };
        case "retry":
            return { action: "retry", label: "Try again", note: null, key: "r", keyLabel: "try again" };
        case "check_subscription":
            return {
                action: "check_subscription",
                label: "Check subscription",
                note: "This account has no plan that can use it. Signing in again will not help.",
                key: "r",
                keyLabel: "check again once it is fixed",
            };
        case "contact_admin":
            return {
                action: "contact_admin",
                label: "Contact administrator",
                note: "An organisation policy blocks it. Signing in again will not help.",
                key: "r",
                keyLabel: "check again once it is allowed",
            };
        default:
            return null;
    }
}
export function signInLine(signIn) {
    switch (signIn.kind) {
        case "requesting":
            return { tone: "busy", text: "Asking Floe to start sign-in…", detail: null, cancellable: false };
        case "refused":
            return { tone: "problem", text: "Floe could not start sign-in.", detail: signIn.message, cancellable: false };
        case "progress": {
            const detail = signIn.message.trim() || null;
            const cancellable = isCancellable(signIn);
            switch (signIn.status) {
                case "starting":
                    return { tone: "busy", text: "Starting sign-in…", detail, cancellable };
                case "waiting_for_person":
                    return { tone: "action", text: "Finish signing in in your browser.", detail, cancellable };
                case "succeeded":
                    return { tone: "ok", text: "Sign-in finished.", detail, cancellable };
                case "failed":
                    return { tone: "problem", text: "Sign-in did not finish.", detail, cancellable };
                case "cancelled":
                    return { tone: "quiet", text: "Sign-in cancelled.", detail, cancellable };
            }
        }
    }
}
/**
 * A sign-in in progress is always shown. A finished one stays only while the
 * engine is still not ready, so its outcome explains the state beneath it.
 */
export function showSignIn(state, signIn) {
    if (!signIn)
        return false;
    if (signIn.kind === "requesting" || isCancellable(signIn))
        return true;
    return state?.phase !== "ready";
}
/** The engine the console's keys act on: one signing in first, then one asking for action. */
export function focusEngine(view) {
    if (view.kind !== "connected")
        return null;
    const names = Object.keys(view.engines);
    return (names.find((name) => isCancellable(view.signIns[name]) || view.signIns[name]?.kind === "requesting") ??
        names.find((name) => buttonFor(view.engines[name])) ??
        null);
}
/** The engine keys available right now: at most one action, so no key is ambiguous. */
export function engineKeys(view) {
    if (view.kind === "unavailable")
        return [{ key: "r", label: "try again", act: "reconnect" }];
    const engine = focusEngine(view);
    if (view.kind !== "connected" || !engine)
        return [];
    const signIn = view.signIns[engine];
    if (signIn?.kind === "requesting")
        return [];
    if (isCancellable(signIn))
        return [{ key: "c", label: "cancel sign-in", act: "cancel", engine }];
    const button = buttonFor(view.engines[engine]);
    if (!button)
        return [];
    return button.key === "i"
        ? [{ key: "i", label: button.keyLabel, act: "sign_in", engine }]
        : [{ key: "r", label: button.keyLabel, act: "refresh", engine }];
}
/**
 * The engine an Actor uses, from its endpoint's `metadata.engine`: an engine id,
 * null when Floe says its runtime needs no engine, or undefined when no Bridge
 * has picked the Actor up yet and Floe has not said.
 */
export function actorEngine(endpoint) {
    const metadata = endpoint.metadata;
    if (typeof metadata !== "object" || metadata === null || !("engine" in metadata))
        return undefined;
    const engine = metadata.engine;
    if (engine === null)
        return null;
    return typeof engine === "string" && engine ? engine : undefined;
}
/**
 * Shown before work is sent, so the person learns why it will wait before it
 * waits. With the Actor's engine known, only that engine is spoken of; while
 * Floe has not said which engine it uses, every engine is.
 */
export function sendWarnings(view, engine) {
    if (engine === null)
        return [];
    if (view.kind === "unavailable") {
        const subject = engine ? `whether ${engineName(engine)} is ready` : "whether the AI engine is ready";
        return [`The console can't see ${subject}: ${view.message}`];
    }
    if (view.kind !== "connected")
        return [];
    if (engine && !view.engines[engine])
        return [`Floe has not said whether ${engineName(engine)} is ready yet.`];
    const states = engine ? [view.engines[engine]] : Object.values(view.engines);
    const lines = [];
    for (const state of states) {
        const name = engineName(state.engine);
        if (state.phase === "ready")
            continue;
        if (state.phase === "checking") {
            lines.push(`${name} is still being checked. Work you send waits for that check.`);
            continue;
        }
        lines.push(`${name} is not ready: ${state.message} Floe holds work you send now and runs it once ${name} is ready.`);
    }
    return lines;
}
/** How a task Floe is holding for an engine reads, using the engine's live state. */
export function heldLine(held, view) {
    if (!held.engine)
        return `Waiting. Floe is holding this until it can run: ${held.message}`;
    const name = engineName(held.engine);
    const state = view.kind === "connected" ? view.engines[held.engine] : undefined;
    if (!state)
        return `Waiting for ${name}: ${held.message}`;
    if (state.phase === "ready")
        return "Waiting to start.";
    if (state.phase === "checking")
        return `Waiting while ${name} is checked.`;
    if (state.action === "sign_in")
        return `Waiting for sign-in. Floe runs this once ${name} is signed in.`;
    return `Waiting for ${name}: ${state.message}`;
}
