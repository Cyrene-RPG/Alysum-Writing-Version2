import test from "node:test";
import assert from "node:assert/strict";
import { accountHasArtist, homeUrlForUserData } from "../../account/mode.js";

test("all, writer_artist, and artist accounts include Artist", () => {
    assert.equal(accountHasArtist("all"), true);
    assert.equal(accountHasArtist("writer_artist"), true);
    assert.equal(accountHasArtist("artist"), true);
    assert.equal(accountHasArtist("both"), false);
    assert.equal(accountHasArtist("author"), false);
});

test("an artist-only account opens the artist hub", () => {
    assert.equal(homeUrlForUserData({ accountType: "artist" }), "/artist");
});
