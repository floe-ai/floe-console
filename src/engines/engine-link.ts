import {
  connectEngines,
  EnginesError,
  type EnginesClient,
  type EngineState,
  type SignInEvent,
  type SignInStatus,
} from "floe/engines";

/**
 * The console's one connection to Floe's engine control (served by the Bridge).
 * It mirrors what Floe pushes: whether each AI engine can run work, and the
 * progress of any sign-in. It never polls and never sees a credential; the
 * vendor's own sign-in window does the signing in.
 */

export type SignInView =
  /** The console asked Floe to start a sign-in and has no answer yet. */
  | { readonly kind: "requesting" }
  | { readonly kind: "progress"; readonly operationId: string; readonly status: SignInStatus; readonly message: string }
  /** Floe refused to start one; `code` is from the protocol's refusal table. */
  | { readonly kind: "refused"; readonly code: string; readonly message: string };

export type EnginesView =
  | { readonly kind: "connecting" }
  | { readonly kind: "unavailable"; readonly message: string }
  | {
      readonly kind: "connected";
      readonly engines: Readonly<Record<string, EngineState>>;
      readonly signIns: Readonly<Record<string, SignInView>>;
      /** A refused refresh or cancel, per engine, until the person acts again. */
      readonly problems: Readonly<Record<string, string>>;
    };

type Connected = Extract<EnginesView, { kind: "connected" }>;
type Connect = () => Promise<EnginesClient>;

export class EngineLink {
  private view: EnginesView = { kind: "connecting" };
  private readonly listeners = new Set<(view: EnginesView) => void>();
  private client: EnginesClient | null = null;
  private connecting: Promise<void> | null = null;

  constructor(private readonly connectFn: Connect = () => connectEngines({ surface: "console" })) {}

  getView(): EnginesView {
    return this.view;
  }

  /** Floe's own words when engine control is served by a different Floe version from the console's copy. */
  get versionNote(): string | null {
    return this.client?.versionNote ?? null;
  }

  subscribe(listener: (view: EnginesView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Floe's Bus pushed that a Bridge (which serves engine control) is connected:
   * reconnect if the console is not already connected or connecting.
   */
  bridgeConnected(): void {
    if (this.client || this.connecting) return;
    void this.connect();
  }

  async connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async open(): Promise<void> {
    this.set({ kind: "connecting" });
    try {
      const client = await this.connectFn();
      this.client = client;
      client.onState((engines) => this.update({ engines: { ...engines } }));
      client.onSignIn((event) => this.onSignIn(event));
      client.onClose(() => {
        if (this.client !== client) return;
        this.client = null;
        this.set({
          kind: "unavailable",
          message: "Floe's engine control stopped (Floe may have been stopped or restarted).",
        });
      });
      this.set({ kind: "connected", engines: { ...client.state }, signIns: {}, problems: {} });
    } catch (error) {
      this.set({ kind: "unavailable", message: messageOf(error) });
    }
  }

  /** Ask Floe to open the vendor's own sign-in. Progress arrives by push. */
  async signIn(engine: string): Promise<void> {
    const client = this.client;
    const view = this.connected();
    if (!client || !view) return;
    this.update({ signIns: { ...view.signIns, [engine]: { kind: "requesting" } }, problems: without(view.problems, engine) });
    try {
      const { operation_id } = await client.signIn(engine);
      // A pushed event may already have arrived for this operation; keep it.
      if (this.connected()?.signIns[engine]?.kind === "requesting") {
        this.putSignIn(engine, { kind: "progress", operationId: operation_id, status: "starting", message: "" });
      }
    } catch (error) {
      this.putSignIn(engine, { kind: "refused", code: codeOf(error), message: messageOf(error) });
    }
  }

  /** Stop the sign-in in progress for this engine, once Floe has named it. */
  async cancelSignIn(engine: string): Promise<void> {
    const client = this.client;
    const view = this.connected();
    const signIn = view?.signIns[engine];
    if (!client || !view || !isCancellable(signIn)) return;
    this.update({ problems: without(view.problems, engine) });
    try {
      await client.cancelSignIn(signIn.operationId);
    } catch (error) {
      this.putProblem(engine, messageOf(error));
    }
  }

  /** "Try again": one fresh check. The result arrives by push. */
  async refresh(engine: string): Promise<void> {
    const client = this.client;
    const view = this.connected();
    if (!client || !view) return;
    this.update({ problems: without(view.problems, engine) });
    try {
      await client.refresh(engine);
    } catch (error) {
      this.putProblem(engine, messageOf(error));
    }
  }

  close(): void {
    this.client?.close();
  }

  private onSignIn(event: SignInEvent): void {
    this.putSignIn(event.engine, {
      kind: "progress",
      operationId: event.operation_id,
      status: event.status,
      message: event.message,
    });
  }

  private putSignIn(engine: string, signIn: SignInView): void {
    const view = this.connected();
    if (view) this.update({ signIns: { ...view.signIns, [engine]: signIn } });
  }

  private putProblem(engine: string, message: string): void {
    const view = this.connected();
    if (view) this.update({ problems: { ...view.problems, [engine]: message } });
  }

  private connected(): Connected | null {
    return this.view.kind === "connected" ? this.view : null;
  }

  private update(change: Partial<Omit<Connected, "kind">>): void {
    const view = this.connected();
    if (view) this.set({ ...view, ...change });
  }

  private set(next: EnginesView): void {
    this.view = next;
    for (const listener of this.listeners) listener(next);
  }
}

export function isCancellable(
  signIn: SignInView | undefined,
): signIn is Extract<SignInView, { kind: "progress" }> {
  return signIn?.kind === "progress" && (signIn.status === "starting" || signIn.status === "waiting_for_person");
}

function without(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function codeOf(error: unknown): string {
  return error instanceof EnginesError ? error.code : "failed";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
