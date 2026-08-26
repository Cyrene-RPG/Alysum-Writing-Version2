/**
 * Cloud manuscript drafts on public.books. Owner-only via RLS.
 * Live Alysum uses `created` / `updated` (epoch ms), matching writer-dashboard.
 * Newer migrations may use created_at / updated_at — read both, write live columns.
 */
import { ensureChapterIds } from "../writing-engine/manuscript.js";

function newCloudBookId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function blankSections() {
    return { front: [], body: [], back: [] };
}

function readSections(raw) {
    let sections = raw;
    if (typeof sections === "string") {
        try {
            sections = JSON.parse(sections);
        } catch {
            sections = null;
        }
    }
    if (sections && typeof sections === "object" && !Array.isArray(sections)) {
        return ensureChapterIds(sections);
    }
    return blankSections();
}

function rowTime(row, keys) {
    if (!row || typeof row !== "object") return Date.now();
    for (const key of keys) {
        const value = row[key];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
        if (typeof value === "string" && value.trim()) {
            const ms = new Date(value).getTime();
            if (Number.isFinite(ms) && ms > 0) return ms;
        }
    }
    return Date.now();
}

export function fromCloudRow(row) {
    if (!row || typeof row !== "object") return null;
    const meta = row.publish_meta && typeof row.publish_meta === "object" && !Array.isArray(row.publish_meta)
        ? row.publish_meta
        : {};
    const published = Array.isArray(row.published_chapter_ids) ? row.published_chapter_ids : [];
    return {
        id: String(row.id || ""),
        user_id: String(row.user_id || row.userId || ""),
        title: String(row.title || "Untitled Book").trim() || "Untitled Book",
        words: Number(row.words) || 0,
        sections: readSections(row.sections),
        media_format: String(row.media_format || row.mediaFormat || "novel"),
        publish_meta: meta,
        published_chapter_ids: published,
        created: rowTime(row, ["created", "created_at", "createdAt"]),
        updated: rowTime(row, ["updated", "updated_at", "updatedAt"]),
    };
}

function toCloudInsert(payload, userId) {
    const seed = payload && typeof payload === "object" ? payload : {};
    const sections = readSections(seed.sections);
    const now = Date.now();
    return {
        id: seed.id || newCloudBookId(),
        user_id: userId,
        title: String(seed.title || "Untitled Book").trim() || "Untitled Book",
        sections,
        words: Number(seed.words) || 0,
        media_format: String(seed.media_format || seed.mediaFormat || "novel"),
        created: Number(seed.created) || now,
        updated: Number(seed.updated) || now,
    };
}

function toCloudPatch(patch) {
    const src = patch && typeof patch === "object" ? patch : {};
    const out = { updated: Date.now() };
    if (src.title != null) out.title = String(src.title).trim() || "Untitled Book";
    if (src.sections != null) out.sections = readSections(src.sections);
    if (src.words != null) out.words = Number(src.words) || 0;
    if (src.media_format != null || src.mediaFormat != null) {
        out.media_format = String(src.media_format || src.mediaFormat || "novel");
    }
    if (src.publish_meta != null || src.publishMeta != null) {
        const meta = src.publish_meta || src.publishMeta;
        out.publish_meta = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
    }
    if (src.published_chapter_ids != null || src.publishedChapterIds != null) {
        const ids = src.published_chapter_ids || src.publishedChapterIds;
        out.published_chapter_ids = Array.isArray(ids) ? ids : [];
    }
    return out;
}

async function selectVisibleBooks(supabase) {
    const base = () => supabase.from("books").select("*");
    let result = await base().order("updated", { ascending: false });
    if (result.error) {
        result = await base().order("updated_at", { ascending: false });
    }
    if (result.error) {
        result = await base();
    }
    return result;
}

export async function listBooks(supabase, _userId) {
    const { data, error } = await selectVisibleBooks(supabase);
    if (error) throw error;
    return (data || []).map(fromCloudRow).filter((book) => book && book.id);
}

export async function getBook(supabase, userId, id) {
    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    return fromCloudRow(data);
}

export async function insertBook(supabase, userId, payload) {
    const row = toCloudInsert(payload, userId);
    const { data, error } = await supabase.from("books").insert(row).select("*").single();
    if (error) throw error;
    return fromCloudRow(data);
}

export async function updateBook(supabase, userId, id, patch) {
    const { data, error } = await supabase
        .from("books")
        .update(toCloudPatch(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw error;
    return fromCloudRow(data);
}

export async function deleteBook(supabase, userId, id) {
    const { error } = await supabase.from("books").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
}
