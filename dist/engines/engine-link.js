import { connectEngines, EnginesError, } from "floe/engines";
export class EngineLink {
    connectFn;
    view = { kind: "connecting" };
    listeners = new Set();
    client = null;
    constructor(connectFn = () => connectEngines({ surface: "console" })) {
        this.connectFn = connectFn;
    }
    getView() {
        return this.view;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    async connect() {
        this.set({ kind: "connecting" });
        try {
            const client = await this.connectFn();
            this.client = client;
            client.onState((engines) => this.update({ engines: { ...engines } }));
            client.onSignIn((event) => this.onSignIn(event));
            client.onClose(() => {
                this.client = null;
                this.set({
                    kind: "unavailable",
                    message: "Floe's engine control stopped (Floe may have been stopped or restarted).",
                });
            });
            this.set({ kind: "connected", engines: { ...client.state }, signIns: {}, problems: {} });
        }
        catch (error) {
            this.set({ kind: "unavailable", message: messageOf(error) });
        }
    }
    /** Ask Floe to open the vendor's own sign-in. Progress arrives by push. */
    async signIn(engine) {
        const client = this.client;
        const view = this.connected();
        if (!client || !view)
            return;
        this.update({ signIns: { ...view.signIns, [engine]: { kind: "requesting" } }, problems: without(view.problems, engine) });
        try {
            const { operation_id } = await client.signIn(engine);
            // A pushed event may already have arrived for this operation; keep it.
            if (this.connected()?.signIns[engine]?.kind === "requesting") {
                this.putSignIn(engine, { kind: "progress", operationId: operation_id, status: "starting", message: "" });
            }
        }
        catch (error) {
            this.putSignIn(engine, { kind: "refused", code: codeOf(error), message: messageOf(error) });
        }
    }
    /** Stop the sign-in in progress for this engine, once Floe has named it. */
    async cancelSignIn(engine) {
        const client = this.client;
        const view = this.connected();
        const signIn = view?.signIns[engine];
        if (!client || !view || !isCancellable(signIn))
            return;
        this.update({ problems: without(view.problems, engine) });
        try {
            await client.cancelSignIn(signIn.operationId);
        }
        catch (error) {
            this.putProblem(engine, messageOf(error));
        }
    }
    /** "Try again": one fresh check. The result arrives by push. */
    async refresh(engine) {
        const client = this.client;
        const view = this.connected();
        if (!client || !view)
            return;
        this.update({ problems: without(view.problems, engine) });
        try {
            await client.refresh(engine);
        }
        catch (error) {
            this.putProblem(engine, messageOf(error));
        }
    }
    close() {
        this.client?.close();
    }
    onSignIn(event) {
        this.putSignIn(event.engine, {
            kind: "progress",
            operationId: event.operation_id,
            status: event.status,
            message: event.message,
        });
    }
    putSignIn(engine, signIn) {
        const view = this.connected();
        if (view)
            this.update({ signIns: { ...view.signIns, [engine]: signIn } });
    }
    putProblem(engine, message) {
        const view = this.connected();
        if (view)
            this.update({ problems: { ...view.problems, [engine]: message } });
    }
    connected() {
        return this.view.kind === "connected" ? this.view : null;
    }
    update(change) {
        const view = this.connected();
        if (view)
            this.set({ ...view, ...change });
    }
    set(next) {
        this.view = next;
        for (const listener of this.listeners)
            listener(next);
    }
}
export function isCancellable(signIn) {
    return signIn?.kind === "progress" && (signIn.status === "starting" || signIn.status === "waiting_for_person");
}
function without(record, key) {
    const { [key]: _removed, ...rest } = record;
    return rest;
}
function codeOf(error) {
    return error instanceof EnginesError ? error.code : "failed";
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
