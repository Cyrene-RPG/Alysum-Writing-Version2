import { supabase } from "../firebase.js";

/**
 * Invokes handler with the current session right away (getSession), then on every auth change.
 * Fixes pages that only subscribed to onAuthStateChange and never received an initial callback.
 *
 * @param {(session: import("@supabase/supabase-js").Session | null) => void | Promise<void>} handler
 */
export function wireSupabaseSession(handler) {
    void supabase.auth.getSession().then(({ data }) => {
        void Promise.resolve(handler(data.session ?? null)).catch(console.error);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        void Promise.resolve(handler(session ?? null)).catch(console.error);
    });
    return data.subscription;
}
