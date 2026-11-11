import { peekWorkspaceProfile, loadWorkspaceProfile } from "/core/account/workspace-profile.js";
import { openReaderData, escapeHtml } from "./data.js";
import { readerNavHtml } from "./chrome.js";

const statusEl = document.getElementById("reader-status");
const signInEl = document.getElementById("reader-sign-in");
const root = document.getElementById("reader-root");
const tabs = document.getElementById("reader-tabs");
if (tabs) tabs.innerHTML = readerNavHtml("profile");

function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
}

function paint(profile) {
    const name = profile.name || profile.displayName || "Reader";
    const handle = profile.username ? `@${profile.username}` : "Reader account";
    const initial = String(name).trim().charAt(0).toUpperCase() || "A";
    const img = String(profile.imageUrl || "").trim();
    root.innerHTML = `
        <section class="reader-profile">
            <div class="reader-avatar">${img ? `<img src="${escapeHtml(img)}" alt="">` : escapeHtml(initial)}</div>
            <div>
                <h2>${escapeHtml(name)}</h2>
                <p>${escapeHtml(handle)}</p>
            </div>
        </section>
        <div class="reader-actions">
            <a class="primary" href="/reader">Back to Continue</a>
            <a href="/reader/shelf">Open Shelf</a>
            <a href="/overview">Full profile</a>
            <a href="/settings">Settings</a>
            <a href="/library">Classic Library</a>
        </div>
    `;
    root.hidden = false;
}

async function boot() {
    try {
        const { session, supabase } = await openReaderData();
        if (session.mode === "none") {
            setStatus("");
            signInEl.hidden = false;
            return;
        }
        const preview = peekWorkspaceProfile(session);
        paint(preview);
        setStatus("");
        if (session.mode === "cloud") {
            const full = await loadWorkspaceProfile(supabase, session);
            paint(full);
        }
    } catch (error) {
        console.error(error);
        setStatus(error?.message || "Could not load profile.");
        signInEl.hidden = false;
    }
}

void boot();
