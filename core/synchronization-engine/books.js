/**
 * Session-aware book CRUD. Local guest uses local-adapter; signed-in users
 * use public.books and keep a device cache so a failed save does not wipe the page.
 */
import {
    deleteBook as deleteLocalBook,
    getBook as getLocalBook,
    insertBook as insertLocalBook,
    listBooks as listLocalBooks,
    updateBook as updateLocalBook,
} from "./local-adapter.js";
import * as cloud from "./cloud-adapter.js";
import {
    createEmptyBook,
    ensureChapterIds,
    mergeSectionsByChapterId,
    walkBookChapters,
    withUpdatedWords,
} from "../writing-engine/manuscript.js?v=4";
import { countWordsInChapter } from "../writing-engine/word-count.js";

const CACHE_PREFIX = "alysum:editor:draft-cache-";

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

function upsertCache(userId, book) {
    if (!book?.id) return;
    const books = readCache(userId).filter((row) => row.id !== book.id);
    books.unshift(book);
    writeCache(userId, books);
}

function removeCache(userId, id) {
    writeCache(userId, readCache(userId).filter((row) => row.id !== id));
}

function sortByUpdated(books) {
    return [...books].sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
}

function allChapters(sections) {
    const src = sections && typeof sections === "object" ? sections : {};
    return [
        ...walkBookChapters(src.front),
        ...walkBookChapters(src.body),
        ...walkBookChapters(src.back),
    ];
}

function chapterMap(sections) {
    return new Map(allChapters(sections).map((chapter) => [String(chapter.id || ""), chapter]));
}

function pickBookTitle(cloudTitle, cacheTitle, cacheNewer) {
    const cloud = String(cloudTitle || "").trim() || "Untitled Book";
    const cache = String(cacheTitle || "").trim();
    if (cache && cache !== "Untitled Book" && (cloud === "Untitled Book" || cacheNewer)) return cache;
    return cloud;
}

function shouldPushMerged(cloudBook, merged) {
    const prior = chapterMap(cloudBook?.sections);
    for (const chapter of allChapters(merged?.sections)) {
        const id = String(chapter.id || "");
        if (!id) continue;
        const existing = prior.get(id);
        if (!existing) return true;
        const mergedWords = countWordsInChapter(chapter);
        const existingWords = countWordsInChapter(existing);
        if (mergedWords > existingWords) return true;
        if (mergedWords > 0 && String(chapter.content || "") !== String(existing.content || "")) return true;
        const mergedTitle = String(chapter.title || "").trim();
        const existingTitle = String(existing.title || "").trim();
        if (mergedTitle && mergedTitle !== existingTitle && (!existingTitle || existingTitle === "Untitled")) {
            return true;
        }
    }
    return false;
}

function mergeLoadedBook(cached, cloudBook) {
    if (!cached) return { book: cloudBook, push: false };
    if (!cloudBook) return { book: cached, push: false };
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
    return { book, push: shouldPushMerged(cloudBook, book) };
}

function stashPatch(previous, id, userId, patch) {
    return {
        ...(previous || { id, user_id: userId }),
        ...patch,
        id,
        user_id: userId,
        updated: Number(patch.updated) || Date.now(),
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
        return {
            mode: "local",
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
                return normalizeBook(updateLocalBook(id, patch));
            },
            stashBook(id, patch) {
                return normalizeBook(updateLocalBook(id, { ...patch, updated: Date.now() }));
            },
            async deleteBook(id) {
                deleteLocalBook(id);
            },
        };
    }

    return {
        mode: "cloud",
        async listBooks() {
            try {
                const books = await cloud.listBooks(supabase, userId);
                const cached = readCache(userId);
                const byId = new Map(cached.map((row) => [row.id, row]));
                const merged = books.map((book) => {
                    const prior = byId.get(book.id);
                    return prior ? mergeLoadedBook(prior, book).book : book;
                });
                writeCache(userId, merged);
                return merged.map(normalizeBook).filter(Boolean);
            } catch {
                return sortByUpdated(readCache(userId));
            }
        },
        async getBook(id) {
            const cached = readCache(userId).find((row) => row.id === id) || null;
            try {
                const book = await cloud.getBook(supabase, userId, id);
                if (book && cached) {
                    const picked = mergeLoadedBook(cached, book);
                    if (picked.push) {
                        try {
                            const pushed = await cloud.updateBook(supabase, userId, id, {
                                title: picked.book.title,
                                sections: picked.book.sections,
                                words: picked.book.words,
                                media_format: picked.book.media_format,
                                publish_meta: picked.book.publish_meta || {},
                                published_chapter_ids: picked.book.published_chapter_ids || [],
                            });
                            const keep = mergeLoadedBook(picked.book, pushed).book;
                            upsertCache(userId, keep);
                            return normalizeBook(keep);
                        } catch {
                            upsertCache(userId, picked.book);
                            return normalizeBook(picked.book);
                        }
                    }
                    upsertCache(userId, picked.book);
                    return normalizeBook(picked.book);
                }
                if (book) {
                    upsertCache(userId, book);
                    return normalizeBook(book);
                }
            } catch {
                /* fall through to cache */
            }
            return cached ? normalizeBook(cached) : null;
        },
        async insertBook(payload) {
            const seed = asBook(payload);
            try {
                const book = await cloud.insertBook(supabase, userId, seed);
                upsertCache(userId, book);
                return book;
            } catch {
                const fallback = {
                    ...seed,
                    id: seed.id || `local-book-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    user_id: userId,
                    created: Date.now(),
                    updated: Date.now(),
                };
                upsertCache(userId, fallback);
                return fallback;
            }
        },
        async updateBook(id, patch) {
            const previous = readCache(userId).find((row) => row.id === id);
            const optimistic = stashPatch(previous, id, userId, { ...patch, updated: Date.now() });
            upsertCache(userId, optimistic);
            try {
                const book = await cloud.updateBook(supabase, userId, id, patch);
                const keep = mergeLoadedBook(optimistic, book).book;
                upsertCache(userId, keep);
                return keep;
            } catch {
                return optimistic;
            }
        },
        stashBook(id, patch) {
            const previous = readCache(userId).find((row) => row.id === id);
            const optimistic = stashPatch(previous, id, userId, { ...patch, updated: Date.now() });
            upsertCache(userId, optimistic);
            return normalizeBook(optimistic);
        },
        async deleteBook(id) {
            removeCache(userId, id);
            try {
                await cloud.deleteBook(supabase, userId, id);
            } catch {
                /* cache already dropped */
            }
        },
    };
}
