import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBooksApi } from '../../synchronization-engine/books.js';
import { loadPublicationBook, readPublicationVersion, savePublicationSettings } from '../../publishing/publication-save.js';

const clone = value => structuredClone(value);
const original = () => ({ id: 'book', user_id: 'owner', title: 'Book', created: 1, updated: 1,
    sections: { front: [], body: [{ id: 'chapter', title: 'Chapter', content: 'word '.repeat(600), notes: [] }], back: [] },
    media_format: 'novel', words: 600, publish_meta: {}, published_chapter_ids: [], is_published: false });
const form = () => ({ title: 'Book', author: 'Author', genres: ['fantasy'], rating: 'general', chapterIds: ['chapter'],
    warningMeta: { version: 1, reviewed: true, noneApply: true, coreIds: [], entries: [], note: '' } });

async function publishSave() {
    let code = await readFile(new URL('../../../applications/studio/page-ui/publish-save.js', import.meta.url), 'utf8');
    code = code.replace(/(["'])(@alysum\/publishing\/|\/core\/writing-engine\/)([^"']+)\1/g,
        (_match, _quote, prefix, tail) => JSON.stringify(new URL((prefix.startsWith('@') ? '../../publishing/' : '../../writing-engine/') + tail, import.meta.url).href));
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

function fixture({ pending = null } = {}) {
    let remote = original(), listing = null, race = null;
    const cacheKey = 'alysum:editor:draft-cache-owner', storage = new Map([[cacheKey, JSON.stringify(pending ? [pending] : [])]]);
    const previousStorage = globalThis.localStorage, previousWindow = globalThis.window;
    const calls = [], redirects = [];
    globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key), key: index => [...storage.keys()][index], get length() { return storage.size; } };
    globalThis.window = { setTimeout, location: { replace: url => redirects.push(url) } };
    const client = { from(table) {
        let patch = null, filters = {};
        const query = {
            select() { return query; }, eq(key, value) { filters[key] = value; return query; },
            update(value) { patch = clone(value); return query; }, upsert(value) { patch = clone(value); return query; },
            async maybeSingle() { return { data: clone(table === 'books' ? remote : listing) }; },
            async then(resolve, reject) {
                try {
                    if (table === 'library') {
                        calls.push({ table, patch: clone(patch) }); listing = clone(patch); remote.updated += 1;
                        return resolve({ data: [], error: null });
                    }
                    if (race) { race(remote); race = null; }
                    calls.push({ table, patch: clone(patch), filters: clone(filters) });
                    if (String(remote.updated) !== String(filters.updated)) return resolve({ data: [], error: null });
                    remote = { ...remote, ...patch }; return resolve({ data: [clone(remote)], error: null });
                } catch (error) { return reject(error); }
            },
        }; return query;
    } };
    const api = createBooksApi({ mode: 'cloud', user: { id: 'owner' } }, client);
    return { api, client, calls, redirects, remote: () => remote, change: fn => fn(remote), race: fn => { race = fn; },
        cache: () => JSON.parse(storage.get(cacheKey) || '[]')[0],
        cleanup() { globalThis.localStorage = previousStorage; globalThis.window = previousWindow; } };
}

async function post(f, context) {
    const { runPublishSave } = await publishSave();
    return runPublishSave({ isPublished: true, listed: false, session: { mode: 'cloud', user: { id: 'owner' } },
        api: f.api, supabase: f.client, book: context.book, publicationBaseline: context.baseline,
        chapters: context.book.sections.body, readForm: form, postError: {}, async loadDraftCoverFile() { return null; } });
}

test('publishing survives an identical editor resave and a timestamp change during the listing request', async () => {
    const f = fixture(); try {
        const context = await loadPublicationBook(f.api, 'book', 'owner');
        f.change(book => { book.updated = 20; book.words = 601; });
        await post(f, context);
        assert.deepEqual(f.calls.map(call => call.table), ['library', 'books']);
        assert.equal(f.calls[1].filters.updated, 21);
        assert.equal('sections' in f.calls[1].patch, false); assert.equal('words' in f.calls[1].patch, false);
        assert.equal(f.remote().sections.body[0].content, original().sections.body[0].content);
        assert.equal(f.remote().words, 601); assert.equal(f.remote().is_published, true);
        assert.deepEqual(f.redirects, ['/book?id=book']); assert.equal(f.cache()._pending, undefined);
    } finally { f.cleanup(); }
});

test('reopening after a failed publication restores form settings but uses an authoritative save baseline', async () => {
    const pending = { ...original(), updated: 999, _cloudUpdated: 0, _baseUpdated: 0, _pending: true,
        publish_meta: { synopsis: 'Pending author form' }, published_chapter_ids: ['chapter'], is_published: true };
    const f = fixture({ pending }); try {
        const context = await loadPublicationBook(f.api, 'book', 'owner');
        assert.equal(context.book.publish_meta.synopsis, 'Pending author form');
        assert.equal(context.baseline._cloudUpdated, 1);
        assert.equal(f.cache()._pending, true, 'Reading the form must not erase its pending copy');
        await post(f, context); assert.equal(f.remote().is_published, true); assert.equal(f.cache()._pending, undefined);
    } finally { f.cleanup(); }
});

test('opening Publish never discards pending manuscript edits or publishes them without saving', async () => {
    const pending = { ...original(), _pending: true, _cloudUpdated: 1, _baseUpdated: 1 };
    pending.sections.body[0].content = 'Unsaved private writing';
    const f = fixture({ pending }); try {
        await assert.rejects(loadPublicationBook(f.api, 'book', 'owner'), error => error.code === 'PUBLISH_PENDING_WRITING');
        assert.equal(f.cache().sections.body[0].content, 'Unsaved private writing'); assert.deepEqual(f.calls, []);
    } finally { f.cleanup(); }
});

test('real changes to chapters, private notes, title, publication settings or draft state stop before public writes', async () => {
    const changes = [book => { book.sections.body[0].content += ' New text'; },
        book => { book.sections.body[0].notes.push({ id: 'note', content: 'Private note' }); },
        book => { book.title = 'New title'; }, book => { book.publish_meta.complete = true; },
        book => { book.published_chapter_ids = ['chapter']; }, book => { book.is_published = true; },
        book => { book.publish_meta.revisionNeedsPublishReview = true; }];
    for (const change of changes) {
        const f = fixture(); try {
            const context = await loadPublicationBook(f.api, 'book', 'owner'); f.change(change);
            await assert.rejects(post(f, context), error => error.code === 'PUBLISH_BOOK_CHANGED');
            assert.deepEqual(f.calls, []); assert.deepEqual(f.redirects, []);
        } finally { f.cleanup(); }
    }
});

test('a change racing the final save still fails compare-and-set without replacing manuscript text', async () => {
    const f = fixture(); try {
        const context = await loadPublicationBook(f.api, 'book', 'owner');
        f.race(book => { book.updated = 50; book.sections.body[0].content = 'Newer online manuscript'; });
        await assert.rejects(post(f, context), error => error.code === 'BOOK_CONFLICT');
        assert.equal(f.remote().sections.body[0].content, 'Newer online manuscript');
        assert.equal(f.calls.filter(call => call.table === 'books').length, 1); assert.deepEqual(f.redirects, []);
    } finally { f.cleanup(); }
});

test('owner checks and failed verification reads cannot write publication settings', async () => {
    const f = fixture(); try {
        const context = await loadPublicationBook(f.api, 'book', 'owner');
        await assert.rejects(readPublicationVersion(f.api, context.baseline, 'other'), /Only the book owner/);
        await assert.rejects(savePublicationSettings(f.api, context.baseline, { sections: {} }, 'owner'), /cannot replace manuscript/);
        await assert.rejects(readPublicationVersion({ async readOnlineBook() { throw Error('Network unavailable'); } }, context.baseline, 'owner'), /Network unavailable/);
        assert.deepEqual(f.calls, []);
    } finally { f.cleanup(); }
});

test('pending form settings cannot clear a main-draft publication review guard', async () => {
    const pending = { ...original(), _pending: true, publish_meta: {} };
    const f = fixture({ pending }); try {
        f.change(book => { book.publish_meta.revisionNeedsPublishReview = true; });
        const context = await loadPublicationBook(f.api, 'book', 'owner');
        assert.equal(context.book.publish_meta.revisionNeedsPublishReview, true);
    } finally { f.cleanup(); }
});
