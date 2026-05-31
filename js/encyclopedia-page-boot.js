/**
 * Boot encyclopedia builder pages — local works without sign-in; cloud when logged in.
 */

import { supabase } from "../firebase.js";
import { isDesktopLocalHost } from "./desktop-auth.js?v=1";
import { wireSupabaseSession } from "./supabase-session.js";
import { initEncyclopediaSession } from "./encyclopedia-session.js";

/**
 * Run immediately from device-local cache, then init cloud storage when auth is ready.
 *
 * @param {(session: import("@supabase/supabase-js").Session | null) => void | Promise<void>} run
 */
export function wireEncyclopediaStorage(run) {
    void (async () => {
        try {
            await initEncyclopediaSession(supabase);
        } catch (err) {
            console.warn("Encyclopedia storage init:", err);
        }
        await Promise.resolve(run(null)).catch(console.error);
    })();

    let synced = false;
    wireSupabaseSession(async (session) => {
        if (synced && !isDesktopLocalHost()) return;
        synced = true;
        try {
            await initEncyclopediaSession(supabase);
        } catch (err) {
            console.warn("Encyclopedia storage init:", err);
        }
        await run(session);
    });
}

/**
 * @param {(encId: string | null) => void | Promise<void>} run
 */
export function bootMagicSystemPage(run) {
    const encId = new URLSearchParams(location.search).get("encyclopedia");
    wireEncyclopediaStorage(async () => {
        await run(encId);
    });
}
