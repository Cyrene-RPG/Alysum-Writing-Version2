/**
 * Named loadout picker in the workspace top bar.
 */
import {
    applyAppearanceLoadout,
    getLoadoutPreview,
    readAppearanceLoadouts
} from "./appearance-loadout.js?v=3";
import { scheduleChromeInk } from "./text-ink.js";

function closeMenu(menu) {
    if (!menu) return;
    const btn = menu.querySelector(".wd-loadout-btn");
    const panel = menu.querySelector(".wd-loadout-dropdown");
    menu.classList.remove("is-open");
    btn?.setAttribute("aria-expanded", "false");
    if (panel) panel.hidden = true;
}

function toggleMenu(menu) {
    const btn = menu.querySelector(".wd-loadout-btn");
    const panel = menu.querySelector(".wd-loadout-dropdown");
    if (!btn || !panel) return;
    const open = panel.hidden;
    menu.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
}

function renderItems(panel) {
    const slots = readAppearanceLoadouts();
    panel.innerHTML = "";
    let count = 0;
    slots.forEach((slot, index) => {
        if (!slot) return;
        count += 1;
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.className = "wd-loadout-item";
        const swatch = document.createElement("span");
        swatch.className = "wd-loadout-swatch";
        swatch.setAttribute("aria-hidden", "true");
        const preview = getLoadoutPreview(slot);
        if (preview) swatch.style.background = preview;
        const name = document.createElement("span");
        name.textContent = slot.label;
        b.append(swatch, name);
        b.addEventListener("click", () => {
            applyAppearanceLoadout(slot);
            closeMenu(panel.closest(".wd-loadout-menu"));
        });
        panel.appendChild(b);
    });
    if (!count) {
        const empty = document.createElement("p");
        empty.className = "wd-loadout-empty";
        empty.textContent = "No saved themes yet";
        panel.appendChild(empty);
    }
}

function ensureMenu(nav) {
    let menu = nav.querySelector(".wd-loadout-menu");
    if (menu) return menu;
    menu = document.createElement("div");
    menu.className = "wd-loadout-menu";
    menu.id = "wdLoadoutMenu";
    menu.innerHTML = `
        <button type="button" class="wd-loadout-btn" id="wdLoadoutBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="wdLoadoutDropdown">
            Themes
        </button>
        <div class="wd-loadout-dropdown" id="wdLoadoutDropdown" role="menu" hidden></div>
    `;
    nav.appendChild(menu);
    return menu;
}

export function refreshAppearanceLoadoutMenu() {
    const panel = document.getElementById("wdLoadoutDropdown");
    if (panel) renderItems(panel);
}

export function initAppearanceLoadoutMenu() {
    const nav = document.querySelector(".wd-nav");
    if (!nav) return;
    const menu = ensureMenu(nav);
    if (menu.dataset.ready === "1") {
        const existing = menu.querySelector(".wd-loadout-btn");
        if (existing) existing.textContent = "Themes";
        refreshAppearanceLoadoutMenu();
        scheduleChromeInk();
        return;
    }
    menu.dataset.ready = "1";
    const btn = menu.querySelector(".wd-loadout-btn");
    const panel = menu.querySelector(".wd-loadout-dropdown");
    renderItems(panel);

    btn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (panel.hidden) renderItems(panel);
        toggleMenu(menu);
    });
    document.addEventListener("click", (e) => {
        if (!menu.contains(e.target)) closeMenu(menu);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenu(menu);
    });
    document.documentElement.addEventListener("alysum-appearance-loadouts", refreshAppearanceLoadoutMenu);
    window.addEventListener("storage", (e) => {
        if (e.key === "alysum-appearance-loadouts") refreshAppearanceLoadoutMenu();
    });
    scheduleChromeInk();
}
