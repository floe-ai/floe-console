import { createRequire } from "node:module";
import type { RunningTurn, VersionSwitchOutcome } from "floe/identity";

/**
 * "Switch to the newer Floe": asks Floe to run the console's own copy when an
 * older Floe is already running. Floe does the switch (switchToThisVersion);
 * this only holds what the person sees and chooses.
 *
 * A turn in progress is never interrupted silently. Floe declines and names the
 * turns; the person then chooses to interrupt them, wait for them, or cancel.
 * Waiting is push-driven: the surface reports each Actor that Floe pushes as no
 * longer mid-turn, and when every turn this surface can see has ended the
 * switch is asked again. Floe pushes turn changes only to their own workspace,
 * so turns elsewhere cannot be watched from here; the person is told so and
 * can try again. Nothing here polls.
 */

export type SwitchState =
  | { readonly kind: "idle" }
  | { readonly kind: "switching"; readonly interrupting: boolean }
  | { readonly kind: "work_running"; readonly running: readonly RunningTurn[]; readonly message: string }
  | {
      readonly kind: "waiting";
      /** Turns in this surface's workspace, whose end Floe pushes here. */
      readonly watched: readonly RunningTurn[];
      /** Turns in other workspaces: Floe does not tell this surface when they end. */
      readonly unwatched: readonly RunningTurn[];
    }
  | { readonly kind: "switched"; readonly from: string | null; readonly to: string; readonly interrupted: readonly RunningTurn[] }
  | { readonly kind: "problem"; readonly message: string };

/** The part of a Floe connection the switch uses. */
export interface SwitchClient {
  readonly agentVersion: string | null;
  switchToThisVersion(options?: { interrupt_running_work?: boolean }): Promise<VersionSwitchOutcome>;
}

export interface SwitchDeps {
  /** The Floe version this surface ships, or null when it cannot be read. */
  readonly ownVersion: string | null;
  /** The live connection, or null while not connected. */
  client(): SwitchClient | null;
  /** Connect again after a switch: the old connections closed with the old Floe. */
  reconnect(): Promise<void>;
}

export class VersionSwitch {
  private state: SwitchState = { kind: "idle" };
  private readonly listeners = new Set<(state: SwitchState) => void>();

  constructor(private readonly deps: SwitchDeps) {}

  getState(): SwitchState {
    return this.state;
  }

  subscribe(listener: (state: SwitchState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Offer the switch only when this surface's Floe is known to be newer than the running one. */
  offered(): boolean {
    const running = this.deps.client()?.agentVersion ?? null;
    return this.deps.ownVersion !== null && running !== null && isNewer(this.deps.ownVersion, running);
  }

  /** Ask Floe to switch, without interrupting anything. */
  start(): Promise<void> {
    return this.ask(false);
  }

  /** The person chose to switch anyway: Floe interrupts the named turns. */
  interrupt(): Promise<void> {
    return this.ask(true);
  }

  /**
   * The person chose to wait. Turns in `workspaceId` are watched by push; when
   * they have all ended the switch is asked again. With none to watch, the
   * person is told why and can try again.
   */
  wait(workspaceId: string | null): void {
    if (this.state.kind !== "work_running") return;
    const watched = this.state.running.filter((turn) => turn.workspace_id === workspaceId);
    const unwatched = this.state.running.filter((turn) => turn.workspace_id !== workspaceId);
    this.set({ kind: "waiting", watched, unwatched });
  }

  /** Floe pushed an Actor's status. One that is no longer mid-turn stops being waited on. */
  endpointStatus(endpointId: string, status: string): void {
    if (this.state.kind !== "waiting" || status === "active") return;
    const watched = this.state.watched.filter((turn) => turn.endpoint_id !== endpointId);
    if (watched.length === this.state.watched.length) return;
    if (watched.length > 0) {
      this.set({ ...this.state, watched });
      return;
    }
    // Every watched turn has ended. Floe checks again under its own lock and
    // names anything still running, including turns elsewhere.
    void this.start();
  }

  cancel(): void {
    if (this.state.kind === "switching") return;
    this.set({ kind: "idle" });
  }

  private async ask(interrupt: boolean): Promise<void> {
    const client = this.deps.client();
    if (!client || this.state.kind === "switching") return;
    this.set({ kind: "switching", interrupting: interrupt });
    let outcome: VersionSwitchOutcome;
    try {
      outcome = await client.switchToThisVersion(interrupt ? { interrupt_running_work: true } : {});
    } catch (error) {
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

  private set(next: SwitchState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

/** The version of Floe this surface ships, read from its own copy. */
export function ownFloeVersion(): string | null {
  try {
    const version = (createRequire(import.meta.url)("floe/package.json") as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/** True when `a` is a later x.y.z release than `b`. Unreadable versions are never newer. */
export function isNewer(a: string, b: string): boolean {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) return left[i]! > right[i]!;
  }
  return false;
}

function parse(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

/** An Actor's id and status from a `status_changed` push ({ endpoint }), or null when it carries none. */
export function endpointStatusFrom(payload: unknown): { id: string; status: string } | null {
  const endpoint = (payload as { endpoint?: { endpoint_id?: unknown; status?: unknown } } | null)?.endpoint;
  if (typeof endpoint?.endpoint_id !== "string" || typeof endpoint.status !== "string") return null;
  return { id: endpoint.endpoint_id, status: endpoint.status };
}

/** "Navigator in voyage4": the Actor's name, or its id when it has none, and its workspace when known. */
export function describeTurn(turn: RunningTurn, workspaceNames: ReadonlyMap<string, string>): string {
  const who = turn.name ?? turn.endpoint_id;
  const where = workspaceNames.get(turn.workspace_id);
  return where ? `${who} in ${where}` : `${who} in another workspace`;
}
