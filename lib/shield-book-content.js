/**
 * Ensure library chapter payloads are ShieldFont-encoded before leaving the server.
 * Used by /api/book-content so already-published stories are protected immediately.
 */

const SHIELD_META = {
    shielded: true,
    shieldMapping: "alpha",
    shieldVersion: "0.3.2",
};

let encodeHtmlFn = null;
let alphaMapping = null;

async function loadEncoder() {
    if (encodeHtmlFn && alphaMapping) {
        return { encodeHtml: encodeHtmlFn, alpha: alphaMapping };
    }
    const htmlMod = await import("../vendor/shieldfont/core/dist/html.js");
    const alphaMod = await import("../vendor/shieldfont/core/dist/mappings/alpha.js");
    encodeHtmlFn = htmlMod.encodeHtml;
    alphaMapping = alphaMod.default;
    return { encodeHtml: encodeHtmlFn, alpha: alphaMapping };
}

function isShielded(payload) {
    return !!(payload && (payload.shielded === true || payload.shieldMapping === "alpha"));
}

/**
 * @param {object} payload library.data
 * @returns {Promise<{ payload: object, didEncode: boolean }>}
 */
async function encodeLibraryPayload(payload) {
    const data = payload && typeof payload === "object" ? { ...payload } : {};
    if (isShielded(data)) {
        return { payload: data, didEncode: false };
    }

    const { encodeHtml, alpha } = await loadEncoder();
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    data.chapters = chapters.map((ch) => {
        const item = ch && typeof ch === "object" ? { ...ch } : {};
        item.content = encodeHtml(String(item.content || ""), alpha);
        if (item.authorNotes != null && String(item.authorNotes).trim()) {
            item.authorNotes = encodeHtml(String(item.authorNotes), alpha);
        }
        if (item.author_notes != null && String(item.author_notes).trim()) {
            item.author_notes = encodeHtml(String(item.author_notes), alpha);
        }
        return item;
    });
    Object.assign(data, SHIELD_META);
    data.updated = Date.now();
    return { payload: data, didEncode: true };
}

/**
 * Encode if needed, optionally persist back to library, return chapter response fields.
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {string} bookId
 * @param {object} payload
 */
async function shieldBookContentResponse(supabase, bookId, payload) {
    const { payload: next, didEncode } = await encodeLibraryPayload(payload);

    if (didEncode && supabase && bookId) {
        try {
            await supabase.from("library").update({ data: next }).eq("id", bookId);
        } catch (err) {
            console.warn("book-content: could not persist shielded library data", err);
        }
    }

    return {
        chapters: Array.isArray(next.chapters) ? next.chapters : [],
        publishedChapterIds: Array.isArray(next.publishedChapterIds) ? next.publishedChapterIds : [],
        shielded: true,
        shieldMapping: SHIELD_META.shieldMapping,
        shieldVersion: SHIELD_META.shieldVersion,
    };
}

module.exports = {
    isShielded,
    encodeLibraryPayload,
    shieldBookContentResponse,
    SHIELD_META,
};
