/**
 * Display name + avatar for Studio/Editor welcome bars.
 */
import { getProfileRow } from "../synchronization-engine/local-adapter.js";

export async function loadWorkspaceProfile(supabase, session) {
    if (!session || session.mode === "none") return { name: "A", imageUrl: "" };
    if (session.mode === "local") {
        const row = getProfileRow() || {};
        return {
            name: row.display_name || row.username || "Guest",
            imageUrl: String(row.profile_image_url || "").trim()
        };
    }
    try {
        const { data } = await supabase
            .from("users")
            .select("display_name, username, profile_image_url")
            .eq("id", session.user.id)
            .maybeSingle();
        return {
            name: data?.display_name || data?.username || session.user?.email || "A",
            imageUrl: String(data?.profile_image_url || "").trim()
        };
    } catch {
        return { name: session.user?.email || "A", imageUrl: "" };
    }
}
