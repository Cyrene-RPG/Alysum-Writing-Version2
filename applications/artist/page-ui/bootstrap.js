import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { userHasArtistAccess } from "@alysum/artist/access.js";
import { ARTIST_FOCUS_OPTIONS } from "@alysum/artist/constants.js";
import { normalizeArtistFocus } from "@alysum/artist/normalize.js";
import {
    createCharacter,
    fetchArtistHubProfile,
    listMyCharacters,
    saveArtistFocus,
} from "@alysum/artist/character-store.js";

function el(id) {
    return document.getElementById(id);
}

function focusLabel(focusId) {
    const match = ARTIST_FOCUS_OPTIONS.find((o) => o.id === focusId);
    return match ? match.title : "";
}

function renderCharacters(root, characters) {
    const list = el("artist-character-list");
    list.replaceChildren();
    for (const character of characters) {
        const article = document.createElement("article");
        article.className = "artist-char-card";
        const body = document.createElement("div");
        const title = document.createElement("h2");
        title.textContent = character.displayName;
        const meta = document.createElement("p");
        meta.className = "artist-char-meta";
        meta.textContent = `${character.kind} · ${character.visibility} · @${character.slug}`;
        body.append(title, meta);
        article.append(body);
        list.append(article);
    }
    el("artist-empty").hidden = Boolean(characters.length);
}

function mountFocusPicker(userId, onDone) {
    const grid = el("artist-focus-grid");
    grid.replaceChildren();
    for (const option of ARTIST_FOCUS_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "artist-focus-card";
        btn.innerHTML = `<strong>${option.title}</strong><span>${option.description}</span>`;
        btn.addEventListener("click", () => {
            el("artist-status").textContent = "Saving…";
            void saveArtistFocus(supabase, userId, option.id)
                .then(() => onDone(option.id))
                .catch((error) => {
                    el("artist-status").textContent = error.message || "Could not save. Try again.";
                });
        });
        grid.append(btn);
    }
}

async function bootHub(userId) {
    const profile = await fetchArtistHubProfile(supabase, userId);
    if (!userHasArtistAccess(profile.accountType)) {
        el("artist-no-access").hidden = false;
        el("artist-status").textContent = "";
        return;
    }

    const showOnboarding = !profile.artistHubReady || !normalizeArtistFocus(profile.artistFocus);
    const finishOnboarding = async (focusId) => {
        el("artist-onboarding").hidden = true;
        el("artist-hub").hidden = false;
        el("artist-focus-label").textContent = focusId ? `Focus: ${focusLabel(focusId)}` : "";
        await refreshCharacters(userId);
    };

    if (showOnboarding) {
        el("artist-onboarding").hidden = false;
        el("artist-hub").hidden = true;
        el("artist-status").textContent = "";
        mountFocusPicker(userId, finishOnboarding);
        return;
    }

    el("artist-focus-label").textContent = `Focus: ${focusLabel(profile.artistFocus)}`;
    el("artist-hub").hidden = false;
    await refreshCharacters(userId);
}

async function refreshCharacters(userId) {
    el("artist-status").textContent = "Loading characters…";
    try {
        const characters = await listMyCharacters(supabase, userId);
        renderCharacters(document, characters);
        el("artist-status").textContent = characters.length
            ? `${characters.length} character${characters.length === 1 ? "" : "s"}`
            : "";
    } catch (error) {
        el("artist-status").textContent = error.message || "Could not load characters.";
        el("artist-empty").hidden = true;
    }
}

el("artist-new-character").addEventListener("click", () => {
    const name = window.prompt("Character name");
    if (!name) return;
    const sessionPromise = resolveStudioSession(supabase);
    void sessionPromise.then(async (session) => {
        const userId = session.user?.id;
        if (!userId) return;
        el("artist-status").textContent = "Creating…";
        try {
            await createCharacter(supabase, userId, { displayName: name });
            await refreshCharacters(userId);
        } catch (error) {
            el("artist-status").textContent = error.message || "Could not create character.";
        }
    });
});

async function boot() {
    const session = await resolveStudioSession(supabase);
    if (session.mode !== "cloud" || !session.user?.id) {
        el("artist-sign-in").hidden = false;
        el("artist-status").textContent = "";
        if (session.mode === "none") goToLogin("/artist");
        return;
    }
    await bootHub(session.user.id);
}

void boot().catch((error) => {
    el("artist-status").textContent = error.message || "Something went wrong.";
});
