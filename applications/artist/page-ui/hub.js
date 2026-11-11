import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { userHasArtistAccess } from "@alysum/artist/access.js";
import { ARTIST_FOCUS_OPTIONS, CHARACTER_KINDS } from "@alysum/artist/constants.js";
import { normalizeArtistFocus } from "@alysum/artist/normalize.js";
import {
    createCharacter,
    fetchArtistHubProfile,
    listMyCharacters,
    saveArtistBio,
    saveArtistFocus,
} from "@alysum/artist/character-store.js";
import { listArtworks } from "@alysum/artist/artwork-store.js";
import { publicArtistUrl } from "@alysum/artist/public-profile.js";

const $ = (id) => document.getElementById(id);

function kindLabel(id) {
    return CHARACTER_KINDS.find((item) => item.id === id)?.label || id;
}

function card(character) {
    const link = document.createElement("a");
    link.className = "artist-card" + (character.portraitUrl ? " has-art" : "");
    link.href = `/artist-character?id=${encodeURIComponent(character.id)}`;
    if (character.portraitUrl) {
        const img = document.createElement("img");
        img.src = character.portraitUrl;
        img.alt = "";
        link.append(img);
    }
    const title = document.createElement("h2");
    title.textContent = character.displayName;
    const meta = document.createElement("p");
    meta.textContent = `${kindLabel(character.kind)} · ${character.visibility}`;
    link.append(title, meta);
    return link;
}

function paintShelf(characters) {
    const shelf = $("artist-shelf");
    shelf.replaceChildren();
    const create = document.createElement("button");
    create.type = "button";
    create.className = "artist-new";
    create.innerHTML = `<span class="artist-plus" aria-hidden="true">+</span><span>New character</span>`;
    create.addEventListener("click", () => $("artist-create").showModal());
    shelf.append(create);
    for (const character of characters) shelf.append(card(character));
    $("artist-count").textContent = String(characters.length);
}

function paintStats(characters, artworks) {
    const stats = $("artist-stats");
    const rows = [
        [characters.length, "Characters"],
        [characters.filter((c) => c.visibility === "public").length, "Public"],
        [artworks.length, "Images"],
    ];
    stats.replaceChildren();
    for (const [num, label] of rows) {
        const cell = document.createElement("div");
        cell.className = "artist-stat";
        const strong = document.createElement("strong");
        strong.textContent = String(num);
        const span = document.createElement("span");
        span.textContent = label;
        cell.append(strong, span);
        stats.append(cell);
    }
}

async function showHub(userId, profile) {
    $("artist-focus").hidden = true;
    $("artist-hub").hidden = false;
    $("artist-gate").hidden = true;
    const focus = ARTIST_FOCUS_OPTIONS.find((item) => item.id === profile.artistFocus);
    $("artist-focus-label").textContent = focus ? focus.title : "Roster";
    $("artist-bio").value = profile.artistBio || "";
    if (profile.username) $("artist-public-link").href = publicArtistUrl(profile.username);
    const [characters, artworks] = await Promise.all([
        listMyCharacters(supabase, userId),
        listArtworks(supabase, userId).catch(() => []),
    ]);
    paintShelf(characters);
    paintStats(characters, artworks);
}

function mountFocus(userId) {
    const grid = $("artist-focus-grid");
    grid.replaceChildren();
    for (const option of ARTIST_FOCUS_OPTIONS) {
        const button = document.createElement("button");
        button.type = "button";
        const title = document.createElement("strong");
        title.textContent = option.title;
        const copy = document.createElement("span");
        copy.textContent = option.description;
        button.append(title, copy);
        button.addEventListener("click", () => {
            $("artist-gate").hidden = false;
            $("artist-gate").textContent = "Saving…";
            void saveArtistFocus(supabase, userId, option.id)
                .then(() => boot())
                .catch((error) => {
                    $("artist-gate").textContent = error.message || "Could not save.";
                });
        });
        grid.append(button);
    }
    $("artist-focus").hidden = false;
    $("artist-hub").hidden = true;
    $("artist-gate").hidden = true;
}

async function boot() {
    const session = await resolveStudioSession(supabase);
    if (session.mode !== "cloud" || !session.user?.id) {
        $("artist-gate").textContent = "Sign in to open Artist.";
        if (session.mode === "none") goToLogin("/artist");
        return;
    }
    const userId = session.user.id;
    let profile;
    try {
        profile = await fetchArtistHubProfile(supabase, userId);
    } catch (error) {
        $("artist-gate").textContent = error.message || "Could not load your artist profile.";
        return;
    }
    if (!userHasArtistAccess(profile.accountType)) {
        $("artist-gate").textContent = "This account does not include Artist. Change it in Settings → Account focus.";
        return;
    }
    if (!profile.artistHubReady || !normalizeArtistFocus(profile.artistFocus)) {
        mountFocus(userId);
        return;
    }
    try {
        await showHub(userId, profile);
    } catch (error) {
        $("artist-gate").hidden = false;
        $("artist-gate").textContent = error.message || "Could not load characters.";
    }
    $("artist-save-bio").onclick = () => {
        $("artist-status").textContent = "Saving bio…";
        void saveArtistBio(supabase, userId, $("artist-bio").value)
            .then(() => { $("artist-status").textContent = "Bio saved."; })
            .catch((error) => { $("artist-status").textContent = error.message || "Could not save bio."; });
    };
    $("artist-create-form").onsubmit = (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        $("artist-status").textContent = "Creating…";
        void createCharacter(supabase, userId, {
            displayName: data.get("name"),
            kind: data.get("kind"),
        }).then((character) => {
            location.href = `/artist-character?id=${encodeURIComponent(character.id)}`;
        }).catch((error) => {
            $("artist-status").textContent = error.message || "Could not create that character.";
        });
    };
}

$("artist-create-cancel").addEventListener("click", () => $("artist-create").close());
void boot();
