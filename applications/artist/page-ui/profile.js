import { supabase } from "/core/authentication/client.js";
import { listPublicCharacters } from "@alysum/artist/character-store.js";
import { findUserByHandle, findUserById, publicCharacterUrl } from "@alysum/artist/public-profile.js";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status");

function paint(user, characters) {
    document.title = `${user.displayName} — Alysum`;
    document.getElementById("name").textContent = user.displayName;
    document.getElementById("handle").textContent = user.username ? `@${user.username}` : "";
    document.getElementById("bio").textContent = user.artistBio || "";
    const avatar = document.getElementById("avatar");
    avatar.replaceChildren();
    if (user.imageUrl) {
        const img = document.createElement("img");
        img.src = user.imageUrl;
        img.alt = "";
        avatar.append(img);
    } else {
        avatar.textContent = user.displayName.trim().charAt(0).toUpperCase() || "A";
    }
    const shelf = document.getElementById("shelf");
    shelf.replaceChildren();
    for (const character of characters) {
        const link = document.createElement("a");
        link.className = "artist-card" + (character.portraitUrl ? " has-art" : "");
        link.href = publicCharacterUrl(user.username, character.slug);
        if (character.portraitUrl) {
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
        empty.className = "artist-status";
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
    const characters = await listPublicCharacters(supabase, user.id);
    paint(user, characters);
}

void boot().catch((error) => { status.textContent = error.message || "Could not load this page."; });
