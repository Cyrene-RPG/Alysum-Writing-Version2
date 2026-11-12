import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArtistFocus, normalizeCharacterFromRow } from "../../artist/normalize.js";

test("normalizeArtistFocus accepts known values", () => {
    assert.equal(normalizeArtistFocus("oc_adoptables"), "oc_adoptables");
    assert.equal(normalizeArtistFocus("both"), "both");
    assert.equal(normalizeArtistFocus("nope"), null);
});

test("normalizeCharacterFromRow maps snake_case", () => {
    const row = {
        owner_id: "u1",
        id: "chr_x",
        slug: "alpha",
        display_name: "Alpha",
        kind: "oc",
        creator_id: "u1",
        trade_policy: "none",
        terms_text: "",
        visibility: "private",
        fields: {},
        folder_id: null,
        sort_key: 0,
        provenance_verified_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
    const out = normalizeCharacterFromRow(row);
    assert.equal(out.displayName, "Alpha");
    assert.equal(out.tradePolicy, "none");
});
