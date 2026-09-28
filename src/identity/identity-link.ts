import {
  connectIdentity,
  IdentityError,
  AgentUnavailableError,
  type IdentityClient,
  type IdentitySession,
  type IdentityState,
  type SessionEvent,
  type Workspace,
} from "floe/identity";

/**
 * The console's one connection to Floe's identity agent. Floe holds the key,
 * signs, and pushes bearers; this only mirrors what the agent pushes so screens
 * can render it, and opens a session when the identity is usable.
 *
 * A session opens by itself when the identity is unlocked, or is device
 * protected (the agent unlocks those on demand). A passphrase identity waits for
 * the unlock screen. Nothing here polls: every change arrives as a push.
 */

export type SessionView =
  | { readonly kind: "none" }
  | { readonly kind: "opening" }
  | {
      readonly kind: "ready";
      readonly bearer: string;
      readonly workspace: Workspace;
      readonly workspaces: readonly Workspace[];
      readonly expiresAt: string;
    }
  | { readonly kind: "selecting"; readonly workspaces: readonly Workspace[] }
  | { readonly kind: "needs-workspace"; readonly message: string }
  | { readonly kind: "stopped"; readonly message: string };

export type LinkState =
  | { readonly kind: "connecting" }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "connected"; readonly identity: IdentityState; readonly session: SessionView };

type Connect = () => Promise<IdentityClient>;

export class IdentityLink {
  private state: LinkState = { kind: "connecting" };
  private readonly listeners = new Set<(state: LinkState) => void>();
  private client: IdentityClient | null = null;
  private session: IdentitySession | null = null;
  private opening = false;
  /** Bumped whenever a session is abandoned, so its late pushes are ignored. */
  private generation = 0;
  /** Set when a session ended in a way the person must acknowledge before a new one opens. */
  private held = false;
  /** A device identity unlocks itself when a session asks, except right after Floe locked it. */
  private deviceAutoOpen = true;
  constructor(private readonly connectFn: Connect = () => connectIdentity({ surface: "console" })) {}

  getState(): LinkState {
    return this.state;
  }

  subscribe(listener: (state: LinkState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The connected client, for the screens that ask the agent to act. */
  get identity(): IdentityClient {
    if (!this.client) throw new AgentUnavailableError("not_running", "Not connected to Floe's identity agent.");
    return this.client;
  }

  async connect(): Promise<void> {
    this.set({ kind: "connecting" });
    try {
      const client = await this.connectFn();
      this.client = client;
      this.session = null;
      this.generation++;
      this.held = false;
      this.deviceAutoOpen = true;
      client.onState((identity) => this.onIdentity(identity));
      client.onClose(() => {
        this.client = null;
        this.session = null;
        this.set({
          kind: "unavailable",
          message: "Floe's identity agent stopped (Floe may have been stopped or restarted).",
        });
      });
      this.set({ kind: "connected", identity: client.state, session: { kind: "none" } });
      this.onIdentity(client.state);
    } catch (error) {
      this.set({ kind: "unavailable", message: messageOf(error) });
    }
  }

  /** Answer a selection_required push. */
  async select(workspaceId: string): Promise<void> {
    await this.session?.select(workspaceId);
  }

  /** The person acknowledged a stopped session: open a fresh one. */
  async reopen(): Promise<void> {
    const old = this.session;
    this.session = null;
    this.generation++;
    this.held = false;
    this.deviceAutoOpen = true;
    if (old) await old.end().catch(() => undefined);
    this.setSession({ kind: "none" });
    if (this.client) this.onIdentity(this.client.state);
  }

  close(): void {
    this.client?.close();
  }

  private onIdentity(identity: IdentityState): void {
    if (this.state.kind !== "connected") return;
    this.set({ ...this.state, identity });
    if (identity.kind === "none" || (identity.kind === "locked" && identity.protection === "passphrase")) {
      // The agent ends every session when the key is forgotten.
      this.dropSession();
      return;
    }
    const usable = identity.kind === "unlocked" || this.deviceAutoOpen;
    if (usable && !this.session && !this.opening && !this.held) void this.openSession();
  }

  private dropSession(): void {
    this.session = null;
    this.generation++;
    this.held = false;
    this.setSession({ kind: "none" });
  }

  private async openSession(): Promise<void> {
    if (!this.client) return;
    this.opening = true;
    const generation = ++this.generation;
    this.setSession({ kind: "opening" });
    try {
      const session = await this.client.session({}, (event) => {
        if (generation === this.generation) this.onSession(event);
      });
      if (generation === this.generation) this.session = session;
      else void session.end().catch(() => undefined);
    } catch (error) {
      if (generation === this.generation) {
        this.held = true;
        this.setSession({ kind: "stopped", message: messageOf(error) });
      }
    } finally {
      this.opening = false;
    }
    // The identity changed while the session was opening: decide again.
    if (generation !== this.generation && this.client) this.onIdentity(this.client.state);
  }

  private onSession(event: SessionEvent): void {
    switch (event.status) {
      case "ready":
        this.setSession({
          kind: "ready",
          bearer: event.bearer_token,
          workspace: event.workspace,
          workspaces: event.workspaces,
          expiresAt: event.expires_at,
        });
        return;
      case "selection_required":
        this.setSession({ kind: "selecting", workspaces: event.workspaces });
        return;
      case "needs_workspace":
        this.setSession({ kind: "needs-workspace", message: event.message });
        return;
      case "error":
        this.held = true;
        this.setSession({ kind: "stopped", message: event.message });
        return;
      case "ended":
        if (event.reason === "locked") {
          // Floe forgot the key (a lock, or a restore/replace/import swapping it).
          // The next identity push decides: an unlocked identity opens a new
          // session; a device identity locked on purpose waits for the person.
          this.deviceAutoOpen = false;
          this.dropSession();
          return;
        }
        this.session = null;
        this.held = true;
        this.setSession({ kind: "stopped", message: endedMessage(event.reason) });
        return;
    }
  }

  private setSession(session: SessionView): void {
    if (this.state.kind !== "connected") return;
    this.set({ ...this.state, session });
  }

  private set(next: LinkState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

function endedMessage(reason: string): string {
  switch (reason) {
    case "revoked":
      return "This console's session was revoked (for example with `floe identity sessions --revoke`).";
    case "locked":
      return "Floe locked this identity, which ended this console's session.";
    default:
      return `This console's session ended (${reason}).`;
  }
}

export function messageOf(error: unknown): string {
  if (error instanceof IdentityError || error instanceof AgentUnavailableError || error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export { IdentityError };
