/**
 * Scheduled chapter releases — queue future chapter drops for published books.
 * Requires supabase-scheduled-chapter-releases.sql applied in Supabase.
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
 * Format a schedule datetime for datetime-local input value.
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
 * Convert datetime-local value to ISO string for RPC.
 * @param {string} localValue
 * @returns {string}
 */
export function fromDatetimeLocalValue(localValue) {
    if (!localValue) return "";
    const d = new Date(localValue);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toISOString();
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
