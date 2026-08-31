/**
 * Visit-only listing look + page background. Does not write Appearance keys.
 */
import {
    ACCENT_COMPLEMENT_BG,
    applyBodyBgVars,
    clearBodyBgVars,
    getStoredAccentThemeId,
    isBodyBgId,
    resolveAccentBodyBg,
    resolveBodyBgColor,
} from "./body-background.js";
import { DISPLAY_TEXT_COLORS } from "./display-text-color.js";
import { decideTextInk } from "./text-ink.js";
import { UI_COLORS, applyUiColorVars, clearUiColorVars } from "./ui-color.js";

export const BOOK_LOOK_BUILTINS = [
    { id: "dark", label: "Dark" },
    { id: "sepia", label: "Sepia" },
    { id: "light", label: "Light" },
    { id: "alysum", label: "Alysum" },
];

const LOOK_VARS = [
    "--text",
    "--muted",
    "--border",
    "--book-title-color",
    "--book-cta-ink",
    "--book-hero-ink",
];

function hex(value) {
    const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toLowerCase()}` : "";
}

export function resolveVisitBackgroundHex(pageBgId, pageBg) {
    const custom = hex(pageBg);
    const id = String(pageBgId || "").trim();
    if (!id && custom) return custom;
    if (!id) return "";
    if (id === "custom" || !isBodyBgId(id)) return custom;
    return resolveBodyBgColor(id);
}

function snapshotBgHex(saved) {
    const id = String(saved?.bodyBg || "");
    if (id === "custom") return hex(saved.bodyBgCustom);
    if (id === "theme") {
        return resolveAccentBodyBg(saved.gradientTheme || getStoredAccentThemeId());
    }
    if (id && isBodyBgId(id) && id !== "custom") return resolveBodyBgColor(id);
    return ACCENT_COMPLEMENT_BG[saved?.gradientTheme] || "";
}

function snapshotPanelHex(saved) {
    const id = String(saved?.uiColor || "");
    if (id === "custom") return hex(saved.uiColorCustom);
    if (id === "default" || !id) return "#111827";
    if (id === "theme") return snapshotBgHex(saved) || "#111827";
    const row = UI_COLORS.find((item) => item.id === id);
    return hex(row?.color) || "#111827";
}

function snapshotTitleHex(saved) {
    const id = String(saved?.textColor || "");
    if (id === "custom") return hex(saved.textColorMain);
    const preset = DISPLAY_TEXT_COLORS.find((item) => item.id === id && item.main);
    if (preset) return preset.main;
    return "";
}

function clearLookVars(el) {
    if (!el) return;
    el.removeAttribute("data-book-look");
    LOOK_VARS.forEach((name) => el.style.removeProperty(name));
    clearUiColorVars(el);
}

function applySavedLook(pageEl, saved) {
    const panel = snapshotPanelHex(saved);
    applyUiColorVars(panel, pageEl);
    const ink = decideTextInk(panel);
    pageEl.style.setProperty("--text", ink.hex);
    pageEl.style.setProperty("--muted", ink.muted);
    pageEl.style.setProperty("--border", ink.tone === "light" ? "rgba(18, 18, 18, 0.14)" : "rgba(255, 255, 255, 0.12)");
    const title = snapshotTitleHex(saved) || ink.hex;
    pageEl.style.setProperty("--book-title-color", title);
    pageEl.style.setProperty("--book-hero-ink", decideTextInk("#1a1224").hex);
    const ctaInk = decideTextInk(getComputedStyle(pageEl).getPropertyValue("--accent").trim() || "#7c3aed");
    pageEl.style.setProperty("--book-cta-ink", ctaInk.hex);
}

export function applyVisitPageBackground(el, pageBgId, pageBg) {
    if (!el) return;
    const value = resolveVisitBackgroundHex(pageBgId, pageBg);
    if (value) applyBodyBgVars(value, false, null, el);
    else clearBodyBgVars(el);
}

export function applyVisitBookLook(pageEl, look) {
    if (!pageEl) return;
    const id = String(look?.pageLook || "");
    if (!id) {
        clearLookVars(pageEl);
        return;
    }
    pageEl.setAttribute("data-book-look", id);
    if (id === "saved" && look.pageLookSaved) {
        applySavedLook(pageEl, look.pageLookSaved);
        return;
    }
    LOOK_VARS.forEach((name) => pageEl.style.removeProperty(name));
    clearUiColorVars(pageEl);
}

export function applyVisitListingLook(bgEl, pageEl, look) {
    applyVisitPageBackground(bgEl, look?.pageBgId, look?.pageBg);
    applyVisitBookLook(pageEl, look);
}

export function clearVisitPageLook(el) {
    if (!el) return;
    clearBodyBgVars(el);
    clearLookVars(el);
}
