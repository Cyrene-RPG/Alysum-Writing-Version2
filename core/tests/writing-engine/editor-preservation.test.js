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

test("test client never initializes cloud or changes existing authentication/book storage", async () => {
    globalThis.localStorage = createStorage();
    const original = JSON.stringify({ books: [sampleBook] });
    localStorage.setItem("alysum-local-studio-v1", original);
    localStorage.setItem("sb-tiqmhozzxhiydjnyuuaw-auth-token", "preserve-auth");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("Unexpected network request"); };
    try {
        const { supabase } = await import("../../authentication/client.js");
        assert.equal((await supabase.auth.getSession()).data.session, null);
        assert.throws(() => supabase.from("books"), /Cloud access is disabled/);
        assert.throws(() => supabase.rpc("anything"), /Cloud access is disabled/);
        assert.equal(localStorage.getItem("alysum-local-studio-v1"), original);
        assert.equal(localStorage.getItem("sb-tiqmhozzxhiydjnyuuaw-auth-token"), "preserve-auth");
    } finally { globalThis.fetch = originalFetch; }
});

test("editing and reopening one sample chapter preserves every other chapter, notes, IDs and metadata", async () => {
    globalThis.localStorage = createStorage();
    const source = structuredClone(sampleBook);
    localStorage.setItem("alysum-local-studio-v1", JSON.stringify({ books: [source] }));
    const oldStorage = localStorage.getItem("alysum-local-studio-v1");
    const api = createBooksApi({ mode: "local" });
    const saved = await api.insertBook(source);
    const before = structuredClone(saved);
    const html = "<p>New <em>italic</em> words.</p><ul><li>One</li><li>Two</li></ul>";
    await api.updateBook(saved.id, { sections: setChapterContent(saved.sections, "test-chapter-one", html) });
    const reopened = await createBooksApi({ mode: "local" }).getBook(saved.id);
    const expected = { ...before, sections: setChapterContent(before.sections, "test-chapter-one", html) };
    delete reopened.updated;
    delete expected.updated;
    assert.deepEqual(reopened, expected);
    assert.deepEqual(source, sampleBook);
    assert.notEqual(LOCAL_STUDIO_STORAGE_KEY, "alysum-local-studio-v1");
    assert.equal(localStorage.getItem("alysum-local-studio-v1"), oldStorage);
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
