import { useEffect, useState } from "react";
/** Mirror an AuthSession's state into React so screens re-render on transitions. */
export function useAuthSession(session) {
    const [state, setState] = useState(() => session.getState());
    useEffect(() => session.subscribe(setState), [session]);
    return state;
}
