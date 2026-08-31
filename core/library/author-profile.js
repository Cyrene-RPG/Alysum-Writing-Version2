/**
 * Public author profiles: biography pages and reader/library author links.
 */
import { publicDisplayNameFromUserData } from "../account/profile-display.js";
import { normalizeMediaFormat, isComicFormat } from "../writing-engine/media-format.js";
import {
    formatChapterProgress,
    serializationFromBookData,
} from "../publishing/serialization.js";
import { normalizeGenreList, partitionGenresAndTags } from "../publishing/genres.js";
import { normalizeCrop } from "../publishing/cover-upload.js";
import {
    DEFAULT_PAGE_LOOK,
    normalizeHexColor,
    normalizePageBgId,
    normalizePageLook,
    normalizePageLookSaved,
    normalizeTextColor,
} from "../publishing/publish-meta.js?v=7";

export const AUTHOR_BIO_MAX_LENGTH = 2000;
export const AUTHOR_SUPPORT_URL_MAX_LENGTH = 500;

/** Fixed tip / social slots authors can fill in Settings → Author page. */
export const AUTHOR_SUPPORT_LINK_KINDS = [
    { id: "paypal", label: "PayPal", placeholder: "https://paypal.me/yourname" },
    { id: "kofi", label: "Ko-fi", placeholder: "https://ko-fi.com/yourname" },
    { id: "cashapp", label: "Cash App", placeholder: "https://cash.app/$yourname" },
    { id: "patreon", label: "Patreon", placeholder: "https://www.patreon.com/yourname" },
    { id: "website", label: "Website / store", placeholder: "https://your-shop-or-site.com" },
    { id: "social", label: "Social media", placeholder: "https://…" },
    { id: "other", label: "Other", placeholder: "https://…" },
];

const SUPPORT_KIND_IDS = new Set(AUTHOR_SUPPORT_LINK_KINDS.map((k) => k.id));

export function authorPageUrl(username) {
    const handle = String(username ?? "").trim();
    if (!handle) return null;
    return `author.html?u=${encodeURIComponent(handle)}`;
}

/** Allow only http(s) URLs for public tip/social links. */
export function sanitizeSupportUrl(raw) {
    const value = String(raw ?? "").trim().slice(0, AUTHOR_SUPPORT_URL_MAX_LENGTH);
    if (!value) return "";
    let url;
    try {
        url = new URL(value.includes("://") ? value : `https://${value}`);
    } catch {
        return "";
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname) return "";
    return url.toString();
}

export function normalizeSupportLinks(raw) {
    const out = {};
    const source =
        raw && typeof raw === "object" && !Array.isArray(raw)
            ? raw
            : typeof raw === "string" && raw.trim()
              ? (() => {
                    try {
                        const parsed = JSON.parse(raw);
                        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
                    } catch {
                        return {};
                    }
                })()
              : {};
    for (const kind of AUTHOR_SUPPORT_LINK_KINDS) {
        const url = sanitizeSupportUrl(source[kind.id]);
        if (url) out[kind.id] = url;
    }
    return out;
}

export function supportLinksList(supportLinks) {
    const links = normalizeSupportLinks(supportLinks);
    return AUTHOR_SUPPORT_LINK_KINDS
        .filter((kind) => links[kind.id])
        .map((kind) => ({
            id: kind.id,
            label: kind.label,
            url: links[kind.id],
        }));
}

export function supportLinkKindLabel(id) {
    return AUTHOR_SUPPORT_LINK_KINDS.find((k) => k.id === id)?.label || "Link";
}

export function hasSupportLinks(supportLinks) {
    return supportLinksList(supportLinks).length > 0;
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
        supportLinks: normalizeSupportLinks(row.support_links ?? row.supportLinks),
        accountType: String(row.account_type ?? row.accountType ?? "").trim(),
    };
}

/** @param {Record<string, string>} draftMap kind id → raw url from form inputs */
export function supportLinksPayloadFromDraft(draftMap) {
    const cleaned = {};
    const source = draftMap && typeof draftMap === "object" ? draftMap : {};
    for (const kind of AUTHOR_SUPPORT_LINK_KINDS) {
        if (!SUPPORT_KIND_IDS.has(kind.id)) continue;
        const url = sanitizeSupportUrl(source[kind.id]);
        if (url) cleaned[kind.id] = url;
    }
    return cleaned;
}

function libraryRowData(row) {
    const data = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
    return Object.keys(data).length ? data : row && typeof row === "object" ? row : {};
}

/** Epoch ms from JSON numbers, numeric strings, or ISO timestamps. */
function parseTimeMs(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) {
        if (value <= 0) return 0;
        return value < 1e12 ? value * 1000 : value;
    }
    const raw = String(value).trim();
    if (!raw) return 0;
    if (/^\d+(\.\d+)?$/.test(raw)) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n < 1e12 ? n * 1000 : n;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
    const split = partitionGenresAndTags(
        normalizeGenreList(data),
        Array.isArray(data.tags) ? data.tags.map(String) : []
    );
    return {
        id,
        ownerUserId: String(row?.user_id || row?.userId || data.userId || "").trim(),
        title: String(data.title || "Untitled").trim() || "Untitled",
        author: String(data.author || "Unknown").trim() || "Unknown",
        coverUrl: String(data.coverUrl || data.cover_url || "").trim(),
        coverCrop: normalizeCrop(data.coverCrop || data.cover_crop),
        coverMini: normalizeCrop(data.coverMini || data.cover_mini),
        coverWide: normalizeCrop(data.coverWide || data.cover_wide),
        coverWideEnabled: Boolean(data.coverWideEnabled ?? data.cover_wide_enabled),
        summary: String(data.summary || "").trim(),
        chapterCount: serialization.chapterCount,
        publishedChapterCount: serialization.publishedCount,
        serializationStatus: serialization.status,
        plannedChapterCount: serialization.plannedChapterCount,
        chapterProgressLabel,
        mediaFormat,
        updated: parseTimeMs(data.updated ?? row?.updated_at ?? row?.updatedAt),
        createdAt: parseTimeMs(row?.created_at ?? row?.createdAt ?? data.createdAt),
        type: String(data.type || "fiction").trim() || "fiction",
        genre: split.genres[0] || "",
        genres: split.genres,
        rating: String(data.rating || "").trim(),
        tags: split.tags,
        warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
        followers: Number(data.followers) || 0,
        ratingScore: Number(data.ratingScore ?? data.rating_score) || 0,
        publishedAt: parseTimeMs(data.publishedAt ?? data.published_at),
        notesBefore: String(data.notesBefore || data.notes_before || "").trim(),
        notesAfter: String(data.notesAfter || data.notes_after || "").trim(),
        pageLook: normalizePageLook(data.pageLook || data.page_look) || DEFAULT_PAGE_LOOK,
        pageLookSaved: normalizePageLookSaved(data.pageLookSaved || data.page_look_saved),
        pageLookCustom: normalizeHexColor(data.pageLookCustom || data.page_look_custom),
        pageBgId: normalizePageBgId(data.pageBgId || data.page_bg_id)
            || (normalizeHexColor(data.pageBg || data.page_bg) ? "custom" : ""),
        pageBg: normalizeHexColor(data.pageBg || data.page_bg),
        textColor: normalizeTextColor(data.textColor || data.text_color),
        textColorMain: normalizeHexColor(data.textColorMain || data.text_color_main),
        textColorAccent: normalizeHexColor(data.textColorAccent || data.text_color_accent),
        siteAccent: normalizeTextColor(data.siteAccent || data.site_accent),
    };
}

export async function fetchLibraryCatalog(supabase) {
    const { data, error } = await queryLibraryCatalog(supabase, (table) => table.select("*"));
    if (error && isLibraryCatalogMissingError(error)) {
        const fallback = await supabase.from("library").select("*");
        if (fallback.error) throw fallback.error;
        return (fallback.data || []).map((row) => normalizePublishedBookPreview(row)).filter(Boolean);
    }
    if (error) throw error;
    return (data || []).map((row) => normalizePublishedBookPreview(row)).filter(Boolean);
}

const AUTHOR_PROFILE_SELECT =
    "id, username, display_name, profile_image_url, bio, support_links, account_type";
const AUTHOR_PROFILE_SELECT_LEGACY =
    "id, username, display_name, profile_image_url, bio, account_type";

function isMissingSupportLinksColumn(error) {
    const msg = String(error?.message || error || "");
    return /support_links/i.test(msg) && /column|does not exist|schema cache/i.test(msg);
}

export async function fetchAuthorByUsername(supabase, username) {
    const handle = String(username ?? "").trim();
    if (!handle) return null;
    let { data, error } = await supabase
        .from("users")
        .select(AUTHOR_PROFILE_SELECT)
        .ilike("username", handle)
        .maybeSingle();
    if (error && isMissingSupportLinksColumn(error)) {
        ({ data, error } = await supabase
            .from("users")
            .select(AUTHOR_PROFILE_SELECT_LEGACY)
            .ilike("username", handle)
            .maybeSingle());
    }
    if (error) throw error;
    return normalizeAuthorProfile(data);
}

export async function fetchAuthorById(supabase, userId) {
    const id = String(userId ?? "").trim();
    if (!id) return null;
    let { data, error } = await supabase
        .from("users")
        .select(AUTHOR_PROFILE_SELECT)
        .eq("id", id)
        .maybeSingle();
    if (error && isMissingSupportLinksColumn(error)) {
        ({ data, error } = await supabase
            .from("users")
            .select(AUTHOR_PROFILE_SELECT_LEGACY)
            .eq("id", id)
            .maybeSingle());
    }
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

/** Once PostgREST 404s library_catalog, skip further catalog calls this session. */
let libraryCatalogMissing = false;

export function isLibraryCatalogMissingError(error) {
    const msg = String(error?.message || error || "");
    return /library_catalog|relation.*does not exist|schema cache/i.test(msg);
}

/**
 * Query public.library_catalog, remembering a missing-view 404 so the console
 * is not spammed on every book/author request before the SQL migration is applied.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(table: any) => any} run chain starting from .from("library_catalog")
 */
export async function queryLibraryCatalog(supabase, run) {
    if (libraryCatalogMissing) {
        return {
            data: null,
            error: { message: "relation \"public.library_catalog\" does not exist" },
        };
    }
    const result = await run(supabase.from("library_catalog"));
    if (result?.error && isLibraryCatalogMissingError(result.error)) {
        libraryCatalogMissing = true;
    }
    return result;
}

export async function fetchPublishedWorksForAuthor(supabase, userId, { excludeBookId } = {}) {
    const id = String(userId ?? "").trim();
    if (!id) return [];
    const { data, error } = await queryLibraryCatalog(supabase, (table) =>
        table.select("*").eq("user_id", id)
    );
    if (error && isLibraryCatalogMissingError(error)) {
        const fallback = await supabase.from("library").select("*").eq("user_id", id);
        if (fallback.error) throw fallback.error;
        return mapAuthorWorks(fallback.data, excludeBookId);
    }
    if (error) throw error;
    return mapAuthorWorks(data, excludeBookId);
}

function mapAuthorWorks(rows, excludeBookId) {
    const exclude = String(excludeBookId ?? "").trim();
    return (rows || [])
        .map((row) => normalizePublishedBookPreview(row))
        .filter(Boolean)
        .filter((book) => !exclude || book.id !== exclude)
        .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export function authorInitial(label) {
    return String(label || "A").trim()[0]?.toUpperCase() || "A";
}
