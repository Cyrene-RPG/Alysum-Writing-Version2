import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { goToLogin } from "/core/desktop/app.js";
import { userHasArtistAccess } from "@alysum/artist/access.js";
import { fetchArtistHubProfile } from "@alysum/artist/character-store.js";
import { addArtwork } from "@alysum/artist/artwork-store.js";
import { uploadArtistImage } from "@alysum/artist/media.js";
import { createDrawStore } from "./studio-store.js";
export { mountDrawApp } from "/applications/artist/page-ui/studio-draw-app.js";
import { mountDrawApp } from "/applications/artist/page-ui/studio-draw-app.js";

function keepMessage(root, text) {
    root.innerHTML = `<p class="draw-gate">${text}</p>`;
}

async function boot() {
    const root = document.getElementById("draw-app");
    if (!root || root.dataset.manual === "1") return;
    const session = await resolveStudioSession(supabase);
    if (!session.user?.id || session.mode !== "cloud") {
        keepMessage(root, "Sign in with an Artist account to draw.");
        if (session.mode === "none") goToLogin(`/artist-draw${location.search}`);
        return;
    }
    let profile;
    try {
        profile = await fetchArtistHubProfile(supabase, session.user.id);
    } catch (error) {
        keepMessage(root, error.message || "Could not open Draw.");
        return;
    }
    if (!userHasArtistAccess(profile.accountType)) {
        keepMessage(root, "This account does not include Artist. Change it in Settings, then come back to Draw.");
        return;
    }
    const params = new URLSearchParams(location.search);
    const userId = session.user.id;
    await mountDrawApp(root, {
        projectId: params.get("id") || "",
        characterId: params.get("character") || "",
        store: createDrawStore(),
        upload: async (file, doc) => {
            const uploaded = await uploadArtistImage(supabase, userId, file);
            await addArtwork(supabase, userId, {
                characterId: doc.characterId || null,
                storagePath: uploaded.path,
                publicUrl: uploaded.url,
                caption: doc.name,
                visibility: "private",
                offerKind: "none",
            });
            return "Saved to My art as a private image.";
        },
    });
}

void boot().catch((error) => {
    const root = document.getElementById("draw-app");
    if (root && root.dataset.manual !== "1") keepMessage(root, error.message || "Draw did not open.");
});
