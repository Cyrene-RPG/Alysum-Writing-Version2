import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { findUserByHandle, findUserById, publicArtistUrl } from "@alysum/artist/public-profile.js";
import { loadPublicGallery } from "@alysum/artist/shop.js";
import { paintOfferGrid } from "./offer-cards.js";
import { paintWelcomePfp, useOwnerNav } from "./pfp.js";

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

function paint(user, gallery, mine) {
    document.title = `${user.displayName} — Gallery — Alysum`;
    document.getElementById("name").textContent = user.displayName;
    const handle = document.getElementById("handle");
    handle.textContent = user.username ? `@${user.username}` : "";
    paintWelcomePfp(user.imageUrl, user.displayName);
    const back = document.getElementById("back");
    const profileUrl = publicArtistUrl(user.username);
    back.href = profileUrl;
    document.getElementById("artist-pfp-link").href = profileUrl;
    const here = `${location.pathname}${location.search}`;
    document.querySelectorAll("[data-artist-shop]").forEach((link) => {
        link.href = here;
    });
    useOwnerNav(mine);
    const hasListings = Boolean(gallery.commission) || gallery.adopt.length > 0 || gallery.buy.length > 0;
    const empty = document.getElementById("empty");
    empty.hidden = hasListings;
    document.getElementById("empty-copy").textContent = mine
        ? "Open a character and choose Up for adoption or For sale. Commissions turn on from My characters."
        : "This artist has not listed anything for adoption, sale, or commission.";
    document.getElementById("adopt-section").hidden = gallery.adopt.length === 0;
    document.getElementById("buy-section").hidden = gallery.buy.length === 0;
    paintCommission(gallery.commission);
    paintOfferGrid(document.getElementById("adopt"), gallery.adopt);
    paintOfferGrid(document.getElementById("buy"), gallery.buy);
    document.getElementById("sheet").hidden = false;
    status.hidden = true;
}

async function signedInId() {
    try {
        const session = await Promise.race([
            resolveStudioSession(supabase),
            new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
        return session?.user?.id || "";
    } catch {
        return "";
    }
}

async function boot() {
    const handle = params.get("u") || "";
    let id = params.get("id") || "";
    const sessionPromise = signedInId();
    if (!handle && !id) id = await sessionPromise;
    const user = handle
        ? await findUserByHandle(supabase, handle)
        : await findUserById(supabase, id);
    if (!user) {
        status.textContent = handle || id
            ? "Artist not found."
            : "Sign in to open your gallery, or use the link on an artist’s page.";
        return;
    }
    const [gallery, mineId] = await Promise.all([
        loadPublicGallery(supabase, user),
        sessionPromise,
    ]);
    paint(user, gallery, Boolean(mineId) && mineId === user.id);
}

void boot().catch((error) => {
    status.textContent = error.message || "Could not load this gallery.";
});
