import { resolveBusEndpoints } from "../bus/config.js";
import { IdentityAuthClient } from "../bus/identity-auth.js";
import { AuthSession } from "../session/auth-session.js";
export function createServices() {
    const endpoints = resolveBusEndpoints();
    const authClient = new IdentityAuthClient(endpoints.httpBaseUrl);
    const session = new AuthSession({ transport: authClient });
    return { endpoints, session };
}
