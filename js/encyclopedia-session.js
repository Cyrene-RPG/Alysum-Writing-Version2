/**
 * Initialize World Encyclopedia shelf + builder blob storage for a signed-in user.
 */

import { initWorldEncyclopediaStore } from "./world-encyclopedia-store.js";
import { initEncyclopediaBlobStore } from "./encyclopedia-blob-store.js";

/** @type {Promise<unknown> | null} */
let sessionInitPromise = null;
/** @type {string | null} */
let sessionInitUid = null;

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function initEncyclopediaSession(supabase, uid) {
    if (sessionInitUid === uid && sessionInitPromise) {
        return sessionInitPromise;
    }

    sessionInitUid = uid;
    sessionInitPromise = (async () => {
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
    })().catch((err) => {
        sessionInitPromise = null;
        throw err;
    });

    return sessionInitPromise;
}
