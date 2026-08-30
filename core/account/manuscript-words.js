/**
 * Words actually added to manuscripts, by local calendar day.
 * Separate from the old writing_day_totals typing log so Studio month/week
 * only count editor saves from this tracker.
 */
import { getProfileRow, updateProfileRow } from "../synchronization-engine/local-adapter.js";
import {
    applyWritingDayDelta,
    localDayKey,
    normalizeWritingDayTotals,
    wordsThisLocalMonth,
    wordsThisLocalWeek,
} from "../writing-engine/day-stats.js";

export const MANUSCRIPT_DAY_BUCKET = "__manuscript";
const LOCAL_KEY_PREFIX = "alysum:manuscript-day-words:";

function storageKey(userId) {
    return LOCAL_KEY_PREFIX + String(userId || "");
}

function readLocalMap(userId) {
    try {
        return normalizeWritingDayTotals(JSON.parse(localStorage.getItem(storageKey(userId)) || "{}"));
    } catch {
        return {};
    }
}

function writeLocalMap(userId, map) {
    try {
        localStorage.setItem(storageKey(userId), JSON.stringify(map));
    } catch {
        /* ignore quota */
    }
}

function mergeDayMaps(a, b) {
    const out = { ...normalizeWritingDayTotals(a) };
    for (const [day, words] of Object.entries(normalizeWritingDayTotals(b))) {
        out[day] = Math.max(out[day] || 0, words);
    }
    return out;
}

function manuscriptMapFromProfile(writingDayTotals) {
    const src = writingDayTotals && typeof writingDayTotals === "object" ? writingDayTotals : {};
    return normalizeWritingDayTotals(src[MANUSCRIPT_DAY_BUCKET]);
}

export function readManuscriptDayTotals(writingDayTotals, userId) {
    return mergeDayMaps(manuscriptMapFromProfile(writingDayTotals), readLocalMap(userId));
}

export function manuscriptWordsThisMonth(writingDayTotals, userId, d = new Date()) {
    return wordsThisLocalMonth(readManuscriptDayTotals(writingDayTotals, userId), d);
}

export function manuscriptWordsThisWeek(writingDayTotals, userId, d = new Date()) {
    return wordsThisLocalWeek(readManuscriptDayTotals(writingDayTotals, userId), d);
}

let cloudTimer = 0;
let pending = null;

async function persistCloud(job) {
    const { supabase, userId, day, add } = job;
    if (!supabase || !userId || add <= 0) return;
    const { data } = await supabase
        .from("users")
        .select("writing_day_totals")
        .eq("id", userId)
        .maybeSingle();
    const current = data?.writing_day_totals && typeof data.writing_day_totals === "object"
        ? data.writing_day_totals
        : {};
    const fromCloud = applyWritingDayDelta(manuscriptMapFromProfile(current), day, add).nextTotals;
    const merged = mergeDayMaps(fromCloud, readLocalMap(userId));
    const { error } = await supabase
        .from("users")
        .update({ writing_day_totals: { ...current, [MANUSCRIPT_DAY_BUCKET]: merged } })
        .eq("id", userId);
    if (error) throw error;
    writeLocalMap(userId, merged);
}

function flushCloud() {
    const job = pending;
    pending = null;
    if (!job) return;
    void persistCloud(job).catch(() => {});
}

function queueCloud(supabase, userId, day, add) {
    if (pending && pending.day !== day) flushCloud();
    if (pending && pending.userId === userId && pending.day === day) {
        pending.add += add;
    } else {
        pending = { supabase, userId, day, add };
    }
    clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(flushCloud, 800);
}

/**
 * Record a net increase in manuscript words for today.
 * No-ops on zero/negative (deletes do not shrink the day total).
 */
export function recordManuscriptWordGain({ userId, supabase, isLocal = false, gained } = {}) {
    const add = Number(gained);
    if (!userId || !Number.isFinite(add) || add <= 0) return;
    const day = localDayKey();
    const nextMap = applyWritingDayDelta(readLocalMap(userId), day, add).nextTotals;
    writeLocalMap(userId, nextMap);
    if (isLocal) {
        const row = getProfileRow() || {};
        const totals = row.writing_day_totals && typeof row.writing_day_totals === "object"
            ? row.writing_day_totals
            : {};
        updateProfileRow({
            writing_day_totals: {
                ...totals,
                [MANUSCRIPT_DAY_BUCKET]: mergeDayMaps(manuscriptMapFromProfile(totals), nextMap),
            },
        });
        return;
    }
    queueCloud(supabase, userId, day, add);
}
