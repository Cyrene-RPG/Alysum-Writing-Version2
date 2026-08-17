/**
 * Cloud manuscript drafts on public.books. Owner-only via RLS.
 * Converts snake_case rows to the same camel-ish shape as local-adapter.
 */
import { createEmptyBook, ensureChapterIds } from "../writing-engine/manuscript.js";

function newCloudBookId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function emptySections() {
    return ensureChapterIds(createEmptyBook().sections);
}

export function fromCloudRow(row) {
    if (!row || typeof row !== "object") return null;
    const createdAt = row.created_at || row.createdAt;
    const updatedAt = row.updated_at || row.updatedAt;
    return {
        id: String(row.id || ""),
        user_id: String(row.user_id || row.userId || ""),
        title: String(row.title || "Untitled Book").trim() || "Untitled Book",
        words: Number(row.words) || 0,
        sections: row.sections && typeof row.sections === "object"
            ? ensureChapterIds(row.sections)
            : emptySections(),
        media_format: String(row.media_format || row.mediaFormat || "novel"),
        created: createdAt ? new Date(createdAt).getTime() : Date.now(),
        updated: updatedAt ? new Date(updatedAt).getTime() : Date.now(),
    };
}

function toCloudInsert(payload, userId) {
    const seed = payload && typeof payload === "object" ? payload : {};
    const sections = seed.sections && typeof seed.sections === "object"
        ? ensureChapterIds(seed.sections)
        : emptySections();
    return {
        id: seed.id || newCloudBookId(),
        user_id: userId,
        title: String(seed.title || "Untitled Book").trim() || "Untitled Book",
        sections,
        words: Number(seed.words) || 0,
        media_format: String(seed.media_format || seed.mediaFormat || "novel"),
    };
}

function toCloudPatch(patch) {
    const src = patch && typeof patch === "object" ? patch : {};
    const out = { updated_at: new Date().toISOString() };
    if (src.title != null) out.title = String(src.title).trim() || "Untitled Book";
    if (src.sections != null) out.sections = ensureChapterIds(src.sections);
    if (src.words != null) out.words = Number(src.words) || 0;
    if (src.media_format != null || src.mediaFormat != null) {
        out.media_format = String(src.media_format || src.mediaFormat || "novel");
    }
    return out;
}

export async function listBooks(supabase, userId) {
    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(fromCloudRow).filter((book) => book && book.id);
}

export async function getBook(supabase, userId, id) {
    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
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
        .eq("user_id", userId)
        .select("*")
        .single();
    if (error) throw error;
    return fromCloudRow(data);
}

export async function deleteBook(supabase, userId, id) {
    const { error } = await supabase.from("books").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
}
