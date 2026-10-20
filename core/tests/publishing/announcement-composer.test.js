import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class Element {
    constructor(id = "") {
        this.id = id; this.children = []; this.events = {};
        this.value = ""; this.hidden = false; this.disabled = false; this.textContent = "";
    }
    get options() { return this.children; }
    append(...children) {
        const wasEmpty = !this.children.length;
        this.children.push(...children);
        if (wasEmpty && children[0]?.value !== undefined) this.value = children[0].value;
    }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(event, callback) { this.events[event] = callback; }
    focus() { this.focused = true; }
    reset() {}
}

async function fixture(run, { posts = [], saveError = "" } = {}) {
    const ids = ["update-form", "save-status", "update-scope", "update-category", "update-title", "update-body", "update-book",
        "new-update", "publish-update", "save-update", "publication-note", "audience-note", "book-field",
        "composer-heading", "preview-panel", "published-link", "saved-updates", "more-saved", "saved-status",
        "preview-update", "preview-content", "refresh-saved", "access-status", "sign-in-note", "publisher", "books-status"];
    const nodes = Object.fromEntries(ids.map(id => [id, new Element(id)]));
    nodes["update-category"].value = "announcement";
    nodes["update-book"].append(Object.assign(new Element(), { value: "" }));
    nodes["update-form"].elements = Object.values(nodes).filter(node => node.id.startsWith("update-"));
    const calls = [];
    let authChanged;
    const user = { id: "author" };
    const window = {
        events: {}, confirm: () => true, addEventListener(event, callback) { this.events[event] = callback; },
        location: { reload() { calls.push("reload"); } },
    };
    const supabase = { auth: {
        async getUser() { return { data: { user } }; },
        onAuthStateChange(callback) { authChanged = callback; },
    } };
    const dependencies = {
        document: { getElementById: id => nodes[id], createElement: () => new Element() }, window,
        crypto: { randomUUID: () => "stable-new-id" }, supabase,
        resolveStudioSession: async () => ({ mode: "cloud", user }),
        getAnnouncementAccess: async () => ({ canPublishAuthor: true, canPublishSite: false }),
        listOwnAnnouncements: async () => posts,
        listAnnouncementBooks: async () => [],
        saveAnnouncement: async (client, input, settings) => {
            calls.push({ input: { ...input }, settings });
            if (saveError) throw new Error(saveError);
            return { ...input, updatedAt: "server-revision", status: settings.publish ? "published" : "draft" };
        },
        validateAnnouncement: value => {
            if (!value.title.trim() || !value.body.trim()) throw new Error("Enter a title and body.");
            return value;
        },
        announcementUrl: id => "/updates?post=" + id, UPDATE_PAGE_SIZE: 20,
        renderAnnouncement: () => new Element(),
    };
    const source = await readFile(new URL("../../../applications/updates/page-ui/compose.js", import.meta.url), "utf8");
    const code = source.replace(/^import[\s\S]*?;\n/gm, "").replace("void boot();", "return boot();");
    await new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
    await Promise.resolve();
    await run({ nodes, calls, authChanged: (...args) => authChanged(...args), window });
}

test("draft, preview and publish reuse the saved identity and revision", async () => fixture(async ({ nodes, calls }) => {
    const form = nodes["update-form"];
    nodes["update-title"].value = "Hello";
    nodes["update-body"].value = "Readers";
    form.events.input();
    nodes["preview-update"].events.click();
    assert.equal(calls.length, 0);
    assert.equal(nodes["preview-panel"].hidden, false);
    await form.events.submit({ preventDefault() {}, submitter: { value: "draft" } });
    assert.equal(nodes["save-status"].textContent, "Draft saved. Only you can see it.");
    assert.equal(nodes["update-scope"].disabled, true);
    await form.events.submit({ preventDefault() {}, submitter: { value: "publish" } });
    assert.equal(calls[0].input.id, "stable-new-id");
    assert.equal(calls[1].input.id, "stable-new-id");
    assert.equal(calls[1].input.updatedAt, "server-revision");
    assert.equal(nodes["published-link"].href, "/updates?post=stable-new-id");
    assert.equal(nodes["publish-update"].hidden, true);
    assert.equal(nodes["save-update"].textContent, "Save changes");
}));

test("failed saves preserve the text, show the error and re-enable the form", async () => fixture(async ({ nodes }) => {
    nodes["update-title"].value = "Keep this";
    nodes["update-body"].value = "My unsaved words";
    await nodes["update-form"].events.submit({ preventDefault() {}, submitter: { value: "draft" } });
    assert.equal(nodes["update-body"].value, "My unsaved words");
    assert.equal(nodes["save-status"].textContent, "Connection lost");
    assert.equal(nodes["update-body"].disabled, false);
}, { saveError: "Connection lost" }));

test("opening a saved post without audience permission does not change the current draft identity", async () => fixture(async ({ nodes, calls }) => {
    const forbidden = nodes["saved-updates"].children[0].children[2];
    forbidden.events.click();
    assert.match(nodes["save-status"].textContent, /no longer has permission/);
    nodes["update-title"].value = "My own post";
    nodes["update-body"].value = "Hello";
    await nodes["update-form"].events.submit({ preventDefault() {}, submitter: { value: "draft" } });
    assert.equal(calls[0].input.id, "stable-new-id");
    assert.equal(calls[0].input.scope, "author");
}, { posts: [{ id: "someone-else", scope: "site", status: "draft", title: "Admin post" }] }));

test("switching accounts clears saved content and hides the composer before reloading", async () => fixture(async ({ nodes, calls, authChanged }) => {
    authChanged("SIGNED_OUT", null);
    assert.equal(nodes["publisher"].hidden, true);
    assert.equal(nodes["saved-updates"].children.length, 0);
    assert.ok(calls.includes("reload"));
}));
