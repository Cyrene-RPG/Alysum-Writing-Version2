import test from "node:test";
import assert from "node:assert/strict";
import { listBetaReadChapters, prepareBetaReadSnapshot, betaReadCopyrightNotice } from "../../../applications/editor/page-ui/beta-read-snapshot.js";

const book = {
    id: "book-123",
    title: "Sample",
    sections: { body: [
        { kind: "chapter", id: "a", title: "One", content: "<p>First</p>", notes: ["secret"] },
        { kind: "folder", id: "folder", children: [
            { kind: "chapter", id: "b", title: "Two", content: "<p>Second</p>" },
        ] },
        { kind: "chapter", id: "c", title: "Empty", content: "" },
    ] },
};
test("eligible chapters exclude empty chapters and include nested chapters", () => {
    assert.deepEqual(listBetaReadChapters(book).map(ch => ch.id), ["a", "b"]);
});
test("snapshot includes only selected chapters and never notes", () => {
    const snapshot = prepareBetaReadSnapshot(book, ["b"], "MoonlightWriter");
    assert.equal(snapshot.authorUsername, "MoonlightWriter");
    assert.deepEqual(snapshot.chapters.map(ch => ch.sourceChapterId), ["b"]);
    assert.equal(JSON.stringify(snapshot).includes("secret"), false);
    assert.equal(snapshot.chapters[0].content, "<p>Second</p>");
});
test("snapshot uses manuscript chapter order regardless of checkbox order", () => {
    assert.deepEqual(prepareBetaReadSnapshot(book, ["b", "a"], "Writer").chapters.map(ch => ch.sourceChapterId), ["a", "b"]);
});
test("invalid chapter selection is rejected", () => {
    for (const ids of [[], ["a", "a"], ["unknown"], ["c"]]) {
        assert.throws(() => prepareBetaReadSnapshot(book, ids, "Writer"));
    }
});
test("copyright text uses link owner, not a hardcoded author", () => {
    const notice = betaReadCopyrightNotice("MoonlightWriter");
    assert.match(notice.introduction, /MoonlightWriter/);
    assert.doesNotMatch(notice.introduction, /TravelingSheep/);
    assert.equal(notice.restrictions.length, 5);
});
