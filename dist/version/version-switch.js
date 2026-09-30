import { createRequire } from "node:module";
export class VersionSwitch {
    deps;
    state = { kind: "idle" };
    listeners = new Set();
    constructor(deps) {
        this.deps = deps;
    }
    getState() {
        return this.state;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** Offer the switch only when this surface's Floe is known to be newer than the running one. */
    offered() {
        const running = this.deps.client()?.agentVersion ?? null;
        return this.deps.ownVersion !== null && running !== null && isNewer(this.deps.ownVersion, running);
    }
    /** Ask Floe to switch, without interrupting anything. */
    start() {
        return this.ask(false);
    }
    /** The person chose to switch anyway: Floe interrupts the named turns. */
    interrupt() {
        return this.ask(true);
    }
    /**
     * The person chose to wait. Turns in `workspaceId` are watched by push; when
     * they have all ended the switch is asked again. With none to watch, the
     * person is told why and can try again.
     */
    wait(workspaceId) {
        if (this.state.kind !== "work_running")
            return;
        const watched = this.state.running.filter((turn) => turn.workspace_id === workspaceId);
        const unwatched = this.state.running.filter((turn) => turn.workspace_id !== workspaceId);
        this.set({ kind: "waiting", watched, unwatched });
    }
    /** Floe pushed an Actor's status. One that is no longer mid-turn stops being waited on. */
    endpointStatus(endpointId, status) {
        if (this.state.kind !== "waiting" || status === "active")
            return;
        const watched = this.state.watched.filter((turn) => turn.endpoint_id !== endpointId);
        if (watched.length === this.state.watched.length)
            return;
        if (watched.length > 0) {
            this.set({ ...this.state, watched });
            return;
        }
        // Every watched turn has ended. Floe checks again under its own lock and
        // names anything still running, including turns elsewhere.
        void this.start();
    }
    cancel() {
        if (this.state.kind === "switching")
            return;
        this.set({ kind: "idle" });
    }
    async ask(interrupt) {
        const client = this.deps.client();
        if (!client || this.state.kind === "switching")
            return;
        this.set({ kind: "switching", interrupting: interrupt });
        let outcome;
        try {
            outcome = await client.switchToThisVersion(interrupt ? { interrupt_running_work: true } : {});
        }
        catch (error) {
            this.set({ kind: "problem", message: error instanceof Error ? error.message : String(error) });
            return;
        }
        switch (outcome.kind) {
            case "switched":
                await this.deps.reconnect();
                this.set({ kind: "switched", from: outcome.from, to: outcome.to, interrupted: outcome.interrupted });
                return;
            case "already_serving":
                this.set({ kind: "switched", from: null, to: outcome.version, interrupted: [] });
                return;
            case "work_running":
                this.set({ kind: "work_running", running: outcome.running, message: outcome.message });
                return;
            case "refused":
                this.set({ kind: "problem", message: outcome.message });
                return;
        }
    }
    set(next) {
        this.state = next;
        for (const listener of this.listeners)
            listener(next);
    }
}
/** The version of Floe this surface ships, read from its own copy. */
export function ownFloeVersion() {
    try {
        const version = createRequire(import.meta.url)("floe/package.json").version;
        return typeof version === "string" ? version : null;
    }
    catch {
        return null;
    }
}
/** True when `a` is a later x.y.z release than `b`. Unreadable versions are never newer. */
export function isNewer(a, b) {
    const left = parse(a);
    const right = parse(b);
    if (!left || !right)
        return false;
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i])
            return left[i] > right[i];
    }
    return false;
}
function parse(version) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
    return match ? match.slice(1, 4).map(Number) : null;
}
/** An Actor's id and status from a `status_changed` push ({ endpoint }), or null when it carries none. */
export function endpointStatusFrom(payload) {
    const endpoint = payload?.endpoint;
    if (typeof endpoint?.endpoint_id !== "string" || typeof endpoint.status !== "string")
        return null;
    return { id: endpoint.endpoint_id, status: endpoint.status };
}
/** "Navigator in voyage4": the Actor's name, or its id when it has none, and its workspace when known. */
export function describeTurn(turn, workspaceNames) {
    const who = turn.name ?? turn.endpoint_id;
    const where = workspaceNames.get(turn.workspace_id);
    return where ? `${who} in ${where}` : `${who} in another workspace`;
}
