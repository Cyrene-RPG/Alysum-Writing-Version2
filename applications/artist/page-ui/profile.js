import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { listPublicCharacters } from "@alysum/artist/character-store.js";
import { findUserByHandle, findUserById, publicCharacterUrl, publicGalleryUrl } from "@alysum/artist/public-profile.js";
import { loadPublicGallery } from "@alysum/artist/shop.js";
import { portraitIsProtected } from "@alysum/artist/offers.js";
import { paintOfferGrid } from "./offer-cards.js";
import { paintWelcomePfp, useOwnerNav } from "./pfp.js";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status");

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

function paint(user, characters, gallery, mine) {
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
    profileLink.href = profileUrl;
    const galleryUrl = publicGalleryUrl(user.username);
    document.querySelectorAll("[data-artist-shop]").forEach((link) => {
        link.href = galleryUrl;
    });
    useOwnerNav(mine);
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
    const [characters, gallery, mineId] = await Promise.all([
        listPublicCharacters(supabase, user.id),
        loadPublicGallery(supabase, user).catch(() => null),
        signedInId(),
    ]);
    paint(user, characters, gallery, Boolean(mineId) && mineId === user.id);
}

void boot().catch((error) => { status.textContent = error.message || "Could not load this page."; });
