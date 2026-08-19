/**
 * Five appearance loadout slots (accent, background, UI, glass, title font/color).
 */
import { applyGradientTheme, getStoredGradientThemeId, getThemePreview } from "./gradient-theme.js";
import {
    applyBodyBackground,
    getAppearanceMixMode,
    getStoredBodyBgId,
    getStoredCustomBodyBg,
    setAppearanceMixMode
} from "./body-background.js";
import { applyUiColor, getStoredCustomUiColor, getStoredUiColorId } from "./ui-color.js";
import { applySurfaceStyle, getStoredSurfaceStyleId } from "./surface-style.js";
import { applyCornerStyle, getStoredCornerStyleId } from "./corner-style.js";
import { applyDisplayTextStyle, getStoredDisplayTextStyleId } from "./display-text-style.js";
import {
    applyDisplayTextColor,
    getStoredCustomDisplayColors,
    getStoredDisplayTextColorId
} from "./display-text-color.js";

export const LOADOUT_KEY = "alysum-appearance-loadouts";
export const LOADOUT_SLOT_COUNT = 5;
export const LOADOUT_NAME_MAX = 6;

function clipLabel(label, fallback = "Saved") {
    const next = String(label || "").trim().slice(0, LOADOUT_NAME_MAX);
    return next || fallback;
}

function noirLoadout() {
    return {
        label: "Dark",
        gradientTheme: "noir",
        bodyBg: "noir",
        bodyBgCustom: "",
        appearanceMix: "free",
        uiColor: "theme",
        uiColorCustom: "",
        surfaceStyle: "solid",
        cornerStyle: "round",
        textStyle: "classic",
        textColor: "theme",
        textColorMain: "",
        textColorAccent: ""
    };
}

function blancLoadout() {
    return {
        label: "Light",
        gradientTheme: "blanc",
        bodyBg: "blanc",
        bodyBgCustom: "",
        appearanceMix: "free",
        uiColor: "theme",
        uiColorCustom: "",
        surfaceStyle: "solid",
        cornerStyle: "round",
        textStyle: "classic",
        textColor: "theme",
        textColorMain: "",
        textColorAccent: ""
    };
}

function alysumLoadout() {
    return {
        label: "Alysum",
        gradientTheme: "classic",
        bodyBg: "default",
        bodyBgCustom: "",
        appearanceMix: "free",
        uiColor: "theme",
        uiColorCustom: "",
        surfaceStyle: "solid",
        cornerStyle: "round",
        textStyle: "classic",
        textColor: "theme",
        textColorMain: "",
        textColorAccent: ""
    };
}

function defaultSlots() {
    return [noirLoadout(), blancLoadout(), alysumLoadout(), null, null];
}

function isAlysumLabel(label) {
    return String(label || "").trim().toLowerCase() === "alysum";
}

function ensureAlysumSlot(slots) {
    if (slots.some((slot) => slot && isAlysumLabel(slot.label))) return slots;
    const emptyIndex = slots.findIndex((slot) => !slot);
    if (emptyIndex < 0) return slots;
    slots[emptyIndex] = alysumLoadout();
    return writeAppearanceLoadouts(slots);
}

function normalizeSlot(slot) {
    if (!slot || typeof slot !== "object") return null;
    return {
        label: clipLabel(slot.label, "Saved"),
        gradientTheme: slot.gradientTheme || "classic",
        bodyBg: slot.bodyBg || "default",
        bodyBgCustom: slot.bodyBgCustom || "",
        appearanceMix: slot.appearanceMix === "linked" ? "linked" : "free",
        uiColor: slot.uiColor || "default",
        uiColorCustom: slot.uiColorCustom || "",
        surfaceStyle: slot.surfaceStyle === "glass" ? "glass" : "solid",
        cornerStyle: slot.cornerStyle === "sharp" ? "sharp" : "round",
        textStyle: slot.textStyle || "classic",
        textColor: slot.textColor || "theme",
        textColorMain: slot.textColorMain || "",
        textColorAccent: slot.textColorAccent || ""
    };
}

export function captureAppearanceLoadout(label = "Saved") {
    const customText = getStoredCustomDisplayColors();
    return {
        label: clipLabel(label, "Saved"),
        gradientTheme: getStoredGradientThemeId(),
        bodyBg: getStoredBodyBgId(),
        bodyBgCustom: getStoredCustomBodyBg(),
        appearanceMix: getAppearanceMixMode(),
        uiColor: getStoredUiColorId(),
        uiColorCustom: getStoredCustomUiColor(),
        surfaceStyle: getStoredSurfaceStyleId(),
        cornerStyle: getStoredCornerStyleId(),
        textStyle: getStoredDisplayTextStyleId(),
        textColor: getStoredDisplayTextColorId(),
        textColorMain: customText.main,
        textColorAccent: customText.accent
    };
}

export function applyAppearanceLoadout(slot) {
    const loadout = normalizeSlot(slot);
    if (!loadout) return false;
    applyGradientTheme(loadout.gradientTheme);
    if (loadout.appearanceMix === "linked") {
        setAppearanceMixMode("linked");
        applyBodyBackground("theme");
    } else {
        setAppearanceMixMode("free");
        applyBodyBackground(loadout.bodyBg, loadout.bodyBgCustom);
    }
    applyUiColor(loadout.uiColor, loadout.uiColorCustom);
    applySurfaceStyle(loadout.surfaceStyle);
    applyCornerStyle(loadout.cornerStyle);
    applyDisplayTextStyle(loadout.textStyle);
    applyDisplayTextColor(loadout.textColor, loadout.textColorMain, loadout.textColorAccent);
    try {
        document.documentElement.dispatchEvent(
            new CustomEvent("alysum-appearance-loadout-applied", { detail: { loadout } })
        );
    } catch {
        /* ignore */
    }
    return true;
}

export function getLoadoutPreview(slot) {
    const loadout = normalizeSlot(slot);
    if (!loadout) return "";
    return getThemePreview(loadout.gradientTheme);
}

export function readAppearanceLoadouts() {
    try {
        const raw = JSON.parse(localStorage.getItem(LOADOUT_KEY) || "null");
        if (!Array.isArray(raw) || raw.length !== LOADOUT_SLOT_COUNT) {
            const seeded = defaultSlots();
            writeAppearanceLoadouts(seeded);
            return seeded;
        }
        const slots = raw.map((slot) => normalizeSlot(slot));
        return ensureAlysumSlot(slots);
    } catch {
        const seeded = defaultSlots();
        writeAppearanceLoadouts(seeded);
        return seeded;
    }
}

export function writeAppearanceLoadouts(slots) {
    const next = Array.from({ length: LOADOUT_SLOT_COUNT }, (_, i) => normalizeSlot(slots?.[i]));
    try {
        localStorage.setItem(LOADOUT_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    try {
        document.documentElement.dispatchEvent(new CustomEvent("alysum-appearance-loadouts"));
    } catch {
        /* ignore */
    }
    return next;
}

export function saveAppearanceLoadoutToSlot(index, label) {
    const slots = readAppearanceLoadouts();
    if (index < 0 || index >= LOADOUT_SLOT_COUNT) return slots;
    slots[index] = captureAppearanceLoadout(label || "Saved");
    return writeAppearanceLoadouts(slots);
}

export function renameAppearanceLoadout(index, label) {
    const slots = readAppearanceLoadouts();
    if (index < 0 || index >= LOADOUT_SLOT_COUNT || !slots[index]) return slots;
    slots[index] = { ...slots[index], label: clipLabel(label) };
    return writeAppearanceLoadouts(slots);
}
