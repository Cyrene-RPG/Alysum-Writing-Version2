import test from "node:test";
import assert from "node:assert/strict";
import {authorProfileUrl} from "../../library/author-links.js";
import {authorNameHtml} from "../../../site-appearance/js-runtime/author-link.js";
import { readFile } from "node:fs/promises";

class Element {
    constructor() {
        this.events = {};
        this.hidden = true;
        this.disabled = false;
        this.textContent = "";
        this.classList = { toggle() {} };
    }
    addEventListener(event, callback) { this.events[event] = callback; }
}

class Root {
    set innerHTML(value) {
        this.html = value;
        this.button = new Element();
        this.hint = new Element();
        this.count = new Element();
        this.label = new Element();
        this.metric = { querySelector: selector => selector === ".reader-author-num" ? this.count : this.label };
        this.button.textContent = value.match(/id="readerFollowBtn">([^<]*)/)?.[1] || "";
    }
    querySelector(selector) {
        return {
            "#readerFollowBtn": this.button,
            "#readerFollowHint": this.hint,
            "#reader-follower-metric": this.metric,
        }[selector] || null;
    }
}

const card = () => ({
    ownerId: "author", displayName: "Writer", following: false, followers: 0,
    fictionCount: 1, level: 0,
});
const options = {
    work: { ownerUserId: "author", author: "Writer" },
    supabase: {},
    session: { mode: "cloud", user: { id: "reader" } },
};

async function fixture(fetchCard, setFollow, run) {
    const source = await readFile(new URL("../../../applications/library/page-ui/reader-author.js", import.meta.url), "utf8");
    const stubs = { authorProfileUrl, authorNameHtml, mountReaderTips() {}, fetchReaderAuthorCard: fetchCard, setFollowing: setFollow, authorInitial: () => "W" };
    // Inject only the four dependencies; execute the actual event handlers.
    globalThis.readerAuthorTestDependencies = stubs;
    const injected = source.replace(/^import .*;\n/gm, "")
        + "\n//# sourceURL=reader-author-fixture.js";
    const module = await import("data:text/javascript;base64," + Buffer.from(
        "const { authorProfileUrl, authorNameHtml, mountReaderTips, fetchReaderAuthorCard, setFollowing, authorInitial } = globalThis.readerAuthorTestDependencies;\n" + injected
    ).toString("base64") + "#" + Math.random());
    try { await run(module.mountReaderAuthor, new Root()); }
    finally { delete globalThis.readerAuthorTestDependencies; }
}

test("follow and unfollow update the confirmed button and follower count without remounting", async () => {
    let reads = 0;
    const changes = [];
    await fixture(async () => { reads++; return card(); }, async (client, args) => {
        changes.push(args);
        return { following: args.follow, count: args.follow ? 1 : 0 };
    }, async (mount, root) => {
        await mount(root, options);
        await root.button.events.click();
        assert.equal(root.button.textContent, "Following");
        assert.equal(root.count.textContent, "1");
        assert.equal(root.label.textContent, "Follower");
        assert.equal(root.button.disabled, false);
        await root.button.events.click();
        assert.equal(root.button.textContent, "Follow");
        assert.equal(root.count.textContent, "0");
        assert.equal(reads, 1);
        assert.deepEqual(changes.map(change => change.follow), [true, false]);
    });
});

test("unknown initial status shows a retry and retries the read before any mutation", async () => {
    let reads = 0;
    let writes = 0;
    await fixture(async () => {
        if (++reads === 1) throw new Error("Following unavailable");
        return { ...card(), following: true, followers: 4 };
    }, async () => { writes++; }, async (mount, root) => {
        await mount(root, options);
        assert.equal(root.button.textContent, "Retry follow status");
        assert.match(root.html, /Following unavailable/);
        assert.match(root.html, /reader-author-num">—/);
        await root.button.events.click();
        assert.equal(root.button.textContent, "Following");
        assert.equal(reads, 2);
        assert.equal(writes, 0);
    });
});

test("an uncertain save requires a status refresh before a second write", async () => {
    let reads = 0;
    let writes = 0;
    await fixture(async () => {
        reads++;
        return { ...card(), following: reads > 1 };
    }, async () => { writes++; throw new Error("Connection lost"); }, async (mount, root) => {
        await mount(root, options);
        await root.button.events.click();
        assert.equal(root.hint.hidden, false);
        assert.equal(root.hint.textContent, "Connection lost");
        assert.equal(root.button.disabled, false);
        assert.equal(root.button.textContent, "Retry follow status");
        await root.button.events.click();
        assert.equal(root.button.textContent, "Following");
        assert.equal(writes, 1);
    });
});

test("signed-out readers receive a sign-in prompt without a follow write", async () => {
    await fixture(async () => card(), async () => assert.fail("must not write"), async (mount, root) => {
        await mount(root, { ...options, session: { mode: "guest" } });
        await root.button.events.click();
        assert.equal(root.hint.textContent, "Sign in to follow this author.");
        assert.equal(root.hint.hidden, false);
    });
});
