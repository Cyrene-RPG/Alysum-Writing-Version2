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
    const [shelfResult, blobsResult] = await Promise.allSettled([
        initWorldEncyclopediaStore(supabase, uid),
        initEncyclopediaBlobStore(supabase, uid)
    ]);

    if (shelfResult.status === "rejected") {
        throw shelfResult.reason;
    }

    if (blobsResult.status === "rejected") {
        console.warn("Encyclopedia blob store init failed:", blobsResult.reason);
    }

    return {
        shelf: shelfResult.value,
        blobs:
            blobsResult.status === "fulfilled"
                ? blobsResult.value
                : { mode: "local", tableMissing: true }
    };
}
