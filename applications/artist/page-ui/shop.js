import { supabase } from "/core/authentication/client.js";
import { findUserByHandle, findUserById, publicArtistUrl } from "@alysum/artist/public-profile.js";
import { loadPublicGallery } from "@alysum/artist/shop.js";
import { paintOfferGrid } from "./offer-cards.js";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status");

function externalLink(anchor, url) {
    anchor.hidden = !url;
    if (!url) return;
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.referrerPolicy = "no-referrer";
}

function paintCommission(listing) {
    const section = document.getElementById("commission");
    if (!listing) {
        section.hidden = true;
        return;
    }
    section.hidden = false;
    document.getElementById("commission-summary").textContent = listing.summary;
    document.getElementById("commission-prices").textContent = listing.prices;
    const slots = document.getElementById("commission-slots");
    if (listing.slots == null) slots.textContent = "";
    else if (listing.slots === 0) slots.textContent = "Slots are full.";
    else slots.textContent = `${listing.slots} open ${listing.slots === 1 ? "slot" : "slots"}.`;
    const link = document.getElementById("commission-link");
    const waiting = listing.accepting && !listing.checkoutUrl;
    externalLink(link, listing.accepting ? listing.checkoutUrl : "");
    document.getElementById("commission-wait").hidden = !waiting;
}

function paint(user, gallery) {
    document.title = `${user.displayName} — Gallery — Alysum`;
    const back = document.getElementById("back");
    back.href = publicArtistUrl(user.username);
    back.textContent = user.displayName;
    const hasListings = Boolean(gallery.commission) || gallery.adopt.length > 0 || gallery.buy.length > 0;
    document.getElementById("empty").hidden = hasListings;
    document.getElementById("adopt-section").hidden = gallery.adopt.length === 0;
    document.getElementById("buy-section").hidden = gallery.buy.length === 0;
    paintCommission(gallery.commission);
    paintOfferGrid(document.getElementById("adopt"), gallery.adopt);
    paintOfferGrid(document.getElementById("buy"), gallery.buy);
    document.getElementById("sheet").hidden = false;
    status.hidden = true;
}

async function boot() {
    const handle = params.get("u") || "";
    const id = params.get("id") || "";
    const user = handle
        ? await findUserByHandle(supabase, handle)
        : await findUserById(supabase, id);
    if (!user) {
        status.textContent = "Artist not found.";
        return;
    }
    paint(user, await loadPublicGallery(supabase, user));
}

void boot().catch((error) => {
    status.textContent = error.message || "Could not load this gallery.";
});
