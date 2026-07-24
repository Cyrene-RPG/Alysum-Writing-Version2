/**
 * Book version history — cloud (Supabase RPC) + local studio storage.
 * Versions are kept forever; nothing is auto-deleted or pruned.
 */

export const LOCAL_VERSIONS_KEY = "alysum-local-book-versions-v1";
const AUTO_META_KEY = "alysum-book-version-auto-meta-v1";
export const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const AUTO_MIN_WORD_DELTA = 100;

const SECTION_KEYS = ["front", "body", "back"];

/** @typedef {'manual'|'auto'|'checkpoint'|'structural'} VersionSource */

/**
 * @param {object} book
 */
export function buildManuscriptSnapshot(book) {
    const sections = book?.sections || {};
    return {
        title: String(book?.title || "Untitled Book").trim() || "Untitled Book",
        media_format: String(book?.mediaFormat || book?.media_format || "novel").trim() || "novel",
        sections: {
            front: Array.isArray(sections.front) ? sections.front : [],
            body: Array.isArray(sections.body) ? sections.body : [],
            back: Array.isArray(sections.back) ? sections.back : [],
        },
        words: Number(book?.words) || 0,
    };
}

/**
 * @param {object} snapshot
 */
export async function hashSnapshot(snapshot) {
    const text = JSON.stringify(snapshot.sections || {});
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function readLocalVersionStore() {
    try {
        const raw = localStorage.getItem(LOCAL_VERSIONS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeLocalVersionStore(store) {
    localStorage.setItem(LOCAL_VERSIONS_KEY, JSON.stringify(store));
}

export function exportLocalVersionStore() {
    return readLocalVersionStore();
}

export function importLocalVersionStore(store) {
    if (!store || typeof store !== "object") return;
    writeLocalVersionStore(store);
}

function readAutoMeta(bookId) {
    try {
        const raw = localStorage.getItem(AUTO_META_KEY);
        const all = raw ? JSON.parse(raw) : {};
        return all?.[bookId] || {};
    } catch {
        return {};
    }
}

function writeAutoMeta(bookId, patch) {
    try {
        const raw = localStorage.getItem(AUTO_META_KEY);
        const all = raw && typeof JSON.parse(raw) === "object" ? JSON.parse(raw) : {};
        all[bookId] = { ...(all[bookId] || {}), ...patch };
        localStorage.setItem(AUTO_META_KEY, JSON.stringify(all));
    } catch {
        /* ignore */
    }
}

function newLocalVersionId() {
    return `ver_local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeListRow(row) {
    return {
        id: row.id,
        book_id: row.book_id,
        created_at: row.created_at,
        label: row.label || "",
        source: row.source || "manual",
        word_count: Number(row.word_count) || 0,
        media_format: row.media_format || "novel",
        title: row.title || "Untitled",
        content_hash: row.content_hash || "",
    };
}

function normalizeFullRow(row) {
    return {
        ...normalizeListRow(row),
        sections: row.sections || { front: [], body: [], back: [] },
    };
}

/**
 * @param {object} opts
 */
export async function createBookVersion({ supabase, isLocalStudio, userId, bookId, book, label = "", source = "manual" }) {
    const snapshot = buildManuscriptSnapshot(book);
    if (!snapshot.words) snapshot.words = countWordsInSnapshot(snapshot);
    const content_hash = await hashSnapshot(snapshot);
    const cleanLabel = String(label || "").trim();
    const cleanSource = ["manual", "auto", "checkpoint", "structural"].includes(source) ? source : "manual";

    if (isLocalStudio) {
        const store = readLocalVersionStore();
        if (!store[bookId]) store[bookId] = [];
        const row = {
            id: newLocalVersionId(),
            book_id: bookId,
            user_id: userId,
            created_at: new Date().toISOString(),
            label: cleanLabel,
            source: cleanSource,
            word_count: snapshot.words,
            media_format: snapshot.media_format,
            title: snapshot.title,
            sections: snapshot.sections,
            content_hash,
        };
        store[bookId].unshift(row);
        writeLocalVersionStore(store);
        return normalizeFullRow(row);
    }

    const { data, error } = await supabase.rpc("create_book_version", {
        p_book_id: bookId,
        p_label: cleanLabel,
        p_source: cleanSource,
    });
    if (error) throw error;
    return normalizeFullRow(data);
}

/**
 * Throttled auto snapshot — at most once per 6 hours when word count shifted by ≥100.
 * @param {object} opts
 */
export async function maybeCreateAutoVersion({ supabase, isLocalStudio, userId, bookId, book, stripHtmlToText }) {
    const snapshot = buildManuscriptSnapshot(book);
    const words = countWordsInSnapshot(snapshot, stripHtmlToText);
    const meta = readAutoMeta(bookId);
    const now = Date.now();
    const lastAt = meta.lastAutoAt ? new Date(meta.lastAutoAt).getTime() : 0;

    if (lastAt && now - lastAt < AUTO_INTERVAL_MS) return null;

    const wordDelta = Math.abs(words - Number(meta.lastAutoWords || 0));
    if (lastAt && wordDelta < AUTO_MIN_WORD_DELTA) return null;

    const hash = await hashSnapshot(snapshot);
    if (meta.lastAutoHash && meta.lastAutoHash === hash) return null;

    const label = `Auto save · ${formatVersionWhen(new Date().toISOString())}`;
    const row = await createBookVersion({
        supabase,
        isLocalStudio,
        userId,
        bookId,
        book: { ...book, words },
        label,
        source: "auto",
    });

    writeAutoMeta(bookId, {
        lastAutoAt: new Date().toISOString(),
        lastAutoWords: words,
        lastAutoHash: hash,
    });

    return row;
}

/**
 * @param {object} opts
 */
export async function listBookVersions({ supabase, isLocalStudio, bookId, limit = 100, offset = 0 }) {
    if (isLocalStudio) {
        return (readLocalVersionStore()[bookId] || []).slice(offset, offset + limit).map(normalizeListRow);
    }

    const { data, error } = await supabase.rpc("list_book_versions", {
        p_book_id: bookId,
        p_limit: limit,
        p_offset: offset,
    });
    if (error) throw error;
    return (data || []).map(normalizeListRow);
}

/**
 * @param {object} opts
 */
export async function getBookVersion({ supabase, isLocalStudio, bookId, versionId }) {
    if (isLocalStudio) {
        const row = (readLocalVersionStore()[bookId] || []).find(v => v.id === versionId);
        if (!row) throw new Error("version_not_found");
        return normalizeFullRow(row);
    }

    const { data, error } = await supabase.rpc("get_book_version", { p_version_id: versionId });
    if (error) throw error;
    return normalizeFullRow(data);
}

/**
 * @param {object} opts
 */
export async function restoreBookVersion({
    supabase,
    isLocalStudio,
    userId,
    bookId,
    book,
    versionId,
    mode = "full",
    chapterId = "",
    updateBook,
}) {
    if (isLocalStudio) {
        const version = (readLocalVersionStore()[bookId] || []).find(v => v.id === versionId);
        if (!version) throw new Error("version_not_found");

        await createBookVersion({
            isLocalStudio: true,
            userId,
            bookId,
            book,
            label: "Before restore",
            source: "checkpoint",
        });

        const versionAfter = (readLocalVersionStore()[bookId] || []).find(v => v.id === versionId);
        if (!versionAfter) throw new Error("version_not_found");

        let nextSections = book.sections;
        let nextTitle = book.title;
        let nextWords = book.words;

        if (mode === "chapter") {
            nextSections = replaceChapterInSections(book.sections, versionAfter.sections, String(chapterId || "").trim());
            nextWords = countWordsInSnapshot({ sections: nextSections });
        } else {
            if (normalizeMedia(versionAfter.media_format) !== normalizeMedia(book.mediaFormat || book.media_format)) {
                throw new Error("media_format_mismatch");
            }
            nextSections = versionAfter.sections;
            nextTitle = versionAfter.title;
            nextWords = versionAfter.word_count;
        }

        const patch = { title: nextTitle, sections: nextSections, words: nextWords, updated: Date.now() };
        updateBook(bookId, patch);
        return { ...book, ...patch, mediaFormat: book.mediaFormat || book.media_format };
    }

    const { data, error } = await supabase.rpc("restore_book_version", {
        p_version_id: versionId,
        p_mode: mode,
        p_chapter_id: chapterId || "",
    });
    if (error) throw error;
    return data;
}

function normalizeMedia(fmt) {
    const v = String(fmt || "novel").trim().toLowerCase();
    return ["manga", "comic", "manhwa"].includes(v) ? v : "novel";
}

function replaceChapterInSections(currentSections, versionSections, chapterId) {
    if (!chapterId) throw new Error("chapter_id_required");
    const cur = {
        front: [...(currentSections?.front || [])],
        body: [...(currentSections?.body || [])],
        back: [...(currentSections?.back || [])],
    };
    let srcChapter = null;
    for (const key of SECTION_KEYS) {
        const hit = (versionSections?.[key] || []).find(ch => ch?.id === chapterId);
        if (hit) {
            srcChapter = hit;
            break;
        }
    }
    if (!srcChapter) throw new Error("chapter_not_in_version");

    for (const key of SECTION_KEYS) {
        const ix = cur[key].findIndex(ch => ch?.id === chapterId);
        if (ix >= 0) {
            cur[key][ix] = { ...srcChapter };
            return cur;
        }
    }
    throw new Error("chapter_not_in_current");
}

/**
 * @param {object} snapshot
 * @param {(html: string) => string} [stripHtml]
 */
export function countWordsInSnapshot(snapshot, stripHtml = defaultStripHtml) {
    let total = 0;
    for (const key of SECTION_KEYS) {
        for (const ch of snapshot.sections?.[key] || []) {
            total += countWordsInHtml(ch?.content || "", stripHtml);
        }
    }
    return total;
}

function countWordsInHtml(html, stripHtml) {
    const text = stripHtml(String(html || ""));
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function defaultStripHtml(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|h1|h2|h3|li|blockquote|ul|ol)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function sourceLabel(source) {
    switch (source) {
        case "manual":
            return "Manual";
        case "checkpoint":
            return "Checkpoint";
        case "structural":
            return "Structure";
        case "auto":
            return "Auto";
        default:
            return "Version";
    }
}

export function formatVersionWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Unknown time";
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export function friendlyVersionError(err) {
    const msg = String(err?.message || err || "");
    if (/not_authenticated/i.test(msg)) return "Sign in to use version history.";
    if (/book_not_found/i.test(msg)) return "Book not found.";
    if (/version_not_found/i.test(msg)) return "That version no longer exists.";
    if (/chapter_not_in_version/i.test(msg)) return "This chapter did not exist in that version.";
    if (/chapter_not_in_current/i.test(msg)) return "That chapter is not in your current manuscript.";
    if (/media_format_mismatch/i.test(msg)) return "Cannot restore — media format does not match.";
    if (/create_book_version|book_versions/i.test(msg) && /does not exist|42883/i.test(msg)) {
        return "Version history is not set up yet. Run supabase-book-versions.sql in Supabase.";
    }
    return msg || "Something went wrong.";
}
