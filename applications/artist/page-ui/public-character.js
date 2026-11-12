import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { listPublicArtworks } from "@alysum/artist/artwork-store.js";
import { findUserByHandle, getPublicCharacter, publicArtistUrl, publicGalleryUrl } from "@alysum/artist/public-profile.js";
import { TRADE_POLICIES } from "@alysum/artist/constants.js";
import { characterListing, offerActionLabel } from "@alysum/artist/offers.js";
import { paintWelcomePfp, useOwnerNav } from "./pfp.js";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status");

function section(label, text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return `${label}\n${value}\n\n`;
}

async function boot() {
    const user = await findUserByHandle(supabase, params.get("u") || "");
    const slug = params.get("slug") || "";
    if (!user || !slug) {
        status.textContent = "Character not found.";
        return;
    }
    const character = await getPublicCharacter(supabase, user.id, slug);
    if (!character) {
        status.textContent = "This character is private or does not exist.";
        return;
    }
    document.title = `${character.displayName} — Alysum`;
    document.getElementById("name").textContent = character.displayName;
    const owner = document.getElementById("owner");
    const link = document.createElement("a");
    link.href = publicArtistUrl(user.username);
    link.textContent = user.displayName;
    owner.replaceChildren(link);
    const profileUrl = publicArtistUrl(user.username);
    const galleryUrl = publicGalleryUrl(user.username);
    document.getElementById("profile-link").href = profileUrl;
    document.getElementById("gallery-link").href = galleryUrl;
    document.getElementById("owner-gallery-link").href = galleryUrl;
    document.getElementById("artist-pfp-link").href = profileUrl;
    paintWelcomePfp(user.imageUrl, user.displayName);
    resolveStudioSession(supabase).then((session) => {
        useOwnerNav(session?.user?.id === user.id);
    }).catch(() => {});
    document.getElementById("summary").textContent = character.summary || "";
    const fields = character.fields || {};
    document.getElementById("body").textContent =
        section("Overview", fields.overview) +
        section("Design", fields.design) +
        section("Personality", fields.personality) +
        section("History", fields.history) +
        (character.termsText ? `Terms\n${character.termsText}` : "");
    const policy = TRADE_POLICIES.find((item) => item.id === character.tradePolicy);
    document.getElementById("trade").textContent = policy ? policy.label : "";
    const offer = document.getElementById("offer");
    offer.replaceChildren();
    const listing = characterListing(character);
    if (listing) {
        const line = document.createElement("p");
        line.className = "artist-status";
        const bits = [offerActionLabel(listing.type)];
        if (listing.priceLabel) bits.push(listing.priceLabel);
        bits.push(listing.status === "pending" ? "On hold" : "Available");
        line.textContent = bits.join(" · ");
        offer.append(line);
        if (listing.status === "available" && listing.checkoutUrl) {
            const action = document.createElement("a");
            action.className = "artist-primary";
            action.href = listing.checkoutUrl;
            action.target = "_blank";
            action.rel = "noopener noreferrer";
            action.referrerPolicy = "no-referrer";
            action.textContent = offerActionLabel(listing.type);
            offer.append(action);
            const note = document.createElement("p");
            note.className = "artist-status";
            note.textContent = "Payment is completed on the artist’s page. Alysum does not take money.";
            offer.append(note);
        }
    }
    const portrait = document.getElementById("portrait");
    if (character.portraitUrl && character.fields?.portraitProtection) {
        const img = document.createElement("img");
        img.src = character.portraitUrl;
        img.alt = "";
        portrait.append(img);
    }
    const artworks = await listPublicArtworks(supabase, user.id, character.id);
    const grid = document.getElementById("grid");
    for (const art of artworks) {
        if (!art.publicUrl) continue;
        const figure = document.createElement("figure");
        figure.className = "artist-shot";
        const img = document.createElement("img");
        img.src = art.publicUrl;
        img.alt = art.caption || character.displayName;
        figure.append(img);
        grid.append(figure);
    }
    document.getElementById("sheet").hidden = false;
    status.hidden = true;
}

void boot().catch((error) => { status.textContent = error.message || "Could not load this character."; });
