import test from "node:test";
import assert from "node:assert/strict";
import { sampleBook } from "../../../applications/editor/tests/sample-book.js";
import { createBooksApi } from "../../synchronization-engine/books.js";
import { LOCAL_STUDIO_STORAGE_KEY } from "../../synchronization-engine/local-adapter.js";
import { setChapterContent } from "../../writing-engine/manuscript.js";
import { createAutosave } from "../../../applications/editor/page-ui/autosave.js";

function createStorage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test("editing and reopening one sample chapter preserves other books, chapters, notes, IDs and metadata", async () => {
    // In-memory storage only; this test never connects to a real browser or cloud.
    globalThis.localStorage = createStorage();
    const source = structuredClone(sampleBook);
    const api = createBooksApi({ mode: "local" });
    const saved = await api.insertBook(source);
    const other = await api.insertBook({ ...structuredClone(sampleBook), id: "another-test-book" });
    const before = structuredClone(saved);
    const html = "<p>New <em>italic</em> words.</p><ul><li>One</li><li>Two</li></ul>";
    await api.updateBook(saved.id, { sections: setChapterContent(saved.sections, "test-chapter-one", html) });
    const reopened = await createBooksApi({ mode: "local" }).getBook(saved.id);
    const expected = { ...before, sections: setChapterContent(before.sections, "test-chapter-one", html) };
    delete reopened.updated;
    delete expected.updated;
    assert.deepEqual(reopened, expected);
    assert.deepEqual(await api.getBook(other.id), other);
    assert.deepEqual(source, sampleBook);
    assert.equal(LOCAL_STUDIO_STORAGE_KEY, "alysum-local-studio-v1");
});

test("a failed save is reported and a retry can save the complete chapter", async () => {
    globalThis.window = { setTimeout };
    let fail = true;
    let result;
    const save = createAutosave({ save: async book => { if (fail) throw new Error("Storage full"); result = structuredClone(book); } });
    save.schedule(sampleBook);
    assert.equal(await save.flush(), "error");
    fail = false;
    save.schedule(sampleBook);
    assert.equal(await save.flush(), "saved");
    assert.deepEqual(result, sampleBook);
});
