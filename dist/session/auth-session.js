import { IdentityAuthError } from "../bus/identity-auth.js";
import { decryptSecretKey } from "../identity/key-store.js";
import { buildAuthEvent } from "../identity/auth-event.js";
import { loadIdentityFile } from "../identity/store-fs.js";
const DEFAULT_REFRESH_SKEW_MS = 60_000;
export class AuthSession {
    deps;
    state = { kind: "no-key" };
    listeners = new Set();
    secretKey = null;
    npub = null;
    chosenWorkspaceId = null;
    refreshTimer = null;
    sign;
    load;
    decrypt;
    now;
    setTimer;
    clearTimer;
    refreshSkewMs;
    constructor(deps) {
        this.deps = deps;
        this.sign = deps.sign ?? buildAuthEvent;
        this.load = deps.load ?? loadIdentityFile;
        this.decrypt = deps.decrypt ?? decryptSecretKey;
        this.now = deps.now ?? (() => Date.now());
        this.setTimer = deps.setTimer ?? ((fn, ms) => ({ ref: setTimeout(fn, ms) }));
        this.clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t.ref));
        this.refreshSkewMs = deps.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
    }
    getState() {
        return this.state;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }
    /**
     * Determine whether a key exists on this machine. Call once at startup.
     *
     * A device-protected identity (blank passphrase, D-DEVICE-AUTH) carries no
     * human secret, so there is nothing to prompt for: unlock it silently with an
     * empty passphrase and go straight into the handshake. A passphrase-protected
     * identity drops to `locked` and waits for the human.
     */
    init() {
        const file = this.load();
        if (!file) {
            this.setState({ kind: "no-key" });
            return this.state;
        }
        if (file.protection === "device") {
            this.setState({ kind: "authenticating", npub: file.npub });
            void this.unlock("");
            return this.state;
        }
        this.setState({ kind: "locked", npub: file.npub });
        return this.state;
    }
    /**
     * Unlock the stored key with a passphrase, then attempt authentication.
     * Throws IncorrectPassphraseError (from decrypt) on a wrong passphrase, which
     * the caller shows against the passphrase field — it is not a session error.
     */
    async unlock(passphrase) {
        const file = this.load();
        if (!file) {
            this.setState({ kind: "no-key" });
            return this.state;
        }
        const key = this.decrypt(file, passphrase); // throws on wrong passphrase
        this.adoptKey(key, file.npub);
        return this.authenticateFlow();
    }
    /**
     * Adopt a freshly generated/imported key that has just been persisted, without
     * re-reading the file (the caller already holds the plaintext key in memory).
     */
    async adoptFreshKey(secretKey, npub) {
        this.adoptKey(secretKey, npub);
        return this.authenticateFlow();
    }
    /** Human-triggered re-authentication (C1: no polling loop). */
    async checkNow() {
        if (!this.secretKey)
            return this.state;
        return this.authenticateFlow();
    }
    /**
     * Register a folder as a workspace and, by that act, join it — the first-run
     * path out of `needs-workspace`. Signs a fresh challenge with the unlocked key
     * and posts it to the register-and-join route. This mints no bearer and does
     * not change session state; it returns the raw result so the caller can show
     * the honest outcome (a `ready` folder, a `pending` one whose bridge has not
     * confirmed materialisation yet, or a real failure). On a `ready`/`pending`
     * result the key is durably admitted to exactly one workspace, so the caller
     * reaches `ready` by calling `checkNow()` — the ordinary handshake — which
     * cannot race because admission is durable before the route answers.
     *
     * Throws on a transport/challenge failure (e.g. the bus is unreachable); the
     * caller surfaces that as a retryable error rather than a bad folder.
     */
    async registerAndJoin(input) {
        const secretKey = this.secretKey;
        const npub = this.npub;
        if (!secretKey || !npub) {
            return { kind: "invalid", error: "no_key", message: "No identity is unlocked." };
        }
        const grant = await this.deps.transport.requestChallenge();
        const authEvent = this.sign(grant, secretKey);
        return this.deps.transport.registerWorkspace(authEvent, input);
    }
    /** Choose a workspace when several memberships were offered. */
    async selectWorkspace(workspaceId) {
        if (!this.secretKey)
            return this.state;
        this.chosenWorkspaceId = workspaceId;
        return this.authenticateFlow(workspaceId);
    }
    /** Zero the key and drop to locked (or no-key). Safe to call repeatedly. */
    lock() {
        this.cancelRefresh();
        if (this.secretKey)
            this.secretKey.fill(0);
        this.secretKey = null;
        this.chosenWorkspaceId = null;
        const npub = this.npub;
        this.npub = null;
        this.setState(npub ? { kind: "locked", npub } : { kind: "no-key" });
    }
    adoptKey(secretKey, npub) {
        if (this.secretKey)
            this.secretKey.fill(0);
        this.secretKey = secretKey;
        this.npub = npub;
    }
    async authenticateFlow(workspaceId) {
        const npub = this.npub;
        if (!this.secretKey || !npub) {
            this.setState({ kind: "no-key" });
            return this.state;
        }
        // Sign with a private copy of the key. adoptKey/lock zero the stored buffer,
        // and there is an await (requestChallenge) between capturing the key and
        // signing, so a concurrent unlock (e.g. init's device auto-unlock racing an
        // explicit one, or a refresh overlapping) would otherwise zero the buffer
        // mid-flight and produce an invalid scalar. This copy is independent of that.
        const signingKey = Uint8Array.from(this.secretKey);
        this.setState({ kind: "authenticating", npub });
        const chosen = workspaceId ?? this.chosenWorkspaceId ?? undefined;
        try {
            const grant = await this.deps.transport.requestChallenge();
            const authEvent = this.sign(grant, signingKey);
            const result = await this.deps.transport.authenticate(authEvent, chosen);
            return this.applyResult(result, npub);
        }
        catch (err) {
            if (err instanceof IdentityAuthError && err.reason === "identity_auth_failed") {
                // Valid signature, but the key is admitted to no workspace yet (or was
                // revoked — indistinguishable by design). The honest next step is to
                // register a folder, which is itself the act of joining it.
                this.setState({
                    kind: "needs-workspace",
                    npub,
                    message: "This identity is not in any workspace yet. Register a folder to create or join one.",
                });
                return this.state;
            }
            if (err instanceof IdentityAuthError && err.reason === "identity_not_admitted_to_workspace") {
                // The chosen workspace is not one this key may act in — reset the choice.
                this.chosenWorkspaceId = null;
                this.setState({
                    kind: "error",
                    npub,
                    message: "That workspace is not one this key was admitted to.",
                });
                return this.state;
            }
            this.setState({
                kind: "error",
                npub,
                message: err instanceof Error ? err.message : "Authentication failed unexpectedly.",
            });
            return this.state;
        }
        finally {
            signingKey.fill(0);
        }
    }
    applyResult(result, npub) {
        if (result.workspace_selection_required) {
            this.setState({
                kind: "selecting-workspace",
                npub,
                identity: result.identity,
                workspaces: result.workspaces,
            });
            return this.state;
        }
        if (!result.bearer_token || !result.workspace_id) {
            this.setState({
                kind: "error",
                npub,
                message: "The substrate returned no bearer and did not ask for a selection.",
            });
            return this.state;
        }
        const workspace = result.workspaces.find((w) => w.workspace_id === result.workspace_id) ??
            { workspace_id: result.workspace_id, name: result.workspace_id };
        this.chosenWorkspaceId = result.workspace_id;
        const bearer = {
            token: result.bearer_token,
            workspaceId: result.workspace_id,
            expiresAt: result.expires_at,
        };
        this.scheduleRefresh(bearer);
        this.setState({ kind: "ready", npub, identity: result.identity, workspace, bearer });
        return this.state;
    }
    scheduleRefresh(bearer) {
        this.cancelRefresh();
        if (!bearer.expiresAt)
            return;
        const expiresMs = Date.parse(bearer.expiresAt);
        if (Number.isNaN(expiresMs))
            return;
        const delay = Math.max(0, expiresMs - this.now() - this.refreshSkewMs);
        this.refreshTimer = this.setTimer(() => {
            void this.authenticateFlow(bearer.workspaceId);
        }, delay);
    }
    cancelRefresh() {
        if (this.refreshTimer) {
            this.clearTimer(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
    setState(next) {
        this.state = next;
        for (const listener of this.listeners)
            listener(next);
    }
}
