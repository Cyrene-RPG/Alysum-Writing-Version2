/**
 * Library catalog for landing pages: book previews with their published chapter
 * list (titles and word counts only — the catalog carries no chapter text) and
 * batch read counts.
 */
import {
    isLibraryCatalogMissingError,
    normalizePublishedBookPreview,
    queryLibraryCatalog,
} from "./author-profile.js";
import { chaptersFromListingData } from "./work.js";

function rowData(row) {
    const data = row?.data;
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function toCatalogEntry(row) {
    const book = normalizePublishedBookPreview(row);
    if (!book) return null;
    const chapters = chaptersFromListingData(rowData(row))
        .map(({ id, title, wordCount }) => ({ id, title, wordCount }));
    return { ...book, chapters };
}

export async function fetchLibraryCatalogWithChapters(supabase) {
    const { data, error } = await queryLibraryCatalog(supabase, (table) => table.select("*"));
    if (error && isLibraryCatalogMissingError(error)) {
        const fallback = await supabase.from("library").select("*");
        if (fallback.error) throw fallback.error;
        return (fallback.data || []).map(toCatalogEntry).filter(Boolean);
    }
    if (error) throw error;
    return (data || []).map(toCatalogEntry).filter(Boolean);
}

/** @returns {Promise<Map<string, number>>} book id → read count */
export async function fetchLibraryReadCounts(supabase, bookIds) {
    const ids = [...new Set((bookIds || []).map((id) => String(id ?? "").trim()).filter(Boolean))];
    const counts = new Map();
    if (!ids.length) return counts;
    const { data, error } = await supabase.rpc("get_library_read_counts", { p_book_ids: ids });
    if (error) throw error;
    for (const row of data || []) {
        const id = String(row.book_id ?? "").trim();
        if (id) counts.set(id, Number(row.read_count) || 0);
    }
    return counts;
}
