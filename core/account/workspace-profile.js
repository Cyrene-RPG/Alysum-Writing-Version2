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
            imageUrl: String(row.profile_image_url || "").trim(),
            streak: row.streak,
            dailyWordGoal: row.daily_word_goal ?? row.dailyWordGoal,
            writingDayTotals: row.writing_day_totals ?? row.writingDayTotals,
        };
    }
    try {
        const { data } = await supabase
            .from("users")
            .select("display_name, username, profile_image_url, streak, daily_word_goal, writing_day_totals")
            .eq("id", session.user.id)
            .maybeSingle();
        return {
            name: data?.display_name || data?.username || session.user?.email || "A",
            imageUrl: String(data?.profile_image_url || "").trim(),
            streak: data?.streak,
            dailyWordGoal: data?.daily_word_goal,
            writingDayTotals: data?.writing_day_totals,
        };
    } catch {
        return { name: session.user?.email || "A", imageUrl: "" };
    }
}
