/**
 * Welcome bar + logout for studio/editor. Do not import main-site modules.
 */
import { wireLogoutButtons } from "@alysum/authentication/logout.js";
import { initAppearanceLoadoutMenu } from "@alysum/site-appearance/appearance-loadout-menu.js";

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

export function setWelcomeCopy(title, subtitle) {
    const titleEl = document.getElementById("welcomeTitle");
    const subEl = document.getElementById("welcomeSubtitle");
    if (titleEl && title != null) titleEl.textContent = title;
    if (subEl && subtitle != null) subEl.textContent = subtitle;
}

export function setWelcomeAvatar(imageUrl, name) {
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

export function setWelcomeInitial(name) {
    setWelcomeAvatar("", name);
}

export function initWorkspaceShell({ title, subtitle, name, imageUrl } = {}) {
    wireLogoutButtons(document);
    wirePfpMenu();
    initAppearanceLoadoutMenu();
    if (title || subtitle) setWelcomeCopy(title || "", subtitle || "");
    if (name || imageUrl) setWelcomeAvatar(imageUrl, name);
}
