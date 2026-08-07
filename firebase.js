import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Deleted Supabase project — purge stale browser sessions so refresh does not hit a dead domain. */
const DEAD_SUPABASE_PROJECT = "tiqmhozzxhiydjnyuuaw";
if (typeof window !== "undefined" && window.localStorage) {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`sb-${DEAD_SUPABASE_PROJECT}`)) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        /* ignore */
    }
}

const supabaseUrl = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const supabaseKey = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined
    },
    global: {
        fetch: async (input, init) => {
            const response = await fetch(input, init);
            if (response.status !== 522) return response;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return fetch(input, init);
        },
    },
});

if (typeof window !== "undefined") {
    import("./js/user-presence.js").then((m) => m.bootUserPresence()).catch(() => {});
}
