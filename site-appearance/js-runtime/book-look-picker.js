/**
 * Listing theme = Settings UI colors. Page background = Settings page backgrounds.
 * Title colors = Settings display title colors. Visit-only; callers persist.
 */
import { BODY_BG_PRESETS, getBodyBgPreview } from "./body-background.js";
import {
    DISPLAY_TEXT_COLORS,
    getColorPreview,
    getStoredCustomDisplayColors,
} from "./display-text-color.js?v=2";
import { paintChipInk } from "./text-ink.js";
import { UI_COLORS, getUiColorPreview } from "./ui-color.js";
import { GRADIENT_THEMES, getThemePreview } from "./gradient-theme.js";
import { resolveVisitBackgroundHex } from "./visit-page-look.js?v=10";

const TITLE_CHIPS = [
    { id: "", label: "Visitor", hint: "Reader’s Appearance title color" },
    ...DISPLAY_TEXT_COLORS,
];

const ACCENT_CHIPS = [
    { id: "", label: "Visitor", hint: "Leave hero and Start reading on listing look" },
    ...GRADIENT_THEMES,
];

const LEGACY_TO_UI = {
    dark: "default",
    alysum: "default",
    light: "ui-porcelain",
    sepia: "ui-linen",
};

function selectedLookId(look) {
    const id = String(look?.pageLook || "");
    if (id === "saved") return "";
    return LEGACY_TO_UI[id] || id;
}

function lookPreview(item, look) {
    if (item.id === "theme") {
        return getBodyBgPreview(look?.pageBgId)
            || resolveVisitBackgroundHex(look?.pageBgId, look?.pageBg)
            || getUiColorPreview("theme");
    }
    if (item.id === "custom" && look?.pageLookCustom) return look.pageLookCustom;
    return getUiColorPreview(item.id);
}

function paintChip(btn, preview) {
    if (!preview) return;
    btn.style.background = preview;
    paintChipInk(btn, preview);
}

function paintSwatches(root, look) {
    const row = root.querySelector("[data-book-look-swatches]");
    if (!row) return;
    const current = selectedLookId(look);
    row.innerHTML = "";
    UI_COLORS.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `book-look-swatch${item.id === current ? " is-on" : ""}`;
        btn.dataset.look = item.id;
        btn.title = item.hint || item.label;
        paintChip(btn, lookPreview(item, look));
        const label = document.createElement("span");
        label.textContent = item.label;
        btn.appendChild(label);
        row.appendChild(btn);
    });
    const custom = root.querySelector("[data-book-look-custom]");
    const color = root.querySelector("[data-book-look-color]");
    if (custom) custom.hidden = current !== "custom";
    if (color && look?.pageLookCustom) color.value = look.pageLookCustom;
}

function paintBgChips(root, look) {
    const row = root.querySelector("[data-book-bg-chips]");
    if (!row || row.dataset.ready === "1") {
        syncBgChips(root, look);
        return;
    }
    row.dataset.ready = "1";
    row.innerHTML = "";
    BODY_BG_PRESETS.forEach((preset) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "book-look-bg-chip";
        btn.dataset.bgId = preset.id;
        btn.title = preset.hint || preset.label;
        paintChip(btn, getBodyBgPreview(preset.id));
        const label = document.createElement("span");
        label.textContent = preset.label;
        btn.appendChild(label);
        row.appendChild(btn);
    });
    syncBgChips(root, look);
}

function syncBgChips(root, look) {
    const row = root.querySelector("[data-book-bg-chips]");
    const id = String(look?.pageBgId || "");
    row?.querySelectorAll(".book-look-bg-chip").forEach((btn) => {
        btn.classList.toggle("is-on", btn.dataset.bgId === id);
    });
    const custom = root.querySelector("[data-book-bg-custom]");
    const color = root.querySelector("[data-book-bg-color]");
    if (custom) custom.hidden = id !== "custom";
    if (color && look?.pageBg) color.value = look.pageBg;
    const customChip = row?.querySelector('[data-bg-id="custom"]');
    if (customChip && look?.pageBg) paintChip(customChip, look.pageBg);
}

function titlePreview(item, look) {
    if (item.id === "custom") {
        const main = look?.textColorMain || getStoredCustomDisplayColors().main;
        const accent = look?.textColorAccent || getStoredCustomDisplayColors().accent;
        return `linear-gradient(145deg, ${accent}, ${main})`;
    }
    if (!item.id) {
        return getColorPreview("theme");
    }
    return getColorPreview(item.id);
}

function paintTitleChips(root, look) {
    const row = root.querySelector("[data-book-title-swatches]");
    if (!row) return;
    const current = String(look?.textColor || "");
    row.innerHTML = "";
    TITLE_CHIPS.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `book-look-swatch${item.id === current ? " is-on" : ""}`;
        btn.dataset.titleId = item.id || "visitor";
        btn.title = item.hint || item.label;
        paintChip(btn, titlePreview(item, look));
        const label = document.createElement("span");
        label.textContent = item.label;
        btn.appendChild(label);
        row.appendChild(btn);
    });
    const custom = root.querySelector("[data-book-title-custom]");
    const main = root.querySelector("[data-book-title-main]");
    const accent = root.querySelector("[data-book-title-accent]");
    if (custom) custom.hidden = current !== "custom";
    if (main && look?.textColorMain) main.value = look.textColorMain;
    if (accent && look?.textColorAccent) accent.value = look.textColorAccent;
}

function paintAccentChips(root, look) {
    const row = root.querySelector("[data-book-accent-swatches]");
    if (!row) return;
    const current = String(look?.siteAccent || "");
    row.innerHTML = "";
    ACCENT_CHIPS.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `book-look-swatch${item.id === current ? " is-on" : ""}`;
        btn.dataset.accentId = item.id || "visitor";
        btn.title = item.hint || item.label;
        paintChip(btn, item.id ? getThemePreview(item.id) : getThemePreview("classic"));
        const label = document.createElement("span");
        label.textContent = item.label;
        btn.appendChild(label);
        row.appendChild(btn);
    });
}

export function paintBookLookPicker(root, look) {
    paintSwatches(root, look);
    paintBgChips(root, look);
    paintTitleChips(root, look);
    paintAccentChips(root, look);
}

export function readBookLookPicker(root) {
    const swatch = root.querySelector("[data-book-look-swatches] .is-on");
    const lookId = swatch?.dataset.look || "";
    const lookColor = root.querySelector("[data-book-look-color]");
    const bgChip = root.querySelector("[data-book-bg-chips] .is-on");
    const pageBgId = bgChip?.dataset.bgId || "";
    const color = root.querySelector("[data-book-bg-color]");
    const titleChip = root.querySelector("[data-book-title-swatches] .is-on");
    const titleId = titleChip ? String(titleChip.dataset.titleId || "") : "";
    const textColor = titleId === "visitor" ? "" : titleId;
    const titleMain = root.querySelector("[data-book-title-main]");
    const titleAccent = root.querySelector("[data-book-title-accent]");
    const accentChip = root.querySelector("[data-book-accent-swatches] .is-on");
    const accentId = accentChip ? String(accentChip.dataset.accentId || "") : "";
    const siteAccent = accentId === "visitor" ? "" : accentId;
    return {
        pageLook: lookId,
        pageLookSaved: null,
        pageLookCustom: lookId === "custom" ? (lookColor?.value || "") : "",
        pageBgId,
        pageBg: pageBgId === "custom" ? (color?.value || "") : "",
        textColor,
        textColorMain: textColor === "custom" ? (titleMain?.value || "") : "",
        textColorAccent: textColor === "custom" ? (titleAccent?.value || "") : "",
        siteAccent,
    };
}

export function bindBookLookPicker(root, { onChange } = {}) {
    function emit(next) {
        paintBookLookPicker(root, next);
        onChange?.(next);
    }
    root.querySelector("[data-book-look-swatches]")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-look]");
        if (!btn) return;
        event.stopPropagation();
        const current = readBookLookPicker(root);
        emit({
            ...current,
            pageLook: btn.dataset.look,
            pageLookSaved: null,
            pageLookCustom: btn.dataset.look === "custom"
                ? (root.querySelector("[data-book-look-color]")?.value || current.pageLookCustom || "#111827")
                : "",
        });
    });
    root.querySelector("[data-book-look-reset]")?.addEventListener("click", () => {
        const current = readBookLookPicker(root);
        emit({ ...current, pageLook: "alysum", pageLookSaved: null, pageLookCustom: "" });
    });
    root.querySelector("[data-book-look-all-reset]")?.addEventListener("click", () => {
        emit({
            pageLook: "alysum",
            pageLookSaved: null,
            pageLookCustom: "",
            pageBgId: "",
            pageBg: "",
            textColor: "",
            textColorMain: "",
            textColorAccent: "",
            siteAccent: "",
        });
    });
    root.querySelector("[data-book-look-color]")?.addEventListener("input", (event) => {
        const current = readBookLookPicker(root);
        emit({ ...current, pageLook: "custom", pageLookCustom: event.target.value });
    });
    root.querySelector("[data-book-bg-chips]")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-bg-id]");
        if (!btn) return;
        event.stopPropagation();
        const current = readBookLookPicker(root);
        const pageBgId = btn.dataset.bgId;
        emit({
            ...current,
            pageBgId,
            pageBg: pageBgId === "custom"
                ? (root.querySelector("[data-book-bg-color]")?.value || current.pageBg || "#0b1220")
                : "",
        });
    });
    root.querySelector("[data-book-bg-color]")?.addEventListener("input", (event) => {
        const current = readBookLookPicker(root);
        emit({ ...current, pageBgId: "custom", pageBg: event.target.value });
    });
    root.querySelector("[data-book-bg-reset]")?.addEventListener("click", () => {
        const current = readBookLookPicker(root);
        emit({ ...current, pageBgId: "", pageBg: "" });
    });
    root.querySelector("[data-book-title-swatches]")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-title-id]");
        if (!btn) return;
        event.stopPropagation();
        const current = readBookLookPicker(root);
        const textColor = String(btn.dataset.titleId || "") === "visitor"
            ? ""
            : String(btn.dataset.titleId || "");
        const stored = getStoredCustomDisplayColors();
        emit({
            ...current,
            textColor,
            textColorMain: textColor === "custom"
                ? (root.querySelector("[data-book-title-main]")?.value || current.textColorMain || stored.main)
                : "",
            textColorAccent: textColor === "custom"
                ? (root.querySelector("[data-book-title-accent]")?.value || current.textColorAccent || stored.accent)
                : "",
        });
    });
    root.querySelector("[data-book-title-main]")?.addEventListener("input", (event) => {
        const current = readBookLookPicker(root);
        emit({
            ...current,
            textColor: "custom",
            textColorMain: event.target.value,
            textColorAccent: current.textColorAccent || getStoredCustomDisplayColors().accent,
        });
    });
    root.querySelector("[data-book-title-accent]")?.addEventListener("input", (event) => {
        const current = readBookLookPicker(root);
        emit({
            ...current,
            textColor: "custom",
            textColorMain: current.textColorMain || getStoredCustomDisplayColors().main,
            textColorAccent: event.target.value,
        });
    });
    root.querySelector("[data-book-accent-swatches]")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-accent-id]");
        if (!btn) return;
        event.stopPropagation();
        const current = readBookLookPicker(root);
        const raw = String(btn.dataset.accentId || "");
        emit({
            ...current,
            siteAccent: raw === "visitor" ? "" : raw,
        });
    });
}
