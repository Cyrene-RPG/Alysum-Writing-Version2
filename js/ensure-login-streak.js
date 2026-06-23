/**
 * Daily login streak — compare last_login (local YYYY-MM-DD) to today.
 * Same-day revisits never decrease the streak; session cache keeps one count per day.
 */
import { localDayKey } from "./writing-day-stats.js?v=1";

const CACHE_PREFIX = "alysum-login-streak-v1:";

export function daysBetweenLocalDates(dateA, dateB) {
    const a = new Date(dateA + "T00:00:00");
    const b = new Date(dateB + "T00:00:00");
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function readLastLogin(profile) {
    if (typeof profile?.lastLogin === "string") return profile.lastLogin.trim();
    if (typeof profile?.last_login === "string") return profile.last_login.trim();
    return "";
}

function readStreak(profile) {
    const n = Number(profile?.streak);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function readCachedLoginStreak(userId, today = localDayKey()) {
    if (!userId) return null;
    try {
        const raw = sessionStorage.getItem(`${CACHE_PREFIX}${userId}:${today}`);
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    } catch {
        return null;
    }
}

export function cacheLoginStreak(userId, streak, today = localDayKey()) {
    if (!userId || !Number.isFinite(streak) || streak < 1) return;
    try {
        sessionStorage.setItem(`${CACHE_PREFIX}${userId}:${today}`, String(Math.floor(streak)));
    } catch {
        /* ignore */
    }
}

/**
 * @param {object} profile
 * @param {string} [today]
 * @param {number} [floorStreak] — minimum from session cache (same browser day)
 * @returns {{ streak: number, lastLogin: string, shouldPersist: boolean }}
 */
export function computeLoginStreak(profile, today = localDayKey(), floorStreak = 0) {
    const lastLogin = readLastLogin(profile);
    const currentStreak = readStreak(profile);
    const floor = Number.isFinite(floorStreak) && floorStreak > 0 ? Math.floor(floorStreak) : 0;
    const baseline = Math.max(currentStreak, floor);

    if (!lastLogin) {
        const streak = Math.max(baseline, 1);
        return { streak, lastLogin: today, shouldPersist: true };
    }

    const diff = daysBetweenLocalDates(lastLogin, today);

    // Already logged in today (or clock skew) — keep streak, never drop it
    if (diff <= 0) {
        const streak = Math.max(baseline, 1);
        const shouldPersist =
            streak !== currentStreak || (diff === 0 && lastLogin !== today);
        return {
            streak,
            lastLogin: diff === 0 ? lastLogin : today,
            shouldPersist,
        };
    }

    if (diff === 1) {
        let streak;
        if (floor > currentStreak) {
            // This browser session already counted today's login
            streak = floor;
        } else {
            streak = Math.max(currentStreak, 0) + 1;
        }
        return {
            streak,
            lastLogin: today,
            shouldPersist: streak !== currentStreak || lastLogin !== today,
        };
    }

    // Missed one or more days — start fresh (unless session already recorded today)
    if (floor > 0) {
        return {
            streak: floor,
            lastLogin: today,
            shouldPersist: floor !== currentStreak || lastLogin !== today,
        };
    }
    return { streak: 1, lastLogin: today, shouldPersist: true };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {object} profile
 * @returns {Promise<{ streak: number, lastLogin: string }>}
 */
export async function ensureLoginStreakCloud(supabase, userId, profile) {
    const today = localDayKey();
    const cached = readCachedLoginStreak(userId, today);
    const lastLogin = readLastLogin(profile);

    // Same calendar day already handled this session — keep that count
    if (cached !== null && lastLogin === today) {
        return { streak: Math.max(cached, readStreak(profile)), lastLogin: today };
    }

    const next = computeLoginStreak(profile, today, cached ?? 0);

    if (!next.shouldPersist) {
        cacheLoginStreak(userId, next.streak, today);
        return { streak: next.streak, lastLogin: next.lastLogin };
    }

    const fields = { last_login: next.lastLogin, streak: next.streak };
    const { error } = await supabase.from("users").update(fields).eq("id", userId);
    if (error) {
        if (String(error.message || "").includes("last_login")) {
            const { error: retryError } = await supabase
                .from("users")
                .update({ streak: next.streak })
                .eq("id", userId);
            if (retryError) throw retryError;
        } else {
            throw error;
        }
    }

    cacheLoginStreak(userId, next.streak, today);
    return { streak: next.streak, lastLogin: next.lastLogin };
}

/**
 * Local studio profile row patch.
 * @param {object} profile
 * @param {(fields: object) => object} updateProfileRow
 */
export function ensureLoginStreakLocalPatch(profile, updateProfileRow) {
    const today = localDayKey();
    const userId = profile?.id || "local";
    const cached = readCachedLoginStreak(userId, today);
    const lastLogin = readLastLogin(profile);

    if (cached !== null && lastLogin === today) {
        const streak = Math.max(cached, readStreak(profile));
        cacheLoginStreak(userId, streak, today);
        if (streak !== readStreak(profile)) {
            return updateProfileRow({ streak });
        }
        return profile;
    }

    const next = computeLoginStreak(profile, today, cached ?? 0);

    if (!next.shouldPersist) {
        cacheLoginStreak(userId, next.streak, today);
        return profile;
    }

    const updated = updateProfileRow({
        last_login: next.lastLogin,
        streak: next.streak,
    });
    cacheLoginStreak(userId, next.streak, today);
    return updated;
}
