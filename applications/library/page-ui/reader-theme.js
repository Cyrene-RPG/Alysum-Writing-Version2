/**
 * Reader theme circles: Light, Dark, saved Appearance slots, Author.
 * Visit-only; does not write Appearance keys.
 */
import { getBodyBgPreview } from "@alysum/site-appearance/js-runtime/body-background.js";
import { getLoadoutPreview, readAppearanceLoadouts } from "@alysum/site-appearance/js-runtime/appearance-loadout.js?v=3";
import {
    applyVisitListingLook,
    applyVisitLoadout,
    resolveListingPanelHex,
    resolveVisitBackgroundHex,
} from "@alysum/site-appearance/js-runtime/visit-page-look.js?v=8";

const THEME_KEY = "alysum:reader:theme-by-book";

const SITE_LIGHT = { label: "Light", bodyBg: "blanc", uiColor: "theme" };
const SITE_DARK = { label: "Dark", bodyBg: "noir", uiColor: "theme" };

function isDarkOrLight(slot) {
    const label = String(slot?.label || "").trim().toLowerCase();
    return label === "dark" || label === "light";
}

function readMap() {
    try {
        const raw = JSON.parse(localStorage.getItem(THEME_KEY) || "{}");
        return raw && typeof raw === "object" ? raw : {};
    } catch {
        return {};
    }
}

function writeMap(map) {
    try {
        localStorage.setItem(THEME_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

export function readBookTheme(bookId) {
    const id = String(bookId || "");
    const saved = id ? String(readMap()[id] || "") : "";
    return saved || "author";
}

export function writeBookTheme(bookId, themeId) {
    const id = String(bookId || "");
    if (!id || !themeId) return;
    const map = readMap();
    map[id] = themeId;
    writeMap(map);
}

export function listReaderThemes(work) {
    const themes = [
        { id: "light", label: "Light", preview: getBodyBgPreview("blanc") },
        { id: "dark", label: "Dark", preview: getBodyBgPreview("noir") },
    ];
    readAppearanceLoadouts().forEach((slot, index) => {
        if (!slot || isDarkOrLight(slot)) return;
        const custom = String(slot.bodyBgCustom || "").trim();
        const preview = (slot.bodyBg === "custom" && custom)
            ? custom
            : (getBodyBgPreview(slot.bodyBg) || getLoadoutPreview(slot));
        themes.push({
            id: `slot-${index}`,
            label: slot.label || "Saved",
            preview,
        });
    });
    const authorPreview = resolveVisitBackgroundHex(work?.pageBgId, work?.pageBg)
        || resolveListingPanelHex(work);
    themes.push({ id: "author", label: "Author", preview: authorPreview });
    return themes;
}

export function applyReaderTheme(themeId, work) {
    const root = document.documentElement;
    if (themeId === "light") {
        applyVisitLoadout(root, SITE_LIGHT);
        return;
    }
    if (themeId === "dark") {
        applyVisitLoadout(root, SITE_DARK);
        return;
    }
    const slotMatch = /^slot-(\d+)$/.exec(String(themeId || ""));
    if (slotMatch) {
        const slot = readAppearanceLoadouts()[Number(slotMatch[1])];
        if (slot) {
            applyVisitLoadout(root, slot);
            return;
        }
    }
    applyVisitListingLook(root, root, work);
}

export function mountReaderThemes(swatchRoot, work) {
    if (!swatchRoot) return { themeId: "author" };
    const bookId = work?.id || "";
    const themes = listReaderThemes(work);
    let themeId = readBookTheme(bookId);
    if (!themes.some((theme) => theme.id === themeId)) themeId = "author";

    function paint() {
        swatchRoot.innerHTML = "";
        themes.forEach((theme) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `reader-swatch${theme.id === themeId ? " is-on" : ""}`;
            btn.dataset.theme = theme.id;
            btn.setAttribute("aria-label", theme.label);
            const swatch = document.createElement("span");
            if (theme.preview) swatch.style.background = theme.preview;
            btn.append(swatch, document.createTextNode(theme.label));
            swatchRoot.appendChild(btn);
        });
    }

    applyReaderTheme(themeId, work);
    paint();

    swatchRoot.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-theme]");
        if (!btn || !themes.some((theme) => theme.id === btn.dataset.theme)) return;
        themeId = btn.dataset.theme;
        writeBookTheme(bookId, themeId);
        applyReaderTheme(themeId, work);
        paint();
    });

    return { themeId };
}
