import test from "node:test";
import assert from "node:assert/strict";
import { createSnippetLink, decodeSnippet, encodeSnippet, normalizeSnippet, MAX_SNIPPET_LENGTH } from "../../publishing/snippets.js";

const sample = { version: 1, title: "A draft", byline: "Writer", note: "From chapter 2.", excerpt: "The door was open.\n\n誰もいなかった。 🗝️" };

test("shared links round-trip Unicode and paragraph breaks without sending text in the path or query", async () => {
    const href = await createSnippetLink(sample, "https://alysum.example/editor?book=private-id");
    const url = new URL(href);
    assert.equal(url.pathname, "/snippet");
    assert.equal(url.search, "");
    assert.deepEqual(await decodeSnippet(url.hash), sample);
});

test("only approved excerpt fields enter the link, even if a caller supplies an entire book", async () => {
    const encoded = await encodeSnippet({ ...sample, bookId: "private-id", sections: [{ content: "SECRET CHAPTER" }], email: "private@example.com", ownerToken: "secret" });
    const decoded = await decodeSnippet(encoded);
    assert.deepEqual(Object.keys(decoded).sort(), ["version", "title", "byline", "note", "excerpt"].sort());
    assert.equal(JSON.stringify(decoded).includes("SECRET CHAPTER"), false);
    assert.deepEqual(decoded, sample);
});

test("empty, oversized, and unsupported snippets are rejected rather than silently sharing truncated content", () => {
    assert.throws(() => normalizeSnippet({ ...sample, excerpt: "  " }));
    assert.throws(() => normalizeSnippet({ ...sample, excerpt: "x".repeat(MAX_SNIPPET_LENGTH + 1) }));
    assert.throws(() => normalizeSnippet({ ...sample, version: 2 }));
    assert.throws(() => normalizeSnippet({ ...sample, title: "x".repeat(121) }));
    assert.throws(() => normalizeSnippet({ ...sample, excerpt: { text: "wrong type" } }));
});

test("HTML is transported as plain text, never interpreted or returned as markup nodes", async () => {
    const snippet = { ...sample, excerpt: '<img src=x onerror="alert(1)">\n<script>evil()</script>' };
    assert.equal((await decodeSnippet(await encodeSnippet(snippet))).excerpt, snippet.excerpt);
});

test("a link is an immutable snapshot independent of later draft changes", async () => {
    const draft = { ...sample };
    const link = await createSnippetLink(draft, "https://alysum.example");
    draft.excerpt = "Changed manuscript";
    assert.equal((await decodeSnippet(new URL(link).hash)).excerpt, sample.excerpt);
});

test("malformed or missing links and untrusted versions fail closed", async () => {
    for (const invalid of ["", "#", "v2.abc", "v1.%00", "v1.a", "v1.8J-", "v1z.bm90LWd6aXA", "#" + "a".repeat(50000)]) {
        await assert.rejects(decodeSnippet(invalid));
    }
});

test("plain encoding works when compression is unavailable", async () => {
    const saved = globalThis.CompressionStream;
    try {
        globalThis.CompressionStream = undefined;
        const encoded = await encodeSnippet(sample);
        assert.ok(encoded.startsWith("v1."));
        assert.deepEqual(await decodeSnippet(encoded), sample);
    } finally { globalThis.CompressionStream = saved; }
});

test("compressed input is bounded after decompression", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...sample, excerpt: "x".repeat(500000) }));
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    const zipped = new Uint8Array(await new Response(stream).arrayBuffer());
    const encoded = Buffer.from(zipped).toString("base64url");
    await assert.rejects(decodeSnippet(`v1z.${encoded}`), /damaged or too large/);
});

test("invalid UTF-8 is rejected", async () => {
    await assert.rejects(decodeSnippet(`v1.${Buffer.from([0xff, 0xfe]).toString("base64url")}`));
});
