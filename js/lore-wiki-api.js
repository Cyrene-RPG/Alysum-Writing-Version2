/**
 * Lore Wiki — public read catalog + author publish (private Story Wiki → public Lore Wiki).
 */
import { normalizeBibleCharacter, normalizeBiblePlace, isStoryBibleTableMissing } from "./story-bible-api.js?v=13";

export function isLoreWikiTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        msg.includes("lore_wiki")
    );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function listPublicLoreWikis(supabase) {
    const { data, error } = await supabase
        .from("lore_wiki")
        .select("id, user_id, book_id, data, updated_at")
        .order("updated_at", { ascending: false });
    if (error) {
        if (isLoreWikiTableMissing(error)) return [];
        throw error;
    }
    return (data || [])
        .map(row => normalizeLoreWikiRow(row))
        .filter(r => r.isPublished);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bookId
 */
export async function getPublicLoreWiki(supabase, bookId) {
    const { data, error } = await supabase
        .from("lore_wiki")
        .select("id, user_id, book_id, data, updated_at")
        .eq("book_id", bookId)
        .maybeSingle();
    if (error) {
        if (isLoreWikiTableMissing(error)) return null;
        throw error;
    }
    if (!data) return null;
    const row = normalizeLoreWikiRow(data);
    return row.isPublished ? row : null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bookId
 */
export async function listPublicLoreArticles(supabase, bookId) {
    const { data, error } = await supabase
        .from("lore_wiki_articles")
        .select("book_id, entry_id, kind, slug, body, updated")
        .eq("book_id", bookId)
        .order("updated", { ascending: false });
    if (error) {
        if (isLoreWikiTableMissing(error)) return [];
        throw error;
    }
    return (data || []).map(row => ({
        bookId: row.book_id,
        entryId: row.entry_id,
        kind: row.kind,
        slug: row.slug || "",
        body: row.body || {},
        updated: row.updated || 0
    }));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bookId
 * @param {string} entryId
 */
export async function getPublicLoreArticle(supabase, bookId, entryId) {
    const { data, error } = await supabase
        .from("lore_wiki_articles")
        .select("book_id, entry_id, kind, slug, body, updated")
        .eq("book_id", bookId)
        .eq("entry_id", entryId)
        .maybeSingle();
    if (error) {
        if (isLoreWikiTableMissing(error)) return null;
        throw error;
    }
    if (!data) return null;
    return {
        bookId: data.book_id,
        entryId: data.entry_id,
        kind: data.kind,
        slug: data.slug || "",
        body: data.body || {},
        updated: data.updated || 0
    };
}

function normalizeLoreWikiRow(row) {
    const data = row.data && typeof row.data === "object" ? row.data : {};
    return {
        id: row.id || row.book_id,
        bookId: row.book_id || row.id,
        userId: row.user_id,
        title: String(data.title || "Untitled").trim() || "Untitled",
        author: String(data.author || "Anonymous").trim() || "Anonymous",
        summary: String(data.summary || "").trim(),
        entryCount: Number(data.entryCount) || 0,
        characterCount: Number(data.characterCount) || 0,
        placeCount: Number(data.placeCount) || 0,
        objectCount: Number(data.objectCount) || 0,
        isPublished: data.isPublished !== false,
        isAnonymous: !!data.isAnonymous,
        publishedAt: Number(data.publishedAt) || 0,
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Number(data.updated) || 0
    };
}

function slugify(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
}

function isObjectBody(body) {
    return String(body?.kind || "").trim().toLowerCase() === "object";
}

function splitPlacesAndObjects(places) {
    const realPlaces = [];
    const objects = [];
    for (const p of places || []) {
        if (!String(p?.name || "").trim()) continue;
        if (isObjectBody(p)) objects.push(p);
        else realPlaces.push(p);
    }
    return { realPlaces, objects };
}

/**
 * Publish all current Story Wiki entries for a book to Lore Wiki (author-only).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {object} opts
 * @param {string} opts.bookTitle
 * @param {string} opts.authorName
 * @param {string} [opts.summary]
 * @param {boolean} [opts.isAnonymous]
 * @param {object[]} opts.characters
 * @param {object[]} opts.places
 */
export async function publishBookLoreWiki(supabase, uid, bookId, opts) {
    const now = Date.now();
    const characters = opts.characters || [];
    const allPlaces = opts.places || [];
    const { realPlaces, objects } = splitPlacesAndObjects(allPlaces);
    const author = opts.isAnonymous ? "Anonymous" : (opts.authorName || "Author");
    const parts = [];
    if (characters.length) parts.push(`${characters.length} character${characters.length === 1 ? "" : "s"}`);
    if (realPlaces.length) parts.push(`${realPlaces.length} place${realPlaces.length === 1 ? "" : "s"}`);
    if (objects.length) parts.push(`${objects.length} object${objects.length === 1 ? "" : "s"}`);
    const summary =
        opts.summary ||
        (parts.length
            ? `Explore ${parts.join(", ")} from ${opts.bookTitle || "this story"}.`
            : `Explore lore from ${opts.bookTitle || "this story"}.`);

    const articleRows = [];
    for (const c of characters) {
        if (!c?.id || !String(c.name || "").trim()) continue;
        const body = normalizeBibleCharacter(c, c.id);
        articleRows.push({
            book_id: bookId,
            entry_id: c.id,
            user_id: uid,
            kind: "character",
            slug: slugify(body.name),
            body,
            published_at: now,
            updated: now
        });
    }
    for (const p of allPlaces) {
        if (!p?.id || !String(p.name || "").trim()) continue;
        const body = normalizeBiblePlace(p, p.id);
        articleRows.push({
            book_id: bookId,
            entry_id: p.id,
            user_id: uid,
            kind: "place",
            slug: slugify(body.name),
            body,
            published_at: now,
            updated: now
        });
    }

    const catalogData = {
        bookId,
        title: opts.bookTitle || "Untitled",
        author,
        summary,
        isPublished: true,
        isAnonymous: !!opts.isAnonymous,
        entryCount: articleRows.length,
        characterCount: characters.filter(c => String(c?.name || "").trim()).length,
        placeCount: realPlaces.length,
        objectCount: objects.length,
        publishedAt: now,
        updated: now
    };

    const { error: delArticlesErr } = await supabase
        .from("lore_wiki_articles")
        .delete()
        .eq("book_id", bookId)
        .eq("user_id", uid);
    if (delArticlesErr && !isLoreWikiTableMissing(delArticlesErr)) throw delArticlesErr;

    if (articleRows.length) {
        const { error: insArticlesErr } = await supabase.from("lore_wiki_articles").insert(articleRows);
        if (insArticlesErr) throw insArticlesErr;
    }

    const loreRow = {
        id: bookId,
        user_id: uid,
        book_id: bookId,
        data: catalogData,
        updated_at: new Date().toISOString()
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

    return catalogData;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function unpublishBookLoreWiki(supabase, uid, bookId) {
    const { error: artErr } = await supabase
        .from("lore_wiki_articles")
        .delete()
        .eq("book_id", bookId)
        .eq("user_id", uid);
    if (artErr && !isLoreWikiTableMissing(artErr)) throw artErr;

    const { error: loreErr } = await supabase.from("lore_wiki").delete().eq("id", bookId).eq("user_id", uid);
    if (loreErr && !isLoreWikiTableMissing(loreErr)) throw loreErr;

    await supabase
        .from("books")
        .update({ lore_wiki_published: false, lore_wiki_meta: {} })
        .eq("id", bookId)
        .eq("user_id", uid);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function getBookLorePublishState(supabase, uid, bookId) {
    const { data, error } = await supabase
        .from("books")
        .select("lore_wiki_published, lore_wiki_meta")
        .eq("id", bookId)
        .eq("user_id", uid)
        .maybeSingle();
    if (error) {
        if (isStoryBibleTableMissing(error)) return { published: false, meta: {} };
        throw error;
    }
    return {
        published: !!data?.lore_wiki_published,
        meta: data?.lore_wiki_meta && typeof data.lore_wiki_meta === "object" ? data.lore_wiki_meta : {}
    };
}
