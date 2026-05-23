/**
 * Initialize World Encyclopedia shelf + builder blob storage.
 */

import { initWorldEncyclopediaStore } from "./world-encyclopedia-store.js";
import { initEncyclopediaBlobStore } from "./encyclopedia-blob-store.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {string | null} uid
 */
export async function initEncyclopediaSession(supabase, uid) {
    const [shelf, blobs] = await Promise.all([
        initWorldEncyclopediaStore(supabase, uid || null),
        initEncyclopediaBlobStore(supabase, uid || null)
    ]);
    return { shelf, blobs };
}
