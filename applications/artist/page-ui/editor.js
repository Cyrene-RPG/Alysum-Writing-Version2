import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { deleteCharacter, fetchArtistHubProfile, getCharacter, updateCharacter } from "@alysum/artist/character-store.js";
import { addArtwork, deleteArtwork, listArtworks, updateArtwork } from "@alysum/artist/artwork-store.js";
import { uploadArtistImage } from "@alysum/artist/media.js";
import { requireCheckoutUrl } from "@alysum/artist/offers.js";
import { publicCharacterUrl, publicGalleryUrl } from "@alysum/artist/public-profile.js";

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
    form.offerKind.value = character.offerKind || "none";
    form.offerStatus.value = character.offerStatus || "available";
    form.priceLabel.value = character.priceLabel || "";
    form.checkoutUrl.value = character.checkoutUrl || "";
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
    const gallery = $("gallery-link");
    if (username) {
        gallery.hidden = false;
        gallery.href = publicGalleryUrl(username);
    }
}

function fieldSelect(label, value, options) {
    const wrap = document.createElement("label");
    wrap.className = "artist-field";
    wrap.append(label);
    const select = document.createElement("select");
    for (const option of options) {
        const node = document.createElement("option");
        node.value = option.id;
        node.textContent = option.label;
        node.selected = option.id === value;
        select.append(node);
    }
    wrap.append(select);
    return { wrap, select };
}

function fieldInput(label, value, max) {
    const wrap = document.createElement("label");
    wrap.className = "artist-field";
    wrap.append(label);
    const input = document.createElement("input");
    input.value = value || "";
    input.maxLength = max;
    wrap.append(input);
    return { wrap, input };
}

function paintArt(rows) {
    const grid = $("art-grid");
    grid.replaceChildren();
    for (const art of rows) {
        const card = document.createElement("article");
        card.className = "artist-listing-edit";
        const figure = document.createElement("figure");
        figure.className = "artist-shot";
        if (art.publicUrl) {
            const img = document.createElement("img");
            img.src = art.publicUrl;
            img.alt = art.caption || "";
            figure.append(img);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
            void deleteArtwork(supabase, userId, art.id).then(() => refreshArt());
        });
        figure.append(remove);
        const caption = document.createElement("p");
        caption.className = "artist-status";
        caption.textContent = art.caption || (art.visibility === "public" ? "Public image" : "Private image");
        const offer = fieldSelect("List this image", art.offerKind || "none", [
            { id: "none", label: "Not for sale" },
            { id: "buy", label: "For sale on your gallery" },
        ]);
        const listingStatus = fieldSelect("Sale status", art.offerStatus || "available", [
            { id: "available", label: "Available" },
            { id: "pending", label: "On hold" },
            { id: "closed", label: "Taken — hide from the gallery" },
        ]);
        const price = fieldInput("Price", art.priceLabel, 80);
        const link = fieldInput("Payment link", art.checkoutUrl, 500);
        const save = document.createElement("button");
        save.type = "button";
        save.className = "artist-primary";
        save.textContent = "Save listing";
        save.addEventListener("click", () => {
            $("status").textContent = "Saving listing…";
            void updateArtwork(supabase, userId, art.id, {
                offerKind: offer.select.value,
                offerStatus: listingStatus.select.value,
                priceLabel: price.input.value,
                checkoutUrl: link.input.value,
            }).then(() => {
                $("status").textContent = art.visibility === "public" && art.protectionDeclared
                    ? "Listing saved."
                    : "Listing saved. It stays off the public gallery until this image is public and marked as a Glaze or Nightshade export.";
            }).catch((error) => {
                $("status").textContent = error.message || "Could not save that listing.";
            });
        });
        card.append(figure, caption, offer.wrap, listingStatus.wrap, price.wrap, link.wrap, save);
        grid.append(card);
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
            offerKind: form.offerKind.value,
            offerStatus: form.offerStatus.value,
            priceLabel: form.priceLabel.value,
            checkoutUrl: form.checkoutUrl.value,
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
        try {
            requireCheckoutUrl($("art-url").value);
        } catch (error) {
            $("status").textContent = error.message;
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
                offerKind: $("art-offer").value,
                offerStatus: $("art-status").value,
                priceLabel: $("art-price").value,
                checkoutUrl: $("art-url").value,
            }))
            .then(() => {
                $("art-file").value = "";
                $("art-caption").value = "";
                $("art-ack").checked = false;
                $("art-offer").value = "none";
                $("art-price").value = "";
                $("art-url").value = "";
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
