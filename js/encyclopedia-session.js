/**
 * Initialize World Encyclopedia shelf + builder blob storage.
 */
import { isDesktopLocalHost } from "./desktop-auth.js?v=1";
import { LOCAL_GUEST_USER_ID } from "./local-studio-store.js?v=1";
import { resolveStudioSession } from "./studio-session.js?v=1";
import { initWorldEncyclopediaStore } from "./world-encyclopedia-store.js";
import { initEncyclopediaBlobStore } from "./encyclopedia-blob-store.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {import("@supabase/supabase-js").Session | null} [session]
 */
export async function resolveEncyclopediaStorageUid(supabase, session) {
    if (isDesktopLocalHost()) return LOCAL_GUEST_USER_ID;
    if (session?.user?.id) return session.user.id;
    const resolved = await resolveStudioSession(supabase);
    if (resolved.mode === "local") return LOCAL_GUEST_USER_ID;
    if (resolved.mode === "cloud") return resolved.user.id;
    return null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {import("@supabase/supabase-js").Session | string | null | undefined} [sessionOrUid]
 */
export async function initEncyclopediaSession(supabase, sessionOrUid) {
    let uid;
    if (isDesktopLocalHost()) {
        uid = LOCAL_GUEST_USER_ID;
    } else if (typeof sessionOrUid === "string") {
        uid = sessionOrUid;
    } else {
        uid = await resolveEncyclopediaStorageUid(supabase, sessionOrUid ?? null);
    }

    const [shelf, blobs] = await Promise.all([
        initWorldEncyclopediaStore(supabase, uid),
        initEncyclopediaBlobStore(supabase, uid)
    ]);
    return { shelf, blobs, uid };
}
