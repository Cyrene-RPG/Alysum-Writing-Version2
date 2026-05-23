/**
 * Sign in and load encyclopedia blob storage before mounting a magic codex page.
 */

import { supabase } from "../firebase.js";
import { wireSupabaseSession } from "./supabase-session.js?v=1";
import { initEncyclopediaSession } from "./encyclopedia-session.js?v=1";

/**
 * @param {(encId: string | null) => void | Promise<void>} run
 */
export function bootMagicSystemPage(run) {
    const encId = new URLSearchParams(location.search).get("encyclopedia");
    const next = location.pathname + location.search;

    wireSupabaseSession(async (session) => {
        const user = session?.user;
        if (!user) {
            window.location.href = "login.html?next=" + encodeURIComponent(next);
            return;
        }
        try {
            await initEncyclopediaSession(supabase, user.id);
            await run(encId);
        } catch (err) {
            console.error(err);
            alert("Could not load magic system — refresh or try again.");
        }
    });
}
