import { IS_EDITOR_TEST, blockTestCloudAccess } from "../desktop/test-mode.js";

// Do not initialize the SDK, refresh tokens, or read existing auth storage in tests.
const createClient = IS_EDITOR_TEST ? null : (await import("https://esm.sh/@supabase/supabase-js@2")).createClient;

/** Deleted Supabase project — purge stale browser sessions so refresh does not hit a dead domain. */
const DEAD_SUPABASE_PROJECT = "tiqmhozzxhiydjnyuuaw";
if (!IS_EDITOR_TEST && typeof window !== "undefined" && window.localStorage) {
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

export const supabase = IS_EDITOR_TEST ? {
    from: blockTestCloudAccess,
    rpc: blockTestCloudAccess,
    channel: blockTestCloudAccess,
    storage: { from: blockTestCloudAccess },
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
    },
} : createClient(supabaseUrl, supabaseKey, {
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

