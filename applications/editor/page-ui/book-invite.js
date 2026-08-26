import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { acceptBookEditorInvite } from "@alysum/collaboration/book-editors.js";

const heading = document.getElementById("inviteHeading");
const copy = document.getElementById("inviteCopy");
const btn = document.getElementById("inviteAccept");

function tokenFromUrl() {
    try {
        return new URLSearchParams(window.location.search).get("token") || "";
    } catch {
        return "";
    }
}

async function boot() {
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;
    const token = tokenFromUrl();
    if (!token) {
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
            if (bookId) {
                window.location.replace(`editor.html?book=${encodeURIComponent(bookId)}`);
                return;
            }
            copy.textContent = "Joined, but the book id was missing.";
        } catch (err) {
            btn.disabled = false;
            copy.textContent = String(err?.message || err || "Couldn't accept this invite.");
        }
    });
}

boot();
