/**
 * Visit-only: author's Settings UI color + page background. Does not write Appearance keys.
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
import { applyRootInk, decideTextInk } from "./text-ink.js";
import { applyUiColorVars, clearUiColorVars, resolveUiColorHex } from "./ui-color.js";

const LOOK_VARS = [
    "--text",
    "--muted",
    "--border",
    "--accent",
    "--ui-text",
    "--ui-muted",
    "--chrome-text",
    "--chrome-muted",
    "--alysum-display-mid",
];

const LEGACY_TO_UI = {
    dark: "default",
    alysum: "default",
    light: "ui-porcelain",
    sepia: "ui-linen",
};

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
    if (id === "theme") return snapshotBgHex(saved) || resolveUiColorHex("default");
    return resolveUiColorHex(id);
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
    el.removeAttribute("data-ui-ink");
    el.removeAttribute("data-ui-tone");
    LOOK_VARS.forEach((name) => el.style.removeProperty(name));
    clearUiColorVars(el);
}

export function resolveListingPanelHex(look) {
    const raw = String(look?.pageLook || "") || "default";
    const id = LEGACY_TO_UI[raw] || raw;
    if (id === "saved" && look?.pageLookSaved) return snapshotPanelHex(look.pageLookSaved);
    if (id === "theme") return resolveVisitBackgroundHex(look.pageBgId, look.pageBg) || resolveUiColorHex("default");
    if (id === "custom") return hex(look.pageLookCustom) || resolveUiColorHex("default");
    return resolveUiColorHex(id);
}

function applyPageFill(el, hexValue) {
    if (!el || !hexValue) return;
    applyBodyBgVars(hexValue, false, null, el);
    applyRootInk(el, hexValue, "body");
}

function applyChrome(el, panelHex, titleHex) {
    if (!el || !panelHex) return;
    applyUiColorVars(panelHex, el);
    applyRootInk(el, panelHex, "ui");
    const ink = decideTextInk(panelHex);
    const raised = hex(getComputedStyle(el).getPropertyValue("--alysum-ui-raised")) || panelHex;
    el.style.setProperty("--chrome-text", ink.hex);
    el.style.setProperty("--chrome-muted", ink.muted);
    el.style.setProperty("--border", ink.tone === "light" ? "rgba(18, 18, 18, 0.14)" : "rgba(255, 255, 255, 0.12)");
    el.style.setProperty("--accent", raised);
    const title = hex(titleHex);
    if (title) el.style.setProperty("--alysum-display-mid", title);
}

function applyPanelInk(el, panelHex, titleHex) {
    applyChrome(el, panelHex, titleHex);
    const ink = decideTextInk(panelHex);
    el.style.setProperty("--text", ink.hex);
    el.style.setProperty("--muted", ink.muted);
}

function listingPageHex(look) {
    return resolveVisitBackgroundHex(look?.pageBgId, look?.pageBg) || resolveListingPanelHex(look);
}

function paintListingLook(el, look) {
    if (!el) return;
    const id = String(look?.pageLook || "") || "default";
    if (id === "saved" && look.pageLookSaved) {
        el.setAttribute("data-book-look", "saved");
        applyPanelInk(el, snapshotPanelHex(look.pageLookSaved), snapshotTitleHex(look.pageLookSaved));
        return;
    }
    el.setAttribute("data-book-look", id);
    applyPanelInk(el, resolveListingPanelHex({ ...look, pageLook: id }));
}

function clearVisitBodyInk(el) {
    if (!el || el === document.documentElement) return;
    el.style.removeProperty("--text");
    el.style.removeProperty("--muted");
    el.removeAttribute("data-body-ink");
    el.removeAttribute("data-body-bg-tone");
}

export function applyVisitPageBackground(el, pageBgId, pageBg) {
    if (!el) return;
    const value = resolveVisitBackgroundHex(pageBgId, pageBg);
    if (value) {
        applyPageFill(el, value);
        return;
    }
    clearBodyBgVars(el);
    clearVisitBodyInk(el);
}

function panelFromLoadout(slot) {
    const id = String(slot?.uiColor || "");
    if (id === "custom") return hex(slot.uiColorCustom);
    if (id === "theme" || !id) {
        return resolveVisitBackgroundHex(slot.bodyBg, slot.bodyBgCustom) || resolveUiColorHex("default");
    }
    return resolveUiColorHex(id);
}

export function applyVisitLoadout(el, slot) {
    if (!el || !slot) return;
    const pageHex = resolveVisitBackgroundHex(slot.bodyBg, slot.bodyBgCustom)
        || panelFromLoadout(slot);
    applyPageFill(el, pageHex);
    applyChrome(el, panelFromLoadout(slot), snapshotTitleHex(slot));
}

export function applyVisitBookLook(pageEl, look) {
    if (!pageEl) return;
    const cards = pageEl.querySelectorAll?.(".book-card");
    if (cards?.length) {
        cards.forEach((card) => paintListingLook(card, look));
        return;
    }
    paintListingLook(pageEl, look);
}

export function applyVisitListingLook(bgEl, pageEl, look) {
    const pageHex = listingPageHex(look);
    const panelHex = resolveListingPanelHex(look);
    if (bgEl) {
        applyPageFill(bgEl, pageHex);
        if (pageEl && pageEl !== bgEl) applyChrome(bgEl, panelHex);
    }
    if (pageEl && pageEl !== bgEl) {
        applyPageFill(pageEl, pageHex);
        applyVisitBookLook(pageEl, look);
        return;
    }
    if (pageEl) {
        applyChrome(pageEl, panelHex);
        pageEl.setAttribute("data-book-look", String(look?.pageLook || "") || "default");
    }
}

export function clearVisitPageLook(el) {
    if (!el) return;
    clearBodyBgVars(el);
    clearVisitBodyInk(el);
    clearLookVars(el);
}
