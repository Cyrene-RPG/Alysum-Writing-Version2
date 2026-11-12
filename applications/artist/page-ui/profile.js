import { supabase } from "/core/authentication/client.js";
import { listPublicCharacters } from "@alysum/artist/character-store.js";
import { findUserByHandle, findUserById, publicCharacterUrl, publicGalleryUrl } from "@alysum/artist/public-profile.js";
import { loadPublicGallery } from "@alysum/artist/shop.js";
import { portraitIsProtected } from "@alysum/artist/offers.js";
import { paintOfferGrid } from "./offer-cards.js";
import { paintWelcomePfp } from "./pfp.js";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status");

function paint(user, characters, gallery) {
    document.title = `${user.displayName} — Alysum`;
    document.getElementById("name").textContent = user.displayName;
    document.getElementById("handle").textContent = user.username ? `@${user.username}` : "";
    const bio = document.getElementById("bio");
    bio.hidden = !user.artistBio;
    bio.textContent = user.artistBio || "";
    paintWelcomePfp(user.imageUrl, user.displayName);
    const profileUrl = `/artist-profile?u=${encodeURIComponent(user.username || "")}`;
    document.getElementById("artist-pfp-link").href = profileUrl;
    const profileLink = document.getElementById("profile-link");
    const shopLink = document.getElementById("shop-link");
    profileLink.href = profileUrl;
    shopLink.href = publicGalleryUrl(user.username);
    const preview = [...(gallery?.adopt || []), ...(gallery?.buy || [])].slice(0, 4);
    const listed = document.getElementById("listed");
    listed.hidden = preview.length === 0;
    paintOfferGrid(document.getElementById("shop"), preview);
    const shelf = document.getElementById("shelf");
    shelf.replaceChildren();
    for (const character of characters) {
        const link = document.createElement("a");
        const showArt = Boolean(character.portraitUrl) && portraitIsProtected(character);
        link.className = "artist-card" + (showArt ? " has-art" : "");
        link.href = publicCharacterUrl(user.username, character.slug);
        if (showArt) {
            const img = document.createElement("img");
            img.src = character.portraitUrl;
            img.alt = "";
            link.append(img);
        }
        const title = document.createElement("h2");
        title.textContent = character.displayName;
        const meta = document.createElement("p");
        meta.textContent = character.summary || character.kind;
        link.append(title, meta);
        shelf.append(link);
    }
    if (!characters.length) {
        const empty = document.createElement("p");
        empty.className = "artist-empty-card";
        empty.textContent = "No public characters yet.";
        shelf.append(empty);
    }
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
    const [characters, gallery] = await Promise.all([
        listPublicCharacters(supabase, user.id),
        loadPublicGallery(supabase, user).catch(() => null),
    ]);
    paint(user, characters, gallery);
}

void boot().catch((error) => { status.textContent = error.message || "Could not load this page."; });
