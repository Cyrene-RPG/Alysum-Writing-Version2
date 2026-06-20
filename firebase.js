import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const supabaseKey = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined
    }
});
