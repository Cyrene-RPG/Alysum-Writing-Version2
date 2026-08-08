/**
 * Public author profiles: biography pages and reader/library author links.
 */
import { publicDisplayNameFromUserData } from "./profile-display.js?v=1";
import { normalizeMediaFormat, isComicFormat } from "./book-media-format.js?v=1";
import {
    formatChapterProgress,
    serializationFromBookData,
} from "./story-serialization.js?v=1";

export const AUTHOR_BIO_MAX_LENGTH = 2000;

export function authorPageUrl(username) {
    const handle = String(username ?? "").trim();
    if (!handle) return null;
    return `author.html?u=${encodeURIComponent(handle)}`;
}

export function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function escapeAttribute(str) {
    return escapeHtml(str).replace(/`/g, "&#096;");
}

/** @param {{ username?: string, label?: string, className?: string }} opts */
export function authorLinkHtml({ username, label, className = "author-link" }) {
    const url = authorPageUrl(username);
    const text = escapeHtml(label || username || "author");
    if (!url) return `@${text}`;
    return `<a class="${escapeHtml(className)}" href="${escapeAttribute(url)}">@${text}</a>`;
}

export function normalizeAuthorProfile(row) {
    if (!row || typeof row !== "object") return null;
    const username = String(row.username ?? "").trim();
    if (!username) return null;
    return {
        id: row.id,
        username,
        displayName: publicDisplayNameFromUserData(row),
        profileImageUrl: String(row.profile_image_url ?? row.profileImageUrl ?? "").trim(),
        bio: String(row.bio ?? "").trim(),
        accountType: String(row.account_type ?? row.accountType ?? "").trim(),
    };
}

function libraryRowData(row) {
    const data = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
    return Object.keys(data).length ? data : row && typeof row === "object" ? row : {};
}

/** Compact book card data for author pages and reader end sections. */
export function normalizePublishedBookPreview(row) {
    const data = libraryRowData(row);
    const id = String(row?.id || data.id || data.bookId || "").trim();
    if (!id) return null;
    if (data.isPublished === false) return null;
    if (data.isAnonymous) return null;
    const mediaFormat = normalizeMediaFormat(data.mediaFormat ?? data.media_format);
    const serialization = serializationFromBookData(data);
    const chapterProgressLabel = formatChapterProgress({
        publishedCount: serialization.publishedCount,
        plannedChapterCount: serialization.plannedChapterCount,
        chapterCount: serialization.chapterCount,
        serializationStatus: serialization.status,
        comic: isComicFormat(mediaFormat),
    });
    return {
        id,
        title: String(data.title || "Untitled").trim() || "Untitled",
        author: String(data.author || "Unknown").trim() || "Unknown",
        coverUrl: String(data.coverUrl || data.cover_url || "").trim(),
        summary: String(data.summary || "").trim(),
        chapterCount: serialization.chapterCount,
        publishedChapterCount: serialization.publishedCount,
        serializationStatus: serialization.status,
        plannedChapterCount: serialization.plannedChapterCount,
        chapterProgressLabel,
        mediaFormat,
        updated: typeof data.updated === "number" ? data.updated : 0,
        type: String(data.type || "fiction").trim() || "fiction",
    };
}

export async function fetchAuthorByUsername(supabase, username) {
    const handle = String(username ?? "").trim();
    if (!handle) return null;
    const { data, error } = await supabase
        .from("users")
        .select("id, username, display_name, profile_image_url, bio, account_type")
        .ilike("username", handle)
        .maybeSingle();
    if (error) throw error;
    return normalizeAuthorProfile(data);
}

export async function fetchAuthorById(supabase, userId) {
    const id = String(userId ?? "").trim();
    if (!id) return null;
    const { data, error } = await supabase
        .from("users")
        .select("id, username, display_name, profile_image_url, bio, account_type")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    return normalizeAuthorProfile(data);
}

/** @returns {Promise<Map<string, string>>} user id → username */
export async function fetchUsernamesByIds(supabase, userIds) {
    const ids = [...new Set(userIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;

    const chunkSize = 80;
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase.from("users").select("id, username").in("id", chunk);
        if (error) throw error;
        for (const row of data || []) {
            const username = String(row.username ?? "").trim();
            if (username) map.set(row.id, username);
        }
    }
    return map;
}

export async function fetchPublishedWorksForAuthor(supabase, userId, { excludeBookId } = {}) {
    const id = String(userId ?? "").trim();
    if (!id) return [];
    const { data, error } = await supabase.from("library").select("*").eq("user_id", id);
    if (error) throw error;

    const exclude = String(excludeBookId ?? "").trim();
    return (data || [])
        .map((row) => normalizePublishedBookPreview(row))
        .filter(Boolean)
        .filter((book) => !exclude || book.id !== exclude)
        .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export function authorInitial(label) {
    return String(label || "A").trim()[0]?.toUpperCase() || "A";
}
