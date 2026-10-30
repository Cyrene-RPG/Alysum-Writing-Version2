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

import { keepPendingCopy, pendingCopies, confirmPendingCopy } from "./pending-copies.js";

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
        return true;
    } catch {
        return false;
    }
}

function stripRuntime(book) {
    if (!book || typeof book !== "object") return book;
    const next = { ...book };
    delete next._rev;
    delete next._synced;
    delete next._cached;
    delete next._syncError;
    delete next._syncCode;
    return next;
}

function withoutPending(book) {
    if (!book || typeof book !== "object") return book;
    const next = stripRuntime(book);
    delete next._pending;
    delete next._baseUpdated;
    delete next._localRevision;
    delete next._writerSession;
    delete next._createdLocally;
    delete next._creationSnapshot;
    return next;
}

function withPending(book, pending) {
    const next = pending ? stripRuntime(book) : withoutPending(book);
    if (pending) next._pending = true;
    return next;
}

function upsertCache(userId, book) {
    if (!book?.id) return;
    const stored = stripRuntime(book);
    // Journal first, under a tab-specific key. Preserve legacy pending copies too.
    let journaled = false;
    try {
        for (const prior of readCache(userId)) {
            if (stored._pending && prior.id === stored.id && prior._pending && prior._writerSession !== stored._writerSession) {
                if (!keepPendingCopy(localStorage, userId, prior)) return false;
            }
        }
        journaled = keepPendingCopy(localStorage, userId, stored);
    } catch { /* The cache write below may still succeed. */ }
    const books = readCache(userId).filter((row) => row.id !== stored.id);
    books.unshift(stored);
    return writeCache(userId, books) || journaled;
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
        user_id: previous?.user_id || userId,
        _baseUpdated: previous?._pending ? previous._baseUpdated ?? previous._cloudUpdated ?? null : previous?._cloudUpdated ?? previous?.updated ?? null,
        _localRevision: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
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
export function createBooksApi(session, supabase, { writeTimeoutMs = 15000 } = {}) {
    const mode = session?.mode === "cloud" ? "cloud" : "local";
    const userId = session?.user?.id || "";

    if (mode !== "cloud" || !supabase || !userId) {
        return localApi();
    }

    let lastReadFromCache = false;
    let syncLock = null;
    const writerSession = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const writeLocks = new Map(), ownAcknowledgements = new Map(), readVersions = new Map();
    const cacheStamp = row => row?._localRevision || (row ? JSON.stringify(stripRuntime(row)) : "");
    function remember(book) {
        const next = book ? normalizeBook({ ...book, _cloudUpdated: book._cloudUpdated ?? (book._pending ? null : book.updated ?? null) }) : null;
        if (next) readVersions.set(next.id, next._pending ? next._baseUpdated ?? next._cloudUpdated : next._cloudUpdated);
        return next;
    }
    function expectedVersion(id, supplied) {
        let version = supplied;
        const acknowledgements = ownAcknowledgements.get(id);
        const seen = new Set();
        while (version != null && acknowledgements?.has(String(version)) && !seen.has(String(version))) {
            seen.add(String(version)); version = acknowledgements.get(String(version));
        }
        return version;
    }
    async function serializeWrite(id, work) {
        const previous = writeLocks.get(id) || Promise.resolve();
        const running = previous.catch(() => {}).then(work); writeLocks.set(id, running);
        try { return await running; } finally { if (writeLocks.get(id) === running) writeLocks.delete(id); }
    }
    function commitSaved(saved, stamp, pendingRow) {
        try { confirmPendingCopy(localStorage, userId, pendingRow); } catch {}
        const latest = readCache(userId).find(row => row.id === saved.id);
        if (latest?._pending && cacheStamp(latest) !== stamp) {
            if (latest._writerSession === writerSession && (String(expectedVersion(saved.id, latest._baseUpdated)) === String(saved._cloudUpdated) || (latest._createdLocally && latest._baseUpdated == null))) {
                upsertCache(userId, { ...latest, _baseUpdated: saved._cloudUpdated, _cloudUpdated: saved._cloudUpdated, _createdLocally: false });
            }
            return;
        }
        upsertCache(userId, withoutPending(saved));
    }
    function acknowledge(id, baseVersion, saved) {
        if (baseVersion != null) {
            if (!ownAcknowledgements.has(id)) ownAcknowledgements.set(id, new Map());
            ownAcknowledgements.get(id).set(String(baseVersion), saved._cloudUpdated);
        }
        readVersions.set(id, saved._cloudUpdated);
    }

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

    async function verifiedUpdate(id, patch, base) {
        try { return await cloud.updateBook(supabase, userId, id, patch, { expectedUpdated: base, writeTimeoutMs }); }
        catch (error) {
            // The server may have committed even when its response was lost.
            // Only acknowledge an authoritative read matching every requested field.
            if (error?.code !== "SAVE_TIMEOUT") {
                try { const remote = await cloudGet(id); if (cloud.matchesBookPatch(remote, patch)) return remote; } catch {}
            }
            throw error;
        }
    }
    async function saveCreated(row) {
        const remote = await cloudGet(row.id);
        const patch = cloudWritePayload(row);
        const insertSnapshot = { title: row.title, sections: row.sections, words: row.words, media_format: row.media_format, publish_meta: {}, published_chapter_ids: [], is_published: false };
        const finish = saved => cloud.matchesBookPatch(saved, patch) ? saved : verifiedUpdate(row.id, patch, saved._cloudUpdated);
        if (remote) {
            if (cloud.matchesBookPatch(remote, patch)) return remote;
            if (cloud.matchesBookPatch(remote, insertSnapshot) || (row._creationSnapshot && cloud.matchesBookPatch(remote, row._creationSnapshot))) {
                return finish(remote);
            }
            throw new Error("This book already exists with different writing. Your pending copy is retained for backup.");
        }
        try { return await finish(await cloud.insertBook(supabase, userId, { ...withoutPending(row), id: row.id }, { writeTimeoutMs })); }
        catch (error) {
            if (error?.code !== "SAVE_TIMEOUT") {
                try { const found = await cloudGet(row.id); if (cloud.matchesBookPatch(found, patch)) return found; if (cloud.matchesBookPatch(found, insertSnapshot)) return finish(found); } catch {}
            }
            throw error;
        }
    }

    async function flushOne(queued) {
        return serializeWrite(queued.id, async () => {
            const row = readCache(userId).find(item => item.id === queued.id);
            if (!row || !cacheIsPending(row)) return true;
            const stamp = cacheStamp(row);
            // A failed read is not an authoritative missing row.
            const remote = isLocalOnlyId(row.id) ? null : await cloudGet(row.id);
            if (cacheStamp(readCache(userId).find(item => item.id === row.id)) !== stamp) return false;
            if (row.user_id && String(row.user_id) !== String(userId) && !remote) throw new Error("Editor access could not be verified. Your pending writing is retained.");
            requireOnline();
            if (!remote) {
                if (!row._createdLocally && !isLocalOnlyId(row.id)) throw new Error("This book is no longer available. Download your pending writing as a backup before reviewing access.");
                const created = await saveCreated(row);
                if (created.id !== row.id) removeCache(userId, row.id);
                acknowledge(row.id, row._baseUpdated, created); commitSaved(created, stamp, row); return true;
            }
            const base = expectedVersion(row.id, row._baseUpdated ?? row._cloudUpdated ?? null);
            if (row._createdLocally && base == null) {
                const created = await saveCreated(row);
                acknowledge(row.id, base, created); commitSaved(created, stamp, row); return true;
            }
            const payload = String(remote.user_id) !== String(userId)
                ? { title: row.title, sections: row.sections, words: row.words } : cloudWritePayload(row);
            // Legacy queued copies that already equal the server need no blind write.
            if (base == null && cloud.matchesBookPatch(remote, payload)) {
                commitSaved(remote, stamp, row); return true;
            }
            const pushed = await verifiedUpdate(row.id, payload, base);
            acknowledge(row.id, base, pushed); commitSaved(pushed, stamp, row); return true;
        });
    }

    return {
        mode: "cloud",
        listRecoveryCopies(id) {
            try { return pendingCopies(localStorage, userId, id, writerSession); } catch { return []; }
        },
        async readOnlineBook(id) {
            const book = await cloudGet(id);
            if (!book) throw new Error("This book is unavailable online, or your editing access changed. Your device copy is still available for backup.");
            return normalizeBook(book);
        },
        /** Authoritative manual refresh: no cache fallback or upload on failure. */
        async refreshBook(id) {
            return serializeWrite(id, async () => {
                const remote = await cloudGet(id);
                if (!remote) throw new Error('This book is unavailable online, or your editing access changed. Your device copy has been kept.');
                const cached = readCache(userId).find(row => String(row.id) === String(id));
                if (cacheIsPending(cached)) {
                    throw Object.assign(new Error('There is unsaved writing on this device. Finish saving or reviewing it before downloading the online version.'), { code: 'BOOK_LOCAL_PENDING' });
                }
                upsertCache(userId, withoutPending(remote));
                return remember(remote);
            });
        },
        async resolveSaveConflict(id, local, { onlineUpdated, choice, recoveryIds } = {}) {
            if (!local || local.id !== id || !local.sections) throw new Error("The manuscript being reviewed does not match this book.");
            if (!["local", "online"].includes(choice)) throw new Error("Choose which manuscript to keep in the original book.");
            if (!recoveryIds?.local || !recoveryIds?.online || recoveryIds.local === recoveryIds.online || [recoveryIds.local, recoveryIds.online].includes(id)) throw new Error("Recovery book IDs are required.");
            return serializeWrite(id, async () => {
                requireOnline();
                const online = await cloudGet(id);
                if (!online) throw new Error("Online access could not be verified. Your writing has not been replaced.");
                if (onlineUpdated == null || String(online._cloudUpdated) !== String(onlineUpdated)) throw new Error("The online version changed again. Reload the online preview before choosing a version.");
                if (choice === "local" && local.media_format !== online.media_format) throw new Error("These versions use different manuscript formats. Keep the online version and recover this tab as its own book.");
                const copy = (book, label) => ({ title: `${book.title || "Untitled"} — recovery ${label}`, sections: book.sections, words: book.words, media_format: book.media_format || "novel" });
                async function ensureRecovery(copyId, payload) {
                    const existing = await cloudGet(copyId);
                    if (existing) {
                        if (String(existing.user_id) !== String(userId) || existing.is_published || !cloud.matchesBookPatch(existing, payload)) throw new Error("This recovery book changed. Reopen review to make fresh recovery copies.");
                        return existing;
                    }
                    let saved;
                    try { saved = await cloud.insertBook(supabase, userId, { ...payload, id: copyId }, { writeTimeoutMs }); }
                    catch (error) {
                        const found = await cloudGet(copyId).catch(() => null);
                        if (!found || String(found.user_id) !== String(userId) || found.is_published || !cloud.matchesBookPatch(found, payload)) throw error;
                        saved = found;
                    }
                    upsertCache(userId, withoutPending(saved));
                    return saved;
                }
                // Both manuscripts are confirmed online as private books before choosing a winner.
                const localRecovery = await ensureRecovery(recoveryIds.local, copy(local, "from this tab"));
                const onlineRecovery = await ensureRecovery(recoveryIds.online, copy(online, "from online"));
                const current = readCache(userId).find(row => row.id === id);
                const pendingRow = current?._writerSession === writerSession && cloud.matchesBookPatch(current, { title: local.title, sections: local.sections, words: local.words }) ? current : null;
                let saved;
                if (choice === "local") {
                    // Resolve manuscript writing only. Keep the latest online publication settings.
                    saved = await verifiedUpdate(id, { title: local.title, sections: local.sections, words: local.words }, onlineUpdated);
                } else {
                    saved = await cloudGet(id);
                    if (!saved || String(saved._cloudUpdated) !== String(onlineUpdated)) throw new Error("The online version changed again. Reload the online preview before choosing a version. Both recovery copies are saved.");
                }
                ownAcknowledgements.delete(id); readVersions.set(id, saved._cloudUpdated);
                commitSaved(saved, cacheStamp(pendingRow), pendingRow);
                return { ...normalizeBook(saved), _synced: true, _recoveryBooks: [localRecovery.id, onlineRecovery.id] };
            });
        },
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
            return sortByUpdated(readCache(userId).filter(row=>!row.user_id || String(row.user_id)===String(userId))).map(normalizeBook).filter(Boolean);
        },
        peekBook(id) {
            const cached = readCache(userId).find((row) => row.id === id) || null;
            return cached && (!cached.user_id || String(cached.user_id)===String(userId)) ? remember(cached) : null;
        },
        async listBooks() {
            const cached = readCache(userId);
            if (!isProbablyOnline()) {
                lastReadFromCache = true;
                return sortByUpdated(cached.filter(row=>!row.user_id || String(row.user_id)===String(userId))).map(normalizeBook).filter(Boolean);
            }
            try {
                const books = await cloudList();
                lastReadFromCache = false;
                const currentCache = readCache(userId);
                const byId = new Map(currentCache.map((row) => [row.id, row]));
                const merged = books.map((book) => {
                    const prior = byId.get(book.id);
                    if (!prior) return withoutPending(book);
                    return applyChoice(prior, book).book || withoutPending(book);
                });
                const serverIds = new Set(books.map((book) => book.id));
                const extras = currentCache.filter((row) => !serverIds.has(row.id) && (cacheIsPending(row) || isLocalOnlyId(row.id)));
                const hiddenPending=extras.filter(row=>row.user_id && String(row.user_id)!==String(userId));
                const combined = sortByUpdated([...merged.filter(Boolean), ...extras.filter(row=>!hiddenPending.includes(row))]);
                writeCache(userId, [...combined,...hiddenPending].map(stripRuntime));
                return combined.map(remember).filter(Boolean);
            } catch {
                lastReadFromCache = true;
                return sortByUpdated(readCache(userId).filter(row=>!row.user_id || String(row.user_id)===String(userId))).map(normalizeBook).filter(Boolean);
            }
        },
        async getBook(id, { refresh = false } = {}) {
            let cached = readCache(userId).find((row) => row.id === id) || null;
            if (!isProbablyOnline()) {
                lastReadFromCache = true;
                return cached && (!cached.user_id || String(cached.user_id)===String(userId)) ? normalizeBook(cached) : null;
            }
            try {
                const book = await cloudGet(id);
                cached = readCache(userId).find(row => row.id === id) || null;
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
                if(!book && cached?.user_id && String(cached.user_id)!==String(userId)){
                    if(!cacheIsPending(cached))removeCache(userId,id);
                    return null;
                }
                const picked = refresh && book && !cacheIsPending(cached)
                    ? { book: withoutPending(book) } : applyChoice(cached, book);
                if (!picked.book) {
                    if (cached && !cacheIsPending(cached)) removeCache(userId, id);
                    return cached && cacheIsPending(cached) ? normalizeBook(cached) : null;
                }
                upsertCache(userId, picked.book);
                return remember(picked.book);
            } catch {
                lastReadFromCache = true;
                return cached && (!cached.user_id || String(cached.user_id)===String(userId)) ? normalizeBook(cached) : null;
            }
        },
        async insertBook(payload, { strict = false } = {}) {
            const seed = { ...asBook(payload), id: payload?.id || newOfflineBookId() };
            try {
                requireOnline();
                const book = await cloud.insertBook(supabase, userId, seed, { writeTimeoutMs });
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
                    _createdLocally: true,
                    _creationSnapshot: { title: seed.title, sections: seed.sections, words: seed.words, media_format: seed.media_format, publish_meta: {}, published_chapter_ids: [], is_published: false },
                    _localRevision: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
                    _writerSession: writerSession,
                }, true);
                upsertCache(userId, fallback);
                return { ...fallback, _synced: false };
            }
        },
        async updateBook(id, patch, { expectedUpdated } = {}) {
            return serializeWrite(id, async () => {
                const previous = readCache(userId).find(row => row.id === id);
                // Queue the version this tab's own saves reached; acknowledgements are lost on reload.
                const supplied = expectedVersion(id, expectedUpdated ?? readVersions.get(id) ?? previous?._baseUpdated ?? previous?._cloudUpdated ?? (!previous?._pending ? previous?.updated : null));
                const optimistic = withPending({ ...stashPatch(previous, id, userId, { ...patch, updated: Date.now() }), _writerSession: writerSession, _baseUpdated: supplied ?? null }, true);
                const stamp = cacheStamp(optimistic), cached = upsertCache(userId, optimistic);
                try {
                    requireOnline();
                    const shared = previous?.user_id && String(previous.user_id) !== String(userId);
                    const allowedPatch = shared ? Object.fromEntries(Object.entries(patch).filter(([key]) => ["title", "sections", "words"].includes(key))) : patch;
                    const base = expectedVersion(id, supplied);
                    const saved = optimistic._createdLocally && base == null
                        ? await saveCreated(optimistic) : await verifiedUpdate(id, allowedPatch, base);
                    acknowledge(id, base, saved); commitSaved(saved, stamp, optimistic);
                    return { ...normalizeBook(saved), _synced: true };
                } catch (error) {
                    return { ...normalizeBook(optimistic), _synced: false, _cached: cached, _pending: true, _syncCode: error?.code || "", _syncError: error?.message || "Could not save to the cloud." };
                }
            });
        },
        stashBook(id, patch, { expectedUpdated } = {}) {
            const previous = readCache(userId).find((row) => row.id === id);
            const optimistic = withPending({ ...stashPatch(previous, id, userId, { ...patch, updated: Date.now() }), _writerSession: writerSession, _baseUpdated: expectedVersion(id, expectedUpdated ?? readVersions.get(id) ?? previous?._baseUpdated ?? previous?._cloudUpdated ?? (!previous?._pending ? previous?.updated : null)) }, true);
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
                        if (await flushOne(row)) synced += 1;
                        else failed += 1;
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

