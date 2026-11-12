import test from "node:test";
import assert from "node:assert/strict";
import {
    artworkListing,
    characterListing,
    commissionListing,
    normalizeCheckoutUrl,
    normalizeOfferKind,
    requireCheckoutUrl,
    requireCommissionSlots,
} from "../../artist/offers.js";

test("checkout links stay on http(s) pages", () => {
    assert.equal(normalizeCheckoutUrl(""), "");
    assert.equal(normalizeCheckoutUrl("javascript:alert(1)"), "");
    assert.equal(normalizeCheckoutUrl("https://user:pass@ko-fi.com/a"), "");
    assert.equal(normalizeCheckoutUrl("https://ko-fi.com/artist"), "https://ko-fi.com/artist");
    assert.throws(() => requireCheckoutUrl("not a url"), /https/);
    assert.equal(requireCheckoutUrl(""), "");
});

test("commission slots are a small whole number or blank", () => {
    assert.equal(requireCommissionSlots(""), null);
    assert.equal(requireCommissionSlots("3"), 3);
    assert.throws(() => requireCommissionSlots("1.5"), /0 to 99/);
    assert.throws(() => requireCommissionSlots("100"), /0 to 99/);
});

test("a public adoptable is listed without exposing an unprotected portrait", () => {
    const listed = characterListing({
        id: "chr_1",
        visibility: "public",
        offerKind: "adopt",
        offerStatus: "available",
        displayName: "Moth",
        summary: "Open adopt",
        priceLabel: "40 USD",
        checkoutUrl: "https://ko-fi.com/s/moth",
        portraitUrl: "https://cdn.example/raw.png",
        fields: {},
        termsText: "No resale",
    });
    assert.equal(listed.type, "adopt");
    assert.equal(listed.imageUrl, "");
    assert.equal(listed.priceLabel, "40 USD");
    assert.equal(characterListing({ ...listed, visibility: "private", offerKind: "adopt", fields: {} }), null);
    assert.equal(characterListing({
        visibility: "public",
        offerKind: "adopt",
        offerStatus: "closed",
        displayName: "Taken",
        fields: { portraitProtection: "both" },
    }), null);
});

test("sale pieces require a protected public file", () => {
    assert.equal(artworkListing({
        visibility: "public",
        offerKind: "buy",
        offerStatus: "available",
        protectionDeclared: null,
        publicUrl: "https://cdn.example/a.png",
    }), null);
    assert.equal(normalizeOfferKind("adopt", { allowAdopt: false }), "none");
    const piece = artworkListing({
        id: "art_1",
        visibility: "public",
        offerKind: "buy",
        offerStatus: "pending",
        protectionDeclared: "glaze",
        publicUrl: "https://cdn.example/a.png",
        caption: "Bust",
        priceLabel: "25 USD",
        checkoutUrl: "https://vgen.co/artist",
    });
    assert.equal(piece.status, "pending");
    assert.equal(piece.imageUrl, "https://cdn.example/a.png");
    assert.equal(piece.checkoutUrl, "https://vgen.co/artist");
});

test("commissions hide when closed and stop requests when slots are zero", () => {
    assert.equal(commissionListing({ commissionOpen: false }), null);
    const open = commissionListing({
        commissionOpen: true,
        commissionSummary: "Busts and full bodies",
        commissionPrices: "from 20 USD",
        commissionUrl: "https://ko-fi.com/artist/commissions",
        commissionSlots: 2,
    });
    assert.equal(open.accepting, true);
    assert.equal(open.checkoutUrl, "https://ko-fi.com/artist/commissions");
    const full = commissionListing({ commissionOpen: true, commissionSlots: 0, commissionUrl: "javascript:alert(1)" });
    assert.equal(full.accepting, false);
    assert.equal(full.checkoutUrl, "");
});
