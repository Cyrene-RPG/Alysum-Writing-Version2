/** Public-gallery offers. Payment is always off Alysum. */

const OFFER_KINDS = new Set(["none", "adopt", "buy"]);
const ARTWORK_KINDS = new Set(["none", "buy"]);
const OFFER_STATUSES = new Set(["available", "pending", "closed"]);
const PROTECTION = new Set(["glaze", "nightshade", "both"]);

export function gallerySchemaMissing(error) {
    const message = String(error?.message || "");
    return /offer_kind|offer_status|price_label|checkout_url|commission_open|commission_summary|commission_prices|commission_url|commission_slots/i.test(message)
        && /does not exist|schema cache|could not find/i.test(message);
}

export function rethrowGallery(error) {
    if (gallerySchemaMissing(error)) {
        throw new Error("Could not save that yet.");
    }
    throw error;
}

export function normalizeOfferKind(raw, { allowAdopt = true } = {}) {
    const value = String(raw ?? "").trim().toLowerCase();
    const allowed = allowAdopt ? OFFER_KINDS : ARTWORK_KINDS;
    return allowed.has(value) ? value : "none";
}

export function normalizeOfferStatus(raw) {
    const value = String(raw ?? "").trim().toLowerCase();
    return OFFER_STATUSES.has(value) ? value : "available";
}

export function normalizePriceLabel(raw) {
    return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function normalizeCheckoutUrl(raw) {
    const text = String(raw ?? "").trim().slice(0, 500);
    if (!text) return "";
    let url;
    try {
        url = new URL(text);
    } catch {
        return "";
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.toString();
}

export function requireCheckoutUrl(raw) {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    const safe = normalizeCheckoutUrl(text);
    if (!safe) {
        throw new Error("Use an http or https link to Ko-fi, VGen, or your own page. Alysum does not take payment.");
    }
    return safe;
}

export function normalizeCommissionText(raw, max) {
    return String(raw ?? "").trim().slice(0, max);
}

export function readCommissionSlots(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 99) return null;
    return value;
}

export function requireCommissionSlots(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const value = Number(String(raw).trim());
    if (!Number.isInteger(value) || value < 0 || value > 99) {
        throw new Error("Open slots must be a whole number from 0 to 99, or left blank.");
    }
    return value;
}

export function portraitIsProtected(character) {
    return PROTECTION.has(String(character?.fields?.portraitProtection || ""));
}

export function characterListing(character) {
    if (!character || character.visibility !== "public") return null;
    const type = normalizeOfferKind(character.offerKind);
    if (type === "none") return null;
    const status = normalizeOfferStatus(character.offerStatus);
    if (status === "closed") return null;
    return {
        type,
        id: character.id,
        title: character.displayName || "Character",
        summary: character.summary || "",
        priceLabel: normalizePriceLabel(character.priceLabel),
        checkoutUrl: normalizeCheckoutUrl(character.checkoutUrl),
        status,
        imageUrl: character.portraitUrl && portraitIsProtected(character) ? character.portraitUrl : "",
        terms: character.termsText || "",
    };
}

export function artworkListing(art) {
    if (!art || art.visibility !== "public") return null;
    if (normalizeOfferKind(art.offerKind, { allowAdopt: false }) !== "buy") return null;
    if (!PROTECTION.has(String(art.protectionDeclared || ""))) return null;
    const status = normalizeOfferStatus(art.offerStatus);
    if (status === "closed") return null;
    if (!art.publicUrl) return null;
    return {
        type: "buy",
        id: art.id,
        title: art.caption || "Piece",
        summary: "",
        priceLabel: normalizePriceLabel(art.priceLabel),
        checkoutUrl: normalizeCheckoutUrl(art.checkoutUrl),
        status,
        imageUrl: art.publicUrl,
        terms: "",
    };
}

export function commissionListing(shop) {
    if (!shop?.commissionOpen) return null;
    const slots = readCommissionSlots(shop.commissionSlots);
    return {
        summary: normalizeCommissionText(shop.commissionSummary, 2000),
        prices: normalizeCommissionText(shop.commissionPrices, 500),
        slots,
        checkoutUrl: normalizeCheckoutUrl(shop.commissionUrl),
        accepting: slots !== 0,
    };
}

export function offerActionLabel(type) {
    if (type === "adopt") return "Adopt";
    if (type === "buy") return "Buy";
    return "Request a commission";
}

export function offerPatch(input, { allowAdopt = true } = {}) {
    const patch = {};
    if (input.offerKind != null) patch.offer_kind = normalizeOfferKind(input.offerKind, { allowAdopt });
    if (input.offerStatus != null) patch.offer_status = normalizeOfferStatus(input.offerStatus);
    if (input.priceLabel != null) patch.price_label = normalizePriceLabel(input.priceLabel);
    if (input.checkoutUrl != null) patch.checkout_url = requireCheckoutUrl(input.checkoutUrl);
    return patch;
}
