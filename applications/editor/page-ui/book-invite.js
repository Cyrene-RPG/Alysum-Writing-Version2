import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { acceptBookEditorInvite } from "@alysum/collaboration/book-editors.js";

const heading = document.getElementById("inviteHeading");
const copy = document.getElementById("inviteCopy");
const btn = document.getElementById("inviteAccept");

function tokenFromUrl() {
    try {
        const hash=window.location.hash.slice(1);
        return (hash.startsWith("token=") ? new URLSearchParams(hash).get("token") : hash) || new URLSearchParams(window.location.search).get("token") || "";
    } catch {
        return "";
    }
}

async function boot() {
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search + window.location.hash);
    if (!session) return;
    if (session.mode !== "cloud") {
        heading.textContent = "Sign in to join";
        copy.textContent = "Editor invitations need a signed-in online account. Open this link on the website and sign in.";
        btn.hidden = true;
        return;
    }
    const token = tokenFromUrl();
    if (!/^[a-f0-9]{48,64}$/.test(token)) {
        heading.textContent = "Invite missing";
        copy.textContent = "This link is incomplete.";
        btn.hidden = true;
        return;
    }
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        copy.textContent = "Joining…";
        try {
            const { bookId } = await acceptBookEditorInvite(token);
            window.location.replace(`/editor?book=${encodeURIComponent(bookId)}`);
        } catch (err) {
            btn.disabled = false;
            copy.textContent = String(err?.message || err || "Couldn't accept this invite.");
        }
    });
}

boot().catch(() => {
    heading.textContent = "Could not open invitation";
    copy.textContent = "Check your connection and reload this page to try again.";
    btn.hidden = true;
});

