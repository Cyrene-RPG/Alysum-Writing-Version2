import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeAnnouncement, validateAnnouncement, listPublicAnnouncements, listOwnAnnouncements,
    getAnnouncementAccess, saveAnnouncement, listAnnouncementBooks, announcementUrl, UPDATE_PAGE_SIZE,
} from "../../publishing/announcements.js";
import { renderAnnouncement } from "../../../applications/updates/page-ui/render.js";

const row = {
    id: "post-1", author_id: "author-1", scope: "author", category: "announcement",
    title: "News", body: "Hello readers", book_id: null, status: "draft",
    created_at: "2026-10-20T12:00:00Z", updated_at: "2026-10-20T12:00:00.123456Z",
    published_at: null,
};
const input = { id: "post-1", scope: "author", category: "announcement", title: " News ", body: " Hello readers ", bookId: "" };

function clientFor(result = { data: [], error: null }) {
    const calls = [];
    const query = {};
    for (const name of ["select", "eq", "order", "range", "limit", "maybeSingle"]) {
        query[name] = (...args) => { calls.push([name, ...args]); return query; };
    }
    query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return {
        calls,
        from(table) { calls.push(["from", table]); return query; },
        async rpc(name, payload) { calls.push(["rpc", name, payload]); return result; },
    };
}

test("public detail and author feeds always exclude drafts and use stable pagination", async () => {
    const client = clientFor({ data: [{ ...row, status: "published" }], error: null });
    const posts = await listPublicAnnouncements(client, { authorId: "writer", offset: 20, category: "new" });
    assert.equal(posts[0].authorId, "author-1");
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "status", "published"])));
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "author_id", "writer"])));
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(["range", 20, 20 + UPDATE_PAGE_SIZE - 1])));
    const detail = clientFor();
    await listPublicAnnouncements(detail, { postId: "post", category: "fixed" });
    assert.ok(detail.calls.some(call => call[0] === "eq" && call[1] === "status" && call[2] === "published"));
    assert.ok(!detail.calls.some(call => call[0] === "eq" && call[1] === "category"));
});

test("What’s New requests site updates while saved posts are scoped to the signed-in owner", async () => {
    const publicClient = clientFor();
    await listPublicAnnouncements(publicClient);
    assert.ok(publicClient.calls.some(call => call[0] === "eq" && call[1] === "scope" && call[2] === "site"));
    const ownClient = clientFor();
    await listOwnAnnouncements(ownClient, "me");
    assert.ok(ownClient.calls.some(call => call[0] === "eq" && call[1] === "author_id" && call[2] === "me"));
    await assert.rejects(listOwnAnnouncements(ownClient, ""), /Sign in/);
});

test("saving uses the same post id and exact server revision, leaving ownership to the RPC", async () => {
    const client = clientFor({ data: [row], error: null });
    const saved = await saveAnnouncement(client, { ...input, updatedAt: row.updated_at });
    const payload = client.calls[0][2];
    assert.equal(payload.p_id, input.id);
    assert.equal(payload.p_expected_updated_at, row.updated_at);
    assert.equal(payload.p_title, "News");
    assert.equal(payload.p_body, "Hello readers");
    assert.equal(payload.p_publish, false);
    assert.equal(payload.p_book_id, null);
    assert.equal(saved.updatedAt, row.updated_at);
    assert.ok(!("author_id" in payload));
    const publishing = clientFor({ data: [{ ...row, status: "published", published_at: row.created_at }], error: null });
    const published = await saveAnnouncement(publishing, input, { publish: true });
    assert.equal(publishing.calls[0][2].p_publish, true);
    assert.equal(published.status, "published");
});

test("invalid content cannot make a save request", async () => {
    const client = clientFor();
    for (const invalid of [
        { title: " " }, { body: "" }, { title: "a".repeat(161) },
        { body: "a".repeat(12001) }, { scope: "everyone" }, { category: "unknown" },
        { scope: "site", bookId: "book" },
    ]) await assert.rejects(saveAnnouncement(client, { ...input, ...invalid }));
    assert.equal(client.calls.length, 0);
    assert.equal(validateAnnouncement({ ...input, title: "😀".repeat(160) }).title.length, 320);
});

test("missing setup, permission errors, stale saves and unconfirmed results are visible failures", async () => {
    await assert.rejects(listPublicAnnouncements(clientFor({ error: { message: "Could not find announcements in schema cache" } })), /not available yet/);
    await assert.rejects(saveAnnouncement(clientFor({ error: { message: "Only admin staff can publish Alysum updates." } }), input), /Only admin/);
    await assert.rejects(saveAnnouncement(clientFor({ error: { message: "This update changed elsewhere." } }), input), /changed elsewhere/);
    await assert.rejects(saveAnnouncement(clientFor({ data: [] }), input), /Could not confirm/);
});

test("author book choices exclude unpublished and anonymous listings", async () => {
    const books = await listAnnouncementBooks(clientFor({ data: [
        { id: "live", data: { title: "Public book", isPublished: true } },
        { id: "hidden", data: { title: "Hidden", isPublished: false } },
        { id: "anonymous", data: { title: "Anonymous", isAnonymous: true } },
    ] }), "author-1");
    assert.deepEqual(books, [{ id: "live", title: "Public book" }]);
});

test("publishing access requires explicit boolean grants from the server", async () => {
    assert.deepEqual(await getAnnouncementAccess(clientFor({ data: { canPublishSite: "true", canPublishAuthor: false } })), {
        canPublishSite: false, canPublishAuthor: false,
    });
    assert.deepEqual(await getAnnouncementAccess(clientFor({ data: { canPublishSite: true, canPublishAuthor: true } })), {
        canPublishSite: true, canPublishAuthor: true,
    });
    assert.equal(normalizeAnnouncement(row).bookId, "");
    assert.equal(announcementUrl("id&scope=site"), "/updates?post=id%26scope%3Dsite");
});

test("public posts render untrusted content as text and use only internal encoded links", () => {
    const previous = globalThis.document;
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
        append(...children) { this.children.push(...children); }
    }
    globalThis.document = { createElement: tag => new Element(tag) };
    try {
        const post = renderAnnouncement({
            ...normalizeAnnouncement(row), title: "<img src=x onerror=alert(1)>",
            body: "<script>alert(1)</script>", bookId: 'x" onclick="bad', authorId: "a&post=b",
        }, { detail: true, authorName: "<script>author</script>" });
        const elements = [];
        const visit = el => { if (typeof el === "string") return; elements.push(el); el.children.forEach(visit); };
        visit(post);
        assert.ok(!elements.some(el => el.tag === "img" || el.tag === "script"));
        assert.ok(elements.some(el => el.textContent === "<script>alert(1)</script>"));
        assert.ok(elements.filter(el => el.tag === "a").every(el => el.href.startsWith("/")));
        assert.ok(elements.some(el => el.href === "/updates?author=a%26post%3Db"));
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
});
