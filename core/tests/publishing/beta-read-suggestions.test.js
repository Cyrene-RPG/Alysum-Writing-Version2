import test from "node:test";
import assert from "node:assert/strict";
import { handleBetaGuestAction } from "../../../functions/api/beta-guest-actions.js";
import { isMissingSuggestionsTable, matchSelectedQuote, snapshotPlainText } from "../../../functions/api/beta-quote.js";

const guestToken = "ab".repeat(32);
const read = { id: "beta-1" };
const chapterHtml = "<p>The winter <em>wind</em> was cold.</p><p>Tom &amp; Jerry ran.</p>";
const plain = snapshotPlainText(chapterHtml);

function store({ missingSuggestions = false } = {}) {
    const tables = {
        snippet_beta_guests: [{ id: "guest-1", guest_number: 1, guest_token_hash: "hash", beta_read_id: "beta-1" }],
        snippet_beta_chapters: [{ id: "ch-1", content: chapterHtml, beta_read_id: "beta-1" }],
        snippet_beta_threads: [],
        snippet_beta_comments: [],
        snippet_beta_suggestions: [],
    };
    const queried = [];
    const inserted = [];
    const updated = [];
    function filterRows(table, query) {
        if (missingSuggestions && table === "snippet_beta_suggestions") {
            throw new Error("Beta Read database query failed (HTTP 404, PGRST205).");
        }
        return (tables[table] || []).filter(row => {
            for (const [key, value] of Object.entries(query)) {
                if (key === "select" || key === "order" || key === "limit") continue;
                const raw = String(value);
                if (raw.startsWith("eq.") && String(row[key]) !== raw.slice(3)) return false;
            }
            return true;
        });
    }
    return {
        tables, queried, inserted, updated,
        rows: async (table, query) => { queried.push([table, query]); return filterRows(table, query); },
        insert: async (table, row) => {
            if (missingSuggestions && table === "snippet_beta_suggestions") {
                throw new Error("Beta Read database insert failed (snippet_beta_suggestions, HTTP 404, PGRST205).");
            }
            const saved = { id: table + "-" + (tables[table].length + 1), ...row };
            tables[table].push(saved);
            inserted.push([table, saved]);
            return saved;
        },
        update: async (table, query, patch) => {
            updated.push([table, query, patch]);
            return [];
        },
        sha: async () => "hash",
        random: () => guestToken,
    };
}

async function act(db, action, body) {
    return handleBetaGuestAction({
        action, body: { guestToken, ...body }, read,
        rows: db.rows, insert: db.insert, update: db.update, sha: db.sha, random: db.random,
    });
}

test("snapshot HTML becomes the same plain text the reader can select", () => {
    assert.equal(plain, "The winter wind was cold.Tom & Jerry ran.");
    assert.equal(isMissingSuggestionsTable({ message: "Beta Read database query failed (HTTP 404, PGRST205)." }), true);
    assert.equal(isMissingSuggestionsTable({ message: "Beta Read database query failed (HTTP 500)." }), false);
});

test("quote matching prefers the exact offsets and will not jump to a later copy", () => {
    const twice = "wind and then wind";
    const first = matchSelectedQuote(twice, 0, 4, "wind");
    const second = matchSelectedQuote(twice, 14, 18, "wind");
    assert.deepEqual(first, { quote: "wind", startOffset: 0, endOffset: 4 });
    assert.deepEqual(second, { quote: "wind", startOffset: 14, endOffset: 18 });
    assert.equal(matchSelectedQuote(twice, 0, 4, "cold"), null);
    assert.equal(matchSelectedQuote(plain, 4, 10, "winter wind"), null);
});

test("a suggestion is stored separately and never edits the chapter snapshot", async () => {
    const db = store();
    const start = plain.indexOf("winter wind");
    const result = await act(db, "suggest", {
        chapterId: "ch-1", startOffset: start, endOffset: start + "winter wind".length,
        quote: "winter wind", replacement: "north wind", note: "Stronger image"
    });
    assert.ok(result.suggestionId);
    assert.equal(db.tables.snippet_beta_suggestions.length, 1);
    assert.equal(db.tables.snippet_beta_threads.length, 0);
    assert.equal(db.tables.snippet_beta_comments.length, 0);
    assert.equal(db.tables.snippet_beta_chapters[0].content, chapterHtml);
    assert.equal(db.inserted[0][1].status, "pending");
    assert.equal(db.inserted[0][1].replacement, "north wind");
});

test("empty replacement is a deletion suggestion, identical wording is rejected", async () => {
    const db = store();
    const start = plain.indexOf("cold");
    const deleted = await act(db, "suggest", {
        chapterId: "ch-1", startOffset: start, endOffset: start + 4, quote: "cold", replacement: ""
    });
    assert.ok(deleted.suggestionId);
    await assert.rejects(() => act(db, "suggest", {
        chapterId: "ch-1", startOffset: start, endOffset: start + 4, quote: "cold", replacement: "cold"
    }), /differ from the selected text/);
});

test("comments still work when the suggestions table has not been migrated", async () => {
    const db = store({ missingSuggestions: true });
    const start = plain.indexOf("Jerry");
    const result = await act(db, "comment", {
        chapterId: "ch-1", startOffset: start, endOffset: start + 5, quote: "Jerry", message: "Keep this joke."
    });
    assert.ok(result.threadId);
    assert.ok(result.commentId);
    assert.equal(db.queried.some(entry => entry[0] === "snippet_beta_suggestions"), false);
    assert.equal(db.tables.snippet_beta_comments[0].body, "Keep this joke.");
    await assert.rejects(() => act(db, "suggest", {
        chapterId: "ch-1", startOffset: start, endOffset: start + 5, quote: "Jerry", replacement: "Jeff"
    }), /not available yet/);
});

test("suggestions require a guest identity and a passage that exists in the snapshot", async () => {
    const db = store();
    await assert.rejects(() => handleBetaGuestAction({
        action: "suggest", body: { chapterId: "ch-1", quote: "winter wind", replacement: "north wind" },
        read, rows: db.rows, insert: db.insert, update: db.update, sha: db.sha, random: db.random,
    }), /Guest identity required/);
    await assert.rejects(() => act(db, "suggest", {
        chapterId: "ch-1", startOffset: 0, endOffset: 4, quote: "xxxx", replacement: "yyyy"
    }), /could not be matched/);
});
