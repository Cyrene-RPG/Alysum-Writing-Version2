import { normalizeCharacterFromRow } from "./normalize.js";
import {
    artworkListing,
    characterListing,
    commissionListing,
    gallerySchemaMissing,
    normalizeCommissionText,
    rethrowGallery,
    requireCheckoutUrl,
    requireCommissionSlots,
} from "./offers.js";
import { publicCharacterUrl } from "./public-profile.js";

const SHOP_COLUMNS = "commission_open, commission_summary, commission_prices, commission_url, commission_slots";

function mapShop(row) {
    if (!row) {
        return {
            commissionOpen: false,
            commissionSummary: "",
            commissionPrices: "",
            commissionUrl: "",
            commissionSlots: null,
        };
    }
    return {
        commissionOpen: Boolean(row.commission_open),
        commissionSummary: row.commission_summary || "",
        commissionPrices: row.commission_prices || "",
        commissionUrl: row.commission_url || "",
        commissionSlots: row.commission_slots ?? null,
    };
}

function asArtwork(row) {
    return {
        id: row.id,
        characterId: row.character_id || null,
        visibility: row.visibility,
        protectionDeclared: row.protection_declared || null,
        offerKind: row.offer_kind || "none",
        offerStatus: row.offer_status || "available",
        priceLabel: row.price_label || "",
        checkoutUrl: row.checkout_url || "",
        publicUrl: row.public_url || "",
        caption: row.caption || "",
    };
}

export async function fetchCommissionSettings(supabase, userId) {
    const id = String(userId || "").trim();
    if (!supabase || !id) return { ...mapShop(null), ready: false };
    const { data, error } = await supabase.from("users").select(SHOP_COLUMNS).eq("id", id).maybeSingle();
    if (error) {
        if (gallerySchemaMissing(error)) return { ...mapShop(null), ready: false };
        throw error;
    }
    return { ...mapShop(data), ready: true };
}

export async function saveCommissionSettings(supabase, userId, input) {
    const id = String(userId || "").trim();
    if (!supabase || !id) throw new Error("Sign in to update your gallery.");
    const row = {
        commission_open: Boolean(input.commissionOpen),
        commission_summary: normalizeCommissionText(input.commissionSummary, 2000),
        commission_prices: normalizeCommissionText(input.commissionPrices, 500),
        commission_url: requireCheckoutUrl(input.commissionUrl),
        commission_slots: requireCommissionSlots(input.commissionSlots),
    };
    const { error } = await supabase.from("users").update(row).eq("id", id);
    if (error) rethrowGallery(error);
}

function emptyGallery() {
    return { commission: null, adopt: [], buy: [], ready: false };
}

export async function loadPublicGallery(supabase, user) {
    const ownerId = String(user?.id || "").trim();
    if (!supabase || !ownerId) return emptyGallery();
    const shop = await fetchCommissionSettings(supabase, ownerId);

    const pages = await supabase
        .from("artist_characters")
        .select("id, slug")
        .eq("owner_id", ownerId)
        .eq("visibility", "public");
    if (pages.error) throw pages.error;
    const slugById = new Map((pages.data || []).map((row) => [row.id, row.slug]));

    const offered = await supabase
        .from("artist_characters")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("visibility", "public")
        .in("offer_kind", ["adopt", "buy"])
        .neq("offer_status", "closed")
        .order("updated_at", { ascending: false });
    if (offered.error) {
        if (gallerySchemaMissing(offered.error)) return emptyGallery();
        throw offered.error;
    }

    const arts = await supabase
        .from("artist_artworks")
        .select("id, character_id, caption, public_url, visibility, protection_declared, offer_kind, offer_status, price_label, checkout_url")
        .eq("owner_id", ownerId)
        .eq("visibility", "public")
        .eq("offer_kind", "buy")
        .neq("offer_status", "closed")
        .order("created_at", { ascending: false });
    if (arts.error) {
        if (gallerySchemaMissing(arts.error)) return emptyGallery();
        throw arts.error;
    }

    const adopt = [];
    const buy = [];
    for (const row of offered.data || []) {
        const character = normalizeCharacterFromRow(row);
        const listing = characterListing(character);
        if (!listing) continue;
        listing.href = publicCharacterUrl(user.username, character.slug);
        if (listing.type === "adopt") adopt.push(listing);
        else buy.push(listing);
    }
    for (const row of arts.data || []) {
        const art = asArtwork(row);
        const listing = artworkListing(art);
        if (!listing) continue;
        const slug = slugById.get(art.characterId);
        if (slug) listing.href = publicCharacterUrl(user.username, slug);
        buy.push(listing);
    }
    return {
        commission: commissionListing(shop),
        adopt,
        buy,
        ready: shop.ready,
    };
}
