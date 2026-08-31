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
        xp: row.xp,
        reputation: row.reputation,
        xpLevel: row.xp_level ?? row.xpLevel,
        writingDurableWords: row.writing_durable_words ?? row.writingDurableWords,
        wornBorder: row.worn_border ?? row.wornBorder,
        borderUnlockMax: row.border_unlock_max ?? row.borderUnlockMax,
        repColorUnlock: row.rep_color_unlock ?? row.repColorUnlock,
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
        // Stats columns land with supabase-statistics.sql — tolerate their absence.
        let stats = null;
        try {
            const { data: s, error: e } = await supabase
                .from("users")
                .select("xp, reputation, xp_level, writing_durable_words, worn_border, border_unlock_max, rep_color_unlock")
                .eq("id", session.user.id)
                .maybeSingle();
            if (!e) stats = s;
        } catch {
            /* not migrated yet */
        }
        const profile = {
            name: data?.display_name || data?.username || session.user?.email || fallback.name || "A",
            imageUrl: String(data?.profile_image_url || "").trim(),
            streak: data?.streak ?? fallback.streak,
            dailyWordGoal: data?.daily_word_goal ?? fallback.dailyWordGoal,
            writingDayTotals: data?.writing_day_totals ?? fallback.writingDayTotals,
            xp: stats?.xp ?? fallback.xp ?? 0,
            reputation: stats?.reputation ?? fallback.reputation ?? 0,
            xpLevel: stats?.xp_level ?? fallback.xpLevel ?? 0,
            writingDurableWords: stats?.writing_durable_words ?? fallback.writingDurableWords ?? 0,
            wornBorder: stats?.worn_border ?? fallback.wornBorder ?? 0,
            borderUnlockMax: stats?.border_unlock_max ?? fallback.borderUnlockMax ?? 0,
            repColorUnlock: stats?.rep_color_unlock ?? fallback.repColorUnlock ?? 0,
        };
        writeProfileCache(session.user.id, profile);
        return profile;
    } catch {
        return fallback;
    }
}
