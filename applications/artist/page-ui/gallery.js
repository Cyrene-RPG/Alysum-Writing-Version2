import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { listArtworks } from "@alysum/artist/artwork-store.js";

const status = document.getElementById("status");
const grid = document.getElementById("grid");

function paint(rows) {
    grid.replaceChildren();
    for (const art of rows) {
        const figure = document.createElement("a");
        figure.className = "artist-shot";
        figure.href = art.characterId ? `/artist-character?id=${encodeURIComponent(art.characterId)}` : "/artist";
        if (art.publicUrl) {
            const img = document.createElement("img");
            img.src = art.publicUrl;
            img.alt = art.caption || "";
            figure.append(img);
        }
        grid.append(figure);
    }
    status.textContent = rows.length ? "" : "No images yet. Add them from a character.";
}

async function boot() {
    const session = await resolveStudioSession(supabase);
    if (!session.user?.id || session.mode !== "cloud") {
        goToLogin("/artist-gallery");
        return;
    }
    try {
        paint(await listArtworks(supabase, session.user.id));
    } catch (error) {
        status.textContent = error.message || "Could not load the gallery.";
    }
}

void boot();
