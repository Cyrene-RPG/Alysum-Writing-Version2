/**
 * Session-aware book CRUD. Local guest uses local-adapter; signed-in users
 * use public.books and keep a device cache so a failed save does not wipe the page.
 */
import {
    deleteBook as deleteLocalBook,
    getBook as getLocalBook,
    insertBook as insertLocalBook,
    listBooks as listLocalBooks,
    promoteBookDraft,
    updateBook as updateLocalBook,
} from "./local-adapter.js";
import * as cloud from "./cloud-adapter.js?v=6";
import { removeLocalListing } from "../publishing/post-work.js";
import {
    createEmptyBook,
    ensureChapterIds,
    mergeSectionsByChapterId,
    withUpdatedWords,
} from "../writing-engine/manuscript.js?v=4";
import { cacheIsPending, chooseBook, isLocalOnlyId } from "./conflict-resolver.js";
import { isProbablyOnline, withTimeout } from "./network.js";

const CACHE_PREFIX = "alysum:editor:draft-cache-";
const CLOUD_READ_MS = 3000;

function cacheKey(userId) {
    return CACHE_PREFIX + String(userId || "");
}

function readCache(userId) {
    try {
        const raw = localStorage.getItem(cacheKey(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeCache(userId, books) {
    try {
        localStorage.setItem(cacheKey(userId), JSON.stringify(Array.isArray(books) ? books : []));
    } catch {
        /* ignore quota */
    }
}

function stripRuntime(book) {
    if (!book || typeof book !== "object") return book;
    const next = { ...book };
    delete next._rev;
    delete next._synced;
    return next;
}

function withoutPending(book) {
    if (!book || typeof book !== "object") return book;
    const next = stripRuntime(book);
    delete next._pending;
    return next;
}

function withPending(book, pending) {
    const next = withoutPending(book);
    if (pending) next._pending = true;
    return next;
}

function upsertCache(userId, book) {
    if (!book?.id) return;
    const stored = stripRuntime(book);
    const books = readCache(userId).filter((row) => row.id !== stored.id);
    books.unshift(stored);
    writeCache(userId, books);
}

function removeCache(userId, id) {
    writeCache(userId, readCache(userId).filter((row) => row.id !== id));
}

function sortByUpdated(books) {
    return [...books].sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
}

function pickBookTitle(cloudTitle, cacheTitle, cacheNewer) {
    const cloud = String(cloudTitle || "").trim() || "Untitled Book";
    const cache = String(cacheTitle || "").trim();
    if (cache && cache !== "Untitled Book" && (cloud === "Untitled Book" || cacheNewer)) return cache;
    return cloud;
}

function mergeLoadedBook(cached, cloudBook) {
    if (!cached) return { book: cloudBook };
    if (!cloudBook) return { book: cached };
    const cacheNewer = Number(cached.updated || 0) > Number(cloudBook.updated || 0);
    const base = cacheNewer ? cached : cloudBook;
    const other = cacheNewer ? cloudBook : cached;
    const book = withUpdatedWords({
        ...cloudBook,
        title: pickBookTitle(cloudBook.title, cached.title, cacheNewer),
        sections: mergeSectionsByChapterId(base.sections, other.sections, {
            baseUpdated: Number(base.updated) || 0,
            otherUpdated: Number(other.updated) || 0,
        }),
        updated: Math.max(Number(cloudBook.updated) || 0, Number(cached.updated) || 0),
    });
    return { book };
}

function stashPatch(previous, id, userId, patch) {
    return {
        ...(previous || { id, user_id: userId }),
        ...patch,
        id,
        user_id: userId,
        updated: patch.updated != null && Number.isFinite(Number(patch.updated))
            ? Number(patch.updated)
            : Date.now(),
    };
}

function asBook(payload) {
    const seed = payload && typeof payload === "object" ? payload : {};
    const base = createEmptyBook(seed.title);
    return withUpdatedWords({
        ...base,
        ...seed,
        sections: ensureChapterIds(seed.sections || base.sections),
        title: String(seed.title || base.title).trim() || "Untitled Book",
        media_format: seed.media_format || seed.mediaFormat || "novel",
    });
}

function normalizeBook(book) {
    if (!book || typeof book !== "object") return null;
    return {
        ...book,
        title: String(book.title || "Untitled Book").trim() || "Untitled Book",
        sections: ensureChapterIds(book.sections),
        media_format: book.media_format || book.mediaFormat || "novel",
        words: Number(book.words) || 0,
        is_published: Boolean(book.is_published),
    };
}

function cloudWritePayload(book) {
    const src = withoutPending(book) || {};
    return {
        title: src.title,
        sections: src.sections,
        words: src.words,
        media_format: src.media_format,
        publish_meta: src.publish_meta || {},
        published_chapter_ids: src.published_chapter_ids || [],
        is_published: Boolean(src.is_published),
        ...(src.draft_parent_id ? { draft_parent_id: src.draft_parent_id, draft_label: src.draft_label } : {}),
    };
}

function applyChoice(cached, cloudBook) {
    const choice = chooseBook(cached || null, cloudBook || null);
    if (!choice.book) return { book: null, pending: false, action: choice.action };
    if (choice.action === "keep-cloud") {
        return { book: withoutPending(choice.book), pending: false, action: choice.action };
    }
    const pending = choice.action === "upload" || choice.action === "insert" || cacheIsPending(cached);
    return { book: withPending(choice.book, pending), pending, action: choice.action };
}

function draftSummaries(books, rootId) {
    return books.filter(book => String(book.id) === String(rootId) || String(book.draft_parent_id || '') === String(rootId))
        .map(book => ({ id: book.id, title: book.title, draft_parent_id: book.draft_parent_id || null, draft_label: book.draft_label || null, created: book.created }));
}

function newOfflineBookId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `local-book-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function localApi() {
    return {
        mode: "local",
        async promoteDraft(id) { return promoteBookDraft(id); },
        peekDrafts(rootId) { return draftSummaries(listLocalBooks(), rootId); },
        async listDrafts(rootId) { return draftSummaries(listLocalBooks(), rootId); },
        readFromCache() {
            return false;
        },
        async listBooks() {
            return listLocalBooks().map(normalizeBook).filter(Boolean);
        },
        async getBook(id) {
            return normalizeBook(getLocalBook(id));
        },
        async insertBook(payload) {
            return normalizeBook(insertLocalBook(asBook(payload)));
        },
        async updateBook(id, patch) {
            return { ...normalizeBook(updateLocalBook(id, patch)), _synced: true };
        },
        stashBook(id, patch) {
            return normalizeBook(updateLocalBook(id, { ...patch, updated: Date.now() }));
        },
        async deleteBook(id) {
            deleteLocalBook(id);
        },
        peekBooks() {
            return listLocalBooks().map(normalizeBook).filter(Boolean);
        },
        peekBook(id) {
            return normalizeBook(getLocalBook(id));
        },
        hasPending() {
            return false;
        },
        async syncPending() {
            return { synced: 0, failed: 0 };
        },
    };
}

/**
 * @param {{ mode: "cloud" | "local" | "none", user: { id: string } | null }} session
 * @param {import("@supabase/supabase-js").SupabaseClient} [supabase]
 */
export function createBooksApi(session, supabase) {
    const mode = session?.mode === "cloud" ? "cloud" : "local";
    const userId = session?.user?.id || "";

    if (mode !== "cloud" || !supabase || !userId) {
        return localApi();
    }

    let lastReadFromCache = false;
    let syncLock = null;

    function requireOnline() {
        if (!isProbablyOnline()) throw new Error("offline");
    }

    async function cloudList() {
        requireOnline();
        return withTimeout(cloud.listBooks(supabase, userId), CLOUD_READ_MS, "cloud-list-timeout");
    }

    async function cloudGet(id) {
        requireOnline();
        return withTimeout(cloud.getBook(supabase, userId, id), CLOUD_READ_MS, "cloud-get-timeout");
    }

    async function flushOne(row) {
        let cloudBook = null;
        if (!isLocalOnlyId(row.id)) {
            try {
                cloudBook = await cloudGet(row.id);
            } catch {
                cloudBook = null;
            }
        }
        const picked = chooseBook(row, cloudBook);
        if (picked.action === "keep-cloud") {
            if (picked.book) upsertCache(userId, withoutPending(picked.book));
            else removeCache(userId, row.id);
            return true;
        }
        if (picked.action === "keep-local") return true;
        requireOnline();
        if (picked.action === "insert") {
            const payload = withoutPending(picked.book);
            const created = await cloud.insertBook(supabase, userId, {
                ...payload,
                id: isLocalOnlyId(payload.id) ? undefined : payload.id,
            });
            if (created.id !== payload.id) removeCache(userId, payload.id);
            upsertCache(userId, withoutPending(created));
            return true;
        }
        if (picked.action === "upload") {
            const pushed = await cloud.updateBook(supabase, userId, row.id, cloudWritePayload(picked.book));
            const keep = mergeLoadedBook(picked.book, pushed).book;
            upsertCache(userId, withoutPending(keep));
            return true;
        }
        return false;
    }

    return {
        mode: "cloud",
        async promoteDraft(id) {
            requireOnline();
            const cached=readCache(userId);
            const source=cached.find(book=>String(book.id)===String(id)) || await cloudGet(id);
            if(source&&readCache(userId).some(book=>(String(book.id)===String(id)||String(book.id)===String(source.draft_parent_id))&&cacheIsPending(book)))throw new Error('Save pending edits to this revision and the main draft before promoting.');
            const result=await cloud.promoteDraft(supabase,userId,id);
            upsertCache(userId,withoutPending(result.backup));
            const pendingMain=readCache(userId).find(book=>String(book.id)===String(result.main.id));
            if(cacheIsPending(pendingMain))throw new Error('The main draft has newer local edits. Your revision and previous-main backup are saved; review the main draft before retrying.');
            upsertCache(userId,withoutPending(result.main));
            return result;
        },
        peekDrafts(rootId) { return draftSummaries(readCache(userId), rootId); },
        async listDrafts(rootId) {
            const cached = () => draftSummaries(readCache(userId), rootId);
            if (!isProbablyOnline()) return cached();
            try {
                const rows = await withTimeout(cloud.listDraftSummaries(supabase, userId, String(rootId)), CLOUD_READ_MS, 'draft-list-timeout');
                const pending = readCache(userId).filter(row => cacheIsPending(row) || isLocalOnlyId(row.id));
                const merged = new Map(rows.map(row => [String(row.id), row]));
                for (const row of draftSummaries(pending, rootId)) merged.set(String(row.id), row);
                // Never replace manuscript cache rows with these metadata-only records.
                return [...merged.values()];
            } catch { return cached(); }
        },
        readFromCache() {
            return lastReadFromCache;
        },
        hasPending() {
            return readCache(userId).some((row) => cacheIsPending(row) || isLocalOnlyId(row.id));
        },
        peekBooks() {
            return sortByUpdated(readCache(userId)).map(normalizeBook).filter(Boolean);
        },
        peekBook(id) {
            const cached = readCache(userId).find((row) => row.id === id) || null;
            return cached ? normalizeBook(cached) : null;
        },
        async listBooks() {
            const cached = readCache(userId);
            if (!isProbablyOnline()) {
                lastReadFromCache = true;
                return sortByUpdated(cached).map(normalizeBook).filter(Boolean);
            }
            try {
                const books = await cloudList();
                lastReadFromCache = false;
                const byId = new Map(cached.map((row) => [row.id, row]));
                const merged = books.map((book) => {
                    const prior = byId.get(book.id);
                    if (!prior) return withoutPending(book);
                    return applyChoice(prior, book).book || withoutPending(book);
                });
                const serverIds = new Set(books.map((book) => book.id));
                const extras = cached.filter((row) => !serverIds.has(row.id) && (cacheIsPending(row) || isLocalOnlyId(row.id)));
                const combined = sortByUpdated([...merged.filter(Boolean), ...extras]);
                writeCache(userId, combined.map(stripRuntime));
                return combined.map(normalizeBook).filter(Boolean);
            } catch {
                lastReadFromCache = true;
                return sortByUpdated(readCache(userId)).map(normalizeBook).filter(Boolean);
            }
        },
        async getBook(id) {
            const cached = readCache(userId).find((row) => row.id === id) || null;
            if (!isProbablyOnline()) {
                lastReadFromCache = true;
                return cached ? normalizeBook(cached) : null;
            }
            try {
                const book = await cloudGet(id);
                lastReadFromCache = false;
                // Authoritative empty read (the query succeeded, RLS returned no
                // row) means this book is no longer visible to the writer —
                // revoked editor/collab access, or deleted. RLS is the source of
                // truth; drop the stale device copy so it can't be reopened.
                // Unsynced local-only work is the one thing we keep.
                if (!book && cached && !cacheIsPending(cached) && !isLocalOnlyId(cached.id)) {
                    removeCache(userId, id);
                    return null;
                }
                const picked = applyChoice(cached, book);
                if (!picked.book) {
                    if (cached && !cacheIsPending(cached)) removeCache(userId, id);
                    return cached && cacheIsPending(cached) ? normalizeBook(cached) : null;
                }
                upsertCache(userId, picked.book);
                return normalizeBook(picked.book);
            } catch {
                lastReadFromCache = true;
                return cached ? normalizeBook(cached) : null;
            }
        },
        async insertBook(payload, { strict = false } = {}) {
            const seed = asBook(payload);
            try {
                requireOnline();
                const book = await cloud.insertBook(supabase, userId, seed);
                lastReadFromCache = false;
                upsertCache(userId, withoutPending(book));
                return { ...book, _synced: true };
            } catch (error) {
                if (strict) throw error;
                lastReadFromCache = true;
                const fallback = withPending({
                    ...seed,
                    id: seed.id || newOfflineBookId(),
                    user_id: userId,
                    created: Date.now(),
                    updated: Date.now(),
                }, true);
                upsertCache(userId, fallback);
                return { ...fallback, _synced: false };
            }
        },
        async updateBook(id, patch) {
            const previous = readCache(userId).find((row) => row.id === id);
            const optimistic = withPending(stashPatch(previous, id, userId, { ...patch, updated: Date.now() }), true);
            upsertCache(userId, optimistic);
            try {
                requireOnline();
                const book = await cloud.updateBook(supabase, userId, id, patch);
                const keep = withoutPending(mergeLoadedBook(optimistic, book).book);
                upsertCache(userId, keep);
                return { ...normalizeBook(keep), _synced: true };
            } catch {
                return { ...normalizeBook(optimistic), _synced: false, _pending: true };
            }
        },
        stashBook(id, patch) {
            const previous = readCache(userId).find((row) => row.id === id);
            const optimistic = withPending(stashPatch(previous, id, userId, { ...patch, updated: Date.now() }), true);
            upsertCache(userId, optimistic);
            return normalizeBook(optimistic);
        },
        async deleteBook(id) {
            requireOnline();
            await cloud.deleteBook(supabase, userId, id);
            removeCache(userId, id);
            removeLocalListing(id);
        },
        async syncPending() {
            if (!isProbablyOnline()) return { synced: 0, failed: 0 };
            const rows = readCache(userId).filter((row) => cacheIsPending(row) || isLocalOnlyId(row.id));
            if (!rows.length) return { synced: 0, failed: 0 };
            if (syncLock) return syncLock;
            syncLock = (async () => {
                let synced = 0;
                let failed = 0;
                const rows = readCache(userId).filter((row) => cacheIsPending(row) || isLocalOnlyId(row.id));
                for (const row of rows) {
                    try {
                        await flushOne(row);
                        synced += 1;
                    } catch {
                        failed += 1;
                    }
                }
                return { synced, failed };
            })();
            try {
                return await syncLock;
            } finally {
                syncLock = null;
            }
        },
    };
}
