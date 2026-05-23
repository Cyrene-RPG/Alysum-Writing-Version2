/**
 * Initialize World Encyclopedia shelf + builder blob storage for a signed-in user.
 */

import { initWorldEncyclopediaStore } from "./world-encyclopedia-store.js";
import { initEncyclopediaBlobStore } from "./encyclopedia-blob-store.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function initEncyclopediaSession(supabase, uid) {
    const [shelf, blobs] = await Promise.all([
        initWorldEncyclopediaStore(supabase, uid),
        initEncyclopediaBlobStore(supabase, uid)
    ]);
    return { shelf, blobs };
}
