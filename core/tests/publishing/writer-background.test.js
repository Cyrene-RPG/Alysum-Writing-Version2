import test from "node:test";
import assert from "node:assert/strict";
import { readPublishDraft } from "../../publishing/publish-meta.js";
import {
    assertWriterBackgroundFile,
    readWriterBackgroundUrl,
    safeWriterBackgroundUrl,
} from "../../publishing/writer-background.js";

test("writer background URLs must be public HTTPS without credentials", () => {
    for (const unsafe of [
        "javascript:alert(1)",
        "data:image/png;base64,aaaa",
        "blob:https://example.com/1",
        "https://user:pass@cdn.example/bg.jpg",
        'https://cdn.example/x".jpg',
        "https://cdn.example/x\\.jpg",
        "not a url",
        "https://cdn.example/" + "x".repeat(2000),
        "",
        null,
    ]) {
        assert.equal(safeWriterBackgroundUrl(unsafe), "");
    }
    assert.equal(
        safeWriterBackgroundUrl(" https://jrfxgpkpbacajhcwimgz.supabase.co/storage/v1/object/public/book-content-images/u/b/writer-bg/a.jpg "),
        "https://jrfxgpkpbacajhcwimgz.supabase.co/storage/v1/object/public/book-content-images/u/b/writer-bg/a.jpg",
    );
    assert.equal(safeWriterBackgroundUrl("http://cdn.example/bg.jpg"), "https://cdn.example/bg.jpg");
    assert.equal(safeWriterBackgroundUrl("//cdn.example/bg.jpg"), "https://cdn.example/bg.jpg");
});

test("publish_meta keeps a per-book writer background URL in camelCase", () => {
    const url = "https://cdn.example/book-one.jpg";
    assert.equal(readPublishDraft({ publish_meta: { writerBackgroundUrl: url } }).writerBackgroundUrl, url);
    assert.equal(readPublishDraft({ publish_meta: { writer_background_url: url } }).writerBackgroundUrl, url);
    assert.equal(readPublishDraft({ publish_meta: { writerBackgroundUrl: "javascript:alert(1)" } }).writerBackgroundUrl, "");
    assert.equal(readWriterBackgroundUrl({ writerBackgroundUrl: url }), url);
});

test("writer background files must be images of 8 MB or smaller", () => {
    assert.throws(() => assertWriterBackgroundFile(null), /Choose an image/);
    assert.throws(() => assertWriterBackgroundFile({ type: "application/pdf", size: 12 }), /image file/);
    assert.throws(() => assertWriterBackgroundFile({ type: "image/jpeg", size: 9 * 1024 * 1024 }), /8 MB/);
    assert.doesNotThrow(() => assertWriterBackgroundFile({ type: "image/jpeg", size: 12 }));
    assert.doesNotThrow(() => assertWriterBackgroundFile({ type: "", size: 12 }));
});
