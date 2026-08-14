import { supabase } from "./client.js";
import { wireUserPresence } from "./presence.js";

/**
 * Invokes handler with the current session right away (getSession), then on every auth change.
 * Fixes pages that only subscribed to onAuthStateChange and never received an initial callback.
 *
 * @param {(session: import("@supabase/supabase-js").Session | null, event?: string) => void | Promise<void>} handler
 */
export function wireSupabaseSession(handler) {
    void supabase.auth.getSession().then(({ data }) => {
        const session = data.session ?? null;
        wireUserPresence(session);
        void Promise.resolve(handler(session, "INITIAL_SESSION")).catch(console.error);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        wireUserPresence(session ?? null);
        void Promise.resolve(handler(session ?? null, event)).catch(console.error);
    });
    return data.subscription;
}
