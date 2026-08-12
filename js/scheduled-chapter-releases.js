/**
 * Scheduled chapter releases — queue future chapter drops for published books.
 * Requires supabase-scheduled-chapter-releases.sql applied in Supabase.
 *
 * Schedule times are authored in the browser's local timezone (datetime-local),
 * stored as absolute UTC (timestamptz), and shown back in the viewer's local zone.
 */

import { supabase } from "../firebase.js";

/** @typedef {{
 *   id: string,
 *   chapterId: string,
 *   scheduledAt: string,
 *   status: string,
 *   createdAt?: string,
 * }} ScheduledChapterRelease
 */

/**
 * @param {string} bookId
 * @returns {Promise<ScheduledChapterRelease[]>}
 */
export async function listScheduledChapterReleases(bookId) {
    const { data, error } = await supabase.rpc("list_scheduled_chapter_releases", {
        p_book_id: bookId,
    });
    if (error) {
        if (/function.*does not exist/i.test(error.message || "")) {
            return [];
        }
        throw error;
    }
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => ({
        id: String(row.id || ""),
        chapterId: String(row.chapterId || row.chapter_id || ""),
        scheduledAt: String(row.scheduledAt || row.scheduled_at || ""),
        status: String(row.status || "pending"),
        createdAt: row.createdAt || row.created_at || undefined,
    }));
}

/**
 * @param {string} scheduleId
 */
export async function cancelScheduledChapterRelease(scheduleId) {
    const { error } = await supabase.rpc("cancel_scheduled_chapter_release", {
        p_schedule_id: scheduleId,
    });
    if (error) throw error;
}

/**
 * @param {string} bookId
 * @param {Array<{ chapterId: string, scheduledAt: string }>} schedules
 */
export async function syncScheduledChapterReleases(bookId, schedules) {
    const { data, error } = await supabase.rpc("sync_scheduled_chapter_releases", {
        p_book_id: bookId,
        p_schedules: schedules,
    });
    if (error) throw error;
    return data && typeof data === "object" ? data : {};
}

/**
 * Release any due chapters for a book (or all books if bookId omitted).
 * Safe to call from reader pages — only processes past-due schedules.
 * @param {string} [bookId]
 */
export async function processDueChapterReleases(bookId) {
    const args = bookId ? { p_book_id: bookId } : { p_book_id: null };
    const { data, error } = await supabase.rpc("process_due_chapter_releases", args);
    if (error) {
        if (/function.*does not exist/i.test(error.message || "")) {
            return { releasedCount: 0, released: [] };
        }
        throw error;
    }
    const raw = data && typeof data === "object" ? data : {};
    return {
        releasedCount: Number(raw.releasedCount || 0),
        released: Array.isArray(raw.released) ? raw.released : [],
    };
}

/**
 * Minimum lead time before a scheduled release (matches server rule).
 */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

/**
 * IANA timezone for the current user/browser, e.g. "America/Los_Angeles".
 * @returns {string}
 */
export function getUserTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
    } catch {
        return "local";
    }
}

/**
 * Human label for the author schedule UI, e.g. "America/Los Angeles (PDT)".
 * @returns {string}
 */
export function formatUserTimeZoneLabel() {
    const tz = getUserTimeZone();
    const pretty = String(tz).replace(/_/g, " ");
    try {
        const parts = new Intl.DateTimeFormat(undefined, {
            timeZone: tz === "local" ? undefined : tz,
            timeZoneName: "short",
        }).formatToParts(new Date());
        const abbr = parts.find((part) => part.type === "timeZoneName")?.value;
        return abbr ? `${pretty} (${abbr})` : pretty;
    } catch {
        return pretty;
    }
}

/**
 * @param {string} isoOrLocal
 * @returns {boolean}
 */
export function isValidFutureSchedule(isoOrLocal) {
    if (!isoOrLocal) return false;
    const t = Date.parse(isoOrLocal);
    if (!Number.isFinite(t)) return false;
    return t > Date.now() + MIN_SCHEDULE_LEAD_MS;
}

/**
 * Format a schedule datetime for datetime-local input value (user's local wall time).
 * @param {string} iso
 * @returns {string}
 */
export function toDatetimeLocalValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert datetime-local value (user's local wall time) to UTC ISO for RPC storage.
 * Parses components explicitly so engines never treat the naïve string as UTC.
 * @param {string} localValue
 * @returns {string}
 */
export function fromDatetimeLocalValue(localValue) {
    if (!localValue) return "";
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(localValue).trim());
    if (!match) {
        const fallback = new Date(localValue);
        if (!Number.isFinite(fallback.getTime())) return "";
        return fallback.toISOString();
    }
    const d = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        match[6] ? Number(match[6]) : 0,
        0
    );
    if (!Number.isFinite(d.getTime())) return "";
    return d.toISOString();
}

/**
 * Format a stored UTC instant for display in the viewer's local timezone.
 * @param {string} iso
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatScheduleDisplay(iso, options = {}) {
    if (!iso) return "Unknown time";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "Unknown time";
    return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZoneName: "short",
        ...options,
    });
}

/**
 * When republishing a subset of chapters, keep already-live IDs, add new immediate
 * releases, and hide chapters that are newly scheduled until their release time.
 * @param {string[]} existingIds
 * @param {string[]} immediateIds
 * @param {string[]} [scheduledIds]
 * @returns {string[]}
 */
export function mergePublishedChapterIds(existingIds, immediateIds, scheduledIds = []) {
    const scheduled = new Set((scheduledIds || []).filter((id) => typeof id === "string" && id));
    const out = [];
    const seen = new Set();
    for (const id of [...(existingIds || []), ...(immediateIds || [])]) {
        if (typeof id !== "string" || !id || scheduled.has(id) || seen.has(id)) continue;
        out.push(id);
        seen.add(id);
    }
    return out;
}

/**
 * Merge library chapter payloads so a partial republish does not wipe other chapters.
 * @param {Array<Record<string, unknown>>} existingChapters
 * @param {Array<Record<string, unknown>>} selectedChapters
 * @param {string[]} [preferredOrderIds]
 * @returns {Array<Record<string, unknown>>}
 */
export function mergeLibraryChapters(existingChapters, selectedChapters, preferredOrderIds = []) {
    const byId = new Map();
    for (const chapter of existingChapters || []) {
        const id = chapter?.id;
        if (typeof id === "string" && id) byId.set(id, chapter);
    }
    for (const chapter of selectedChapters || []) {
        const id = chapter?.id;
        if (typeof id === "string" && id) byId.set(id, chapter);
    }

    const order = [];
    const seen = new Set();
    for (const id of preferredOrderIds || []) {
        if (!byId.has(id) || seen.has(id)) continue;
        order.push(id);
        seen.add(id);
    }
    for (const id of byId.keys()) {
        if (seen.has(id)) continue;
        order.push(id);
        seen.add(id);
    }

    return order.map((id, index) => ({
        ...byId.get(id),
        order: index + 1,
    }));
}

/**
 * Build the sync payload for the current selection while keeping schedules for
 * chapters that are not part of this publish action.
 * @param {Array<{ chapterId: string, scheduledAt: string }>} selectedSchedules
 * @param {ScheduledChapterRelease[]} pendingReleases
 * @param {Iterable<string>} selectedChapterIds
 */
export function buildScheduleSyncPayload(selectedSchedules, pendingReleases, selectedChapterIds) {
    const selected = new Set(
        [...(selectedChapterIds || [])].filter((id) => typeof id === "string" && id)
    );
    const payload = [];
    const seen = new Set();

    for (const item of selectedSchedules || []) {
        const chapterId = String(item?.chapterId || "").trim();
        const scheduledAt = String(item?.scheduledAt || "").trim();
        if (!chapterId || !scheduledAt || seen.has(chapterId)) continue;
        payload.push({ chapterId, scheduledAt });
        seen.add(chapterId);
    }

    for (const row of pendingReleases || []) {
        if (row?.status && row.status !== "pending") continue;
        const chapterId = String(row.chapterId || "").trim();
        const scheduledAt = String(row.scheduledAt || "").trim();
        if (!chapterId || !scheduledAt || selected.has(chapterId) || seen.has(chapterId)) continue;
        payload.push({ chapterId, scheduledAt });
        seen.add(chapterId);
    }

    return payload;
}

/**
 * Earliest future pending chapter release for readers (public RPC).
 * @param {string} bookId
 * @returns {Promise<{ chapterId: string, scheduledAt: string, chapterTitle: string } | null>}
 */
export async function getNextChapterRelease(bookId) {
    const id = String(bookId ?? "").trim();
    if (!id) return null;

    const { data, error } = await supabase.rpc("get_next_chapter_release", {
        p_book_id: id,
    });
    if (error) {
        if (/function.*does not exist/i.test(error.message || "")) {
            return null;
        }
        throw error;
    }
    if (!data || typeof data !== "object") return null;

    const scheduledAt = String(data.scheduledAt || data.scheduled_at || "").trim();
    if (!scheduledAt) return null;

    return {
        chapterId: String(data.chapterId || data.chapter_id || ""),
        scheduledAt,
        chapterTitle: String(data.chapterTitle || data.chapter_title || "Next chapter").trim() || "Next chapter",
    };
}
