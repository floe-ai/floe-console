import { resolveBusEndpoints, type BusEndpoints } from "../bus/config.js";
import { IdentityAuthClient } from "../bus/identity-auth.js";
import { AuthSession } from "../session/auth-session.js";

/**
 * One place that wires the console's parts to the real Bus, reading its address
 * from local config. Nothing here is privileged; it only constructs an HTTP auth
 * client and the session state machine that drives everything else.
 */
export interface Services {
  readonly endpoints: BusEndpoints;
  readonly session: AuthSession;
}

export function createServices(): Services {
  const endpoints = resolveBusEndpoints();
  const authClient = new IdentityAuthClient(endpoints.httpBaseUrl);
  const session = new AuthSession({ transport: authClient });
  return { endpoints, session };
}
