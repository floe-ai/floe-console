import { useEffect, useState } from "react";
import type { AuthSession, AuthSessionState } from "../session/auth-session.js";

/** Mirror an AuthSession's state into React so screens re-render on transitions. */
export function useAuthSession(session: AuthSession): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>(() => session.getState());
  useEffect(() => session.subscribe(setState), [session]);
  return state;
}
