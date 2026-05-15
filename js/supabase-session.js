import { supabase } from "../firebase.js";

/**
 * Invokes handler with the current session right away (getSession), then on every auth change.
 * Fixes pages that only subscribed to onAuthStateChange and never received an initial callback.
 *
 * @param {(session: import("@supabase/supabase-js").Session | null, event?: string) => void | Promise<void>} handler
 */
export function wireSupabaseSession(handler) {
    void supabase.auth.getSession().then(({ data }) => {
        void Promise.resolve(handler(data.session ?? null, "INITIAL_SESSION")).catch(console.error);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        void Promise.resolve(handler(session ?? null, event)).catch(console.error);
    });
    return data.subscription;
}
