import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { deleteCharacter, fetchArtistHubProfile, getCharacter, updateCharacter } from "@alysum/artist/character-store.js";
import { addArtwork, deleteArtwork, listArtworks } from "@alysum/artist/artwork-store.js";
import { uploadArtistImage } from "@alysum/artist/media.js";
import { publicCharacterUrl } from "@alysum/artist/public-profile.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const characterId = params.get("id") || "";
let userId = "";
let username = "";
let record = null;

function fieldText(character, key) {
    return String(character.fields?.[key] || "");
}

function paintPortrait(url) {
    const box = $("portrait");
    box.replaceChildren();
    if (!url) {
        box.textContent = "No portrait";
        return;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    box.append(img);
}

function fill(character) {
    const form = $("form");
    form.displayName.value = character.displayName;
    form.summary.value = character.summary || "";
    form.kind.value = character.kind;
    form.visibility.value = character.visibility;
    form.tradePolicy.value = character.tradePolicy;
    form.termsText.value = character.termsText || "";
    form.overview.value = fieldText(character, "overview");
    form.design.value = fieldText(character, "design");
    form.personality.value = fieldText(character, "personality");
    form.history.value = fieldText(character, "history");
    paintPortrait(character.portraitUrl);
    const link = $("public-link");
    if (character.visibility === "public" && username) {
        link.hidden = false;
        link.href = publicCharacterUrl(username, character.slug);
    } else {
        link.hidden = true;
    }
}

function paintArt(rows) {
    const grid = $("art-grid");
    grid.replaceChildren();
    for (const art of rows) {
        const figure = document.createElement("figure");
        figure.className = "artist-shot";
        if (art.publicUrl) {
            const img = document.createElement("img");
            img.src = art.publicUrl;
            img.alt = art.caption || "";
            figure.append(img);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Remove";
        button.addEventListener("click", () => {
            void deleteArtwork(supabase, userId, art.id).then(() => refreshArt());
        });
        figure.append(button);
        grid.append(figure);
    }
}

async function refreshArt() {
    paintArt(await listArtworks(supabase, userId, characterId));
}

async function boot() {
    const session = await resolveStudioSession(supabase);
    if (!session.user?.id || session.mode !== "cloud") {
        goToLogin(location.pathname + location.search);
        return;
    }
    userId = session.user.id;
    if (!characterId) {
        $("status").textContent = "Missing character.";
        return;
    }
    const [profile, character] = await Promise.all([
        fetchArtistHubProfile(supabase, userId),
        getCharacter(supabase, userId, characterId),
    ]);
    username = profile.username || "";
    record = character;
    if (!character) {
        $("status").textContent = "That character is not on this account.";
        return;
    }
    fill(character);
    $("form").hidden = false;
    $("status").textContent = "";
    await refreshArt();

    $("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        $("status").textContent = "Saving…";
        void updateCharacter(supabase, userId, characterId, {
            displayName: form.displayName.value,
            summary: form.summary.value,
            kind: form.kind.value,
            visibility: form.visibility.value,
            tradePolicy: form.tradePolicy.value,
            termsText: form.termsText.value,
            fields: {
                ...(record?.fields || {}),
                overview: form.overview.value,
                design: form.design.value,
                personality: form.personality.value,
                history: form.history.value,
            },
        }).then((saved) => {
            record = saved;
            fill(saved);
            const portraitHidden = saved.visibility === "public" && saved.portraitUrl && !saved.fields?.portraitProtection;
            $("status").textContent = portraitHidden
                ? "Saved. The public page hides this portrait until you upload a Glaze or Nightshade export."
                : "Saved.";
        }).catch((error) => {
            $("status").textContent = error.message || "Could not save.";
        });
    });

    $("portrait-file").addEventListener("change", () => {
        const file = $("portrait-file").files?.[0];
        if (!file) return;
        const makingPublic = $("form").visibility.value === "public";
        if (makingPublic && !$("portrait-ack").checked) {
            $("status").textContent = "A public portrait has to be a Glaze or Nightshade export. Check the box, or keep the character private.";
            return;
        }
        $("status").textContent = "Uploading portrait…";
        const protection = $("portrait-ack").checked ? $("portrait-protection").value : null;
        void uploadArtistImage(supabase, userId, file)
            .then((uploaded) => updateCharacter(supabase, userId, characterId, {
                portraitUrl: uploaded.url,
                fields: { ...(record?.fields || {}), portraitProtection: protection },
            }))
            .then((saved) => {
                record = saved;
                paintPortrait(saved.portraitUrl);
                $("status").textContent = "Portrait saved.";
            })
            .catch((error) => { $("status").textContent = error.message || "Portrait upload failed."; });
    });

    $("art-add").addEventListener("click", () => {
        const file = $("art-file").files?.[0];
        const visibility = $("art-visibility").value;
        const acknowledged = $("art-ack").checked;
        if (visibility === "public" && !acknowledged) {
            $("status").textContent = "Public images need the Glaze / Nightshade confirmation.";
            return;
        }
        $("status").textContent = "Uploading…";
        void uploadArtistImage(supabase, userId, file)
            .then((uploaded) => addArtwork(supabase, userId, {
                characterId,
                storagePath: uploaded.path,
                publicUrl: uploaded.url,
                caption: $("art-caption").value,
                visibility,
                protectionDeclared: visibility === "public" || acknowledged ? $("art-protection").value : null,
            }))
            .then(() => {
                $("art-file").value = "";
                $("art-caption").value = "";
                $("art-ack").checked = false;
                $("status").textContent = "Image added.";
                return refreshArt();
            })
            .catch((error) => { $("status").textContent = error.message || "Upload failed."; });
    });

    $("remove").addEventListener("click", () => {
        if (!confirm("Delete this character?")) return;
        void deleteCharacter(supabase, userId, characterId).then(() => { location.href = "/artist"; });
    });
}

void boot().catch((error) => { $("status").textContent = error.message || "Could not open this character."; });
