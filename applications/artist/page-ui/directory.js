import { supabase } from "/core/authentication/client.js";
import { loadOpenArtists } from "@alysum/artist/directory.js";
import { publicGalleryUrl } from "@alysum/artist/public-profile.js";

const status = document.getElementById("status");
const list = document.getElementById("artists");

function badge(text) {
    const span = document.createElement("span");
    span.className = "artist-pill";
    span.textContent = text;
    return span;
}

function card(artist) {
    const link = document.createElement("a");
    link.className = "artist-directory-card";
    link.href = publicGalleryUrl(artist.username);
    const face = document.createElement("span");
    face.className = "artist-directory-face";
    if (artist.imageUrl) {
        const img = document.createElement("img");
        img.src = artist.imageUrl;
        img.alt = "";
        face.append(img);
    } else {
        face.textContent = artist.displayName.charAt(0).toUpperCase() || "A";
    }
    const copy = document.createElement("span");
    copy.className = "artist-directory-copy";
    const title = document.createElement("strong");
    title.textContent = artist.displayName;
    const handle = document.createElement("span");
    handle.className = "artist-directory-handle";
    handle.textContent = `@${artist.username}`;
    const pills = document.createElement("span");
    pills.className = "artist-directory-pills";
    if (artist.commissionsOpen) pills.append(badge("Commissions open"));
    if (artist.adoptableCount > 0) {
        const count = artist.adoptableCount;
        pills.append(badge(`${count} ${count === 1 ? "adoptable" : "adoptables"}`));
    }
    copy.append(title, handle, pills);
    if (artist.bio) {
        const bio = document.createElement("span");
        bio.className = "artist-directory-bio";
        bio.textContent = artist.bio.length > 160 ? `${artist.bio.slice(0, 157)}…` : artist.bio;
        copy.append(bio);
    }
    link.append(face, copy);
    return link;
}

async function boot() {
    const artists = await loadOpenArtists(supabase);
    list.replaceChildren();
    if (!artists.length) {
        status.textContent = "No artists have opened commissions or listed adoptables yet.";
        return;
    }
    status.hidden = true;
    for (const artist of artists) list.append(card(artist));
}

void boot().catch((error) => {
    status.textContent = error.message || "Could not load artists.";
});
