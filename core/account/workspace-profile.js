/**
 * Display name + avatar for Studio/Editor welcome bars.
 * Peek is local and instant; loadWorkspaceProfile refreshes from the site.
 */
import { getProfileRow } from "../synchronization-engine/local-adapter.js";

const CACHE_PREFIX = "alysum:workspace-profile:";

function cacheKey(userId) {
    return CACHE_PREFIX + String(userId || "");
}

function fromLocalRow() {
    const row = getProfileRow() || {};
    return {
        name: row.display_name || row.username || "Guest",
        imageUrl: String(row.profile_image_url || "").trim(),
        streak: row.streak,
        dailyWordGoal: row.daily_word_goal ?? row.dailyWordGoal,
        writingDayTotals: row.writing_day_totals ?? row.writingDayTotals,
    };
}

function readProfileCache(userId) {
    try {
        const raw = localStorage.getItem(cacheKey(userId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function writeProfileCache(userId, profile) {
    if (!userId || !profile) return;
    try {
        localStorage.setItem(cacheKey(userId), JSON.stringify(profile));
    } catch {
        /* ignore quota */
    }
}

export function peekWorkspaceProfile(session) {
    if (!session || session.mode === "none") return { name: "A", imageUrl: "" };
    if (session.mode === "local") return fromLocalRow();
    return readProfileCache(session.user?.id) || {
        name: session.user?.email || "A",
        imageUrl: "",
    };
}

export async function loadWorkspaceProfile(supabase, session) {
    if (!session || session.mode === "none") return { name: "A", imageUrl: "" };
    if (session.mode === "local") return fromLocalRow();
    const fallback = peekWorkspaceProfile(session);
    try {
        const { data } = await supabase
            .from("users")
            .select("display_name, username, profile_image_url, streak, daily_word_goal, writing_day_totals")
            .eq("id", session.user.id)
            .maybeSingle();
        const profile = {
            name: data?.display_name || data?.username || session.user?.email || fallback.name || "A",
            imageUrl: String(data?.profile_image_url || "").trim(),
            streak: data?.streak ?? fallback.streak,
            dailyWordGoal: data?.daily_word_goal ?? fallback.dailyWordGoal,
            writingDayTotals: data?.writing_day_totals ?? fallback.writingDayTotals,
        };
        writeProfileCache(session.user.id, profile);
        return profile;
    } catch {
        return fallback;
    }
}
