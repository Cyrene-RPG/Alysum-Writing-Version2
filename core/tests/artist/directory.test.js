import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenArtistList } from "../../artist/directory.js";

test("open artists are people with commissions or public adoptables", () => {
    const list = buildOpenArtistList(
        [
            { id: "a", username: "moth", display_name: "Moth", commission_open: true, artist_bio: "Busts" },
            { id: "b", username: "fern", display_name: "Fern", commission_open: false },
            { id: "c", username: "quiet", display_name: "Quiet", commission_open: false },
            { id: "d", username: "", display_name: "No handle", commission_open: true },
        ],
        ["b", "b", "missing"],
    );
    assert.deepEqual(list.map((entry) => entry.username), ["fern", "moth"]);
    assert.equal(list[0].adoptableCount, 2);
    assert.equal(list[0].commissionsOpen, false);
    assert.equal(list[1].commissionsOpen, true);
    assert.equal(list[1].bio, "Busts");
});
