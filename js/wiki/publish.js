/**
 * Per-article Lore Wiki publishing from Story Wiki drafts.
 */
import { supabase } from "./api.js";
import { isLocalStudioUid } from "../studio-session.js?v=1";

function slugify(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
}

/** @param {object} entry */
function entryToLoreBody(entry) {
    return {
        schemaVersion: 2,
        name: entry.name,
        aliases: entry.aliases || [],
        pronouns: entry.pronouns || "",
        status: entry.status || "alive",
        appearance: { ...(entry.appearance || {}) },
        notes: entry.body || "",
        tags: entry.tags || [],
        sortKey: entry.sortKey || entry.name.toLowerCase(),
        kind: entry.kind === "object" ? "object" : undefined,
        updatedAt: Date.now(),
    };
}

function loreKind(entry) {
    return entry.kind === "character" ? "character" : "place";
}

/**
 * @param {string} uid
 * @param {string} bookId
 */
export async function listPublishedEntryIds(uid, bookId) {
    if (isLocalStudioUid(uid)) return new Set();

    const { data, error } = await supabase
        .from("lore_wiki_articles")
        .select("entry_id")
        .eq("book_id", bookId)
        .eq("user_id", uid);

    if (error) {
        if (String(error.code) === "PGRST205" || String(error.message || "").includes("lore_wiki")) {
            return new Set();
        }
        throw error;
    }

    return new Set((data || []).map((r) => r.entry_id));
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @param {object} entry
 * @param {{ bookTitle: string, authorName: string }} meta
 */
export async function publishEntryToLore(uid, bookId, entry, meta) {
    if (isLocalStudioUid(uid)) {
        throw new Error("Publishing to Lore Wiki requires a cloud account.");
    }
    if (!entry?.id || !String(entry.name || "").trim()) {
        throw new Error("Save the article before publishing.");
    }

    const now = Date.now();
    const body = entryToLoreBody(entry);

    const { error: artErr } = await supabase.from("lore_wiki_articles").upsert({
        book_id: bookId,
        entry_id: entry.id,
        user_id: uid,
        kind: loreKind(entry),
        slug: slugify(entry.name),
        body,
        published_at: now,
        updated: now,
    });

    if (artErr) throw artErr;

    await syncLoreCatalog(uid, bookId, meta.bookTitle, meta.authorName);
    return true;
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @param {string} entryId
 * @param {{ bookTitle: string, authorName: string }} meta
 */
export async function unpublishEntryFromLore(uid, bookId, entryId, meta) {
    if (isLocalStudioUid(uid)) return;

    const { error } = await supabase
        .from("lore_wiki_articles")
        .delete()
        .eq("book_id", bookId)
        .eq("entry_id", entryId)
        .eq("user_id", uid);

    if (error) throw error;

    await syncLoreCatalog(uid, bookId, meta.bookTitle, meta.authorName);
}

async function syncLoreCatalog(uid, bookId, bookTitle, authorName) {
    const { data: articles, error: listErr } = await supabase
        .from("lore_wiki_articles")
        .select("entry_id, kind")
        .eq("book_id", bookId)
        .eq("user_id", uid);

    if (listErr) throw listErr;

    const rows = articles || [];

    if (!rows.length) {
        await supabase.from("lore_wiki").delete().eq("id", bookId).eq("user_id", uid);
        await supabase
            .from("books")
            .update({ lore_wiki_published: false, lore_wiki_meta: {} })
            .eq("id", bookId)
            .eq("user_id", uid);
        return;
    }

    const characterCount = rows.filter((r) => r.kind === "character").length;
    const placeCount = rows.filter((r) => r.kind === "place").length;
    const now = Date.now();
    const title = bookTitle || "Untitled";
    const author = authorName || "Author";

    const catalogData = {
        bookId,
        title,
        author,
        summary: `Explore ${characterCount} characters and ${placeCount} places from ${title}.`,
        isPublished: true,
        isAnonymous: false,
        entryCount: rows.length,
        characterCount,
        placeCount,
        publishedAt: now,
        updated: now,
    };

    const loreRow = {
        id: bookId,
        user_id: uid,
        book_id: bookId,
        data: catalogData,
        updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from("lore_wiki").select("id").eq("id", bookId).maybeSingle();
    if (existing) {
        const { error } = await supabase.from("lore_wiki").update(loreRow).eq("id", bookId);
        if (error) throw error;
    } else {
        const { error } = await supabase.from("lore_wiki").insert(loreRow);
        if (error) throw error;
    }

    await supabase
        .from("books")
        .update({ lore_wiki_published: true, lore_wiki_meta: catalogData })
        .eq("id", bookId)
        .eq("user_id", uid);
}

/**
 * @param {string} uid
 */
export async function getAuthorDisplayName(uid) {
    if (isLocalStudioUid(uid)) return "Guest";

    const { data } = await supabase
        .from("users")
        .select("username, display_name")
        .eq("id", uid)
        .maybeSingle();

    const display = String(data?.display_name || "").trim();
    const handle = String(data?.username || "").trim();
    return display || handle || "Author";
}
