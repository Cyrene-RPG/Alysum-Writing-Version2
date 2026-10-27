import { authStorageOptions } from "./tab-session.js";
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
        ...authStorageOptions(new URL(supabaseUrl).hostname.split(".")[0])
    },
    global: {
        fetch: async (input, init) => {
            const response = await fetch(input, init);
            const method = String(init?.method || input?.method || "GET").toUpperCase();
            if (response.status !== 522 || !["GET", "HEAD"].includes(method)) return response;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return fetch(input, init);
        },
    },
});


if(typeof window!=='undefined'){
 const track=session=>{setTimeout(()=>void import('./presence.js?v=2').then(m=>m.wireUserPresence(session,supabase)),0);};
 supabase.auth.getSession().then(({data})=>track(data?.session)).catch(()=>{});
 supabase.auth.onAuthStateChange((_event,session)=>track(session));
}
