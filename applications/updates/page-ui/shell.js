import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import { peekWorkspaceProfile, loadWorkspaceProfile } from "/core/account/workspace-profile.js";
import { getAnnouncementAccess } from "/core/publishing/announcements.js";
/**
 * Account chrome for Updates. Shares Alysum behavior without cross-application imports.
 */
import { wireLogoutButtons } from "@alysum/authentication/logout.js";
import { openRoadmap } from "@alysum/authentication/open-roadmap.js";
import { initAppearanceLoadoutMenu } from "@alysum/site-appearance/js-runtime/appearance-loadout-menu.js?v=8";

function closeWelcomePfpMenu() {
    const menu = document.getElementById("welcomePfpMenu");
    const btn = document.getElementById("welcomePfpBtn");
    const panel = document.getElementById("welcomePfpDropdown");
    if (!menu || !btn || !panel) return;
    menu.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    panel.hidden = true;
}

function toggleWelcomePfpMenu() {
    const menu = document.getElementById("welcomePfpMenu");
    const btn = document.getElementById("welcomePfpBtn");
    const panel = document.getElementById("welcomePfpDropdown");
    if (!menu || !btn || !panel) return;
    const open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
}

function wirePfpMenu() {
    const btn = document.getElementById("welcomePfpBtn");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleWelcomePfpMenu();
    });
    document.addEventListener("click", (event) => {
        const menu = document.getElementById("welcomePfpMenu");
        if (menu && !menu.contains(event.target)) closeWelcomePfpMenu();
    });
    document.querySelectorAll("[data-close-pfp-menu]").forEach((el) => {
        el.addEventListener("click", () => closeWelcomePfpMenu());
    });
}

function setWelcomeAvatar(imageUrl, name) {
    const img = document.getElementById("welcomePfpImg");
    const initial = document.getElementById("welcomePfpInitial");
    const letter = String(name || "A").trim().charAt(0).toUpperCase() || "A";
    const url = String(imageUrl || "").trim();
    if (initial) initial.textContent = letter;
    if (img && url) {
        initial?.classList.add("is-hidden");
        img.onerror = () => {
            img.removeAttribute("src");
            img.hidden = true;
            initial?.classList.remove("is-hidden");
        };
        img.hidden = false;
        img.src = url;
        return;
    }
    if (img) {
        img.removeAttribute("src");
        img.hidden = true;
    }
    initial?.classList.remove("is-hidden");
}


wireLogoutButtons(document);
wirePfpMenu();
initAppearanceLoadoutMenu({ openRoadmap });

async function refreshProfile() {
    const generation = ++profileGeneration;
    const session = await resolveStudioSession(supabase);
    if (generation !== profileGeneration) return;
    const preview = peekWorkspaceProfile(session);
    setWelcomeAvatar(preview.imageUrl, preview.name);
    const writerLink = document.getElementById("write-update-link");
    if (writerLink) writerLink.hidden = true;
    if (session.mode !== "cloud") return;
    void loadWorkspaceProfile(supabase, session).then(profile => {
        if (generation === profileGeneration) setWelcomeAvatar(profile.imageUrl, profile.name);
    });
    if (writerLink) {
        try {
            const access = await getAnnouncementAccess(supabase);
            if (generation === profileGeneration) writerLink.hidden = !(access.canPublishAuthor || access.canPublishSite);
        } catch { /* Keep publishing affordances hidden when access cannot be checked. */ }
    }
}
let profileGeneration = 0;
void refreshProfile().catch(() => {});
supabase.auth.onAuthStateChange(() => {
    // Leave the auth callback before making profile or access requests.
    setTimeout(() => { void refreshProfile().catch(() => {}); }, 0);
});
