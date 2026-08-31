/**
 * Listing theme swatches + Settings-style background chips. Visit-only; callers persist.
 */
import { readAppearanceLoadouts } from "./appearance-loadout.js";
import { BODY_BG_PRESETS, getBodyBgPreview } from "./body-background.js";
import { paintChipInk } from "./text-ink.js";
import {
    BOOK_LOOK_BUILTINS,
    resolveVisitBackgroundHex,
} from "./visit-page-look.js";

function snapshotFromSlot(slot) {
    if (!slot) return null;
    return {
        label: slot.label || "",
        gradientTheme: slot.gradientTheme || "",
        bodyBg: slot.bodyBg || "",
        bodyBgCustom: slot.bodyBgCustom || "",
        uiColor: slot.uiColor || "",
        uiColorCustom: slot.uiColorCustom || "",
        textColor: slot.textColor || "",
        textColorMain: slot.textColorMain || "",
        textColorAccent: slot.textColorAccent || "",
    };
}

function paintSwatches(root, look) {
    const row = root.querySelector("[data-book-look-swatches]");
    if (!row) return;
    const current = String(look?.pageLook || "");
    const savedLabel = look?.pageLookSaved?.label || "";
    const slots = readAppearanceLoadouts().filter(Boolean);
    const items = [
        ...BOOK_LOOK_BUILTINS.map((item) => ({ ...item, saved: null })),
        ...slots.map((slot) => ({
            id: "saved",
            label: slot.label || "Saved",
            saved: snapshotFromSlot(slot),
        })),
    ];
    row.innerHTML = items.map((item) => {
        const on = item.id === current
            && (item.id !== "saved" || !savedLabel || item.label === savedLabel);
        return `<button type="button" class="book-look-swatch${on ? " is-on" : ""}" data-look="${item.id}" data-label="${item.label}">${item.label}</button>`;
    }).join("");
    row._saved = items.filter((item) => item.saved).reduce((map, item) => {
        map[item.label] = item.saved;
        return map;
    }, {});
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
        const preview = getBodyBgPreview(preset.id);
        if (preview) {
            btn.style.background = preview;
            paintChipInk(btn, preview);
        }
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
    if (customChip && look?.pageBg) {
        customChip.style.background = look.pageBg;
        paintChipInk(customChip, look.pageBg);
    }
}

export function paintBookLookPicker(root, look) {
    paintSwatches(root, look);
    paintBgChips(root, look);
}

export function readBookLookPicker(root) {
    const swatch = root.querySelector("[data-book-look-swatches] .is-on");
    const lookId = swatch?.dataset.look || "";
    const savedMap = root.querySelector("[data-book-look-swatches]")?._saved || {};
    const bgChip = root.querySelector("[data-book-bg-chips] .is-on");
    const pageBgId = bgChip?.dataset.bgId || "";
    const color = root.querySelector("[data-book-bg-color]");
    return {
        pageLook: lookId,
        pageLookSaved: lookId === "saved" ? savedMap[swatch?.dataset.label] || null : null,
        pageBgId,
        pageBg: pageBgId === "custom" ? (color?.value || "") : "",
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
        const current = readBookLookPicker(root);
        const savedMap = root.querySelector("[data-book-look-swatches]")?._saved || {};
        emit({
            ...current,
            pageLook: btn.dataset.look,
            pageLookSaved: btn.dataset.look === "saved" ? savedMap[btn.dataset.label] || null : null,
        });
    });
    root.querySelector("[data-book-look-reset]")?.addEventListener("click", () => {
        const current = readBookLookPicker(root);
        emit({ ...current, pageLook: "", pageLookSaved: null });
    });
    root.querySelector("[data-book-bg-chips]")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-bg-id]");
        if (!btn) return;
        const current = readBookLookPicker(root);
        const pageBgId = btn.dataset.bgId;
        emit({
            ...current,
            pageBgId,
            pageBg: pageBgId === "custom"
                ? (root.querySelector("[data-book-bg-color]")?.value || resolveVisitBackgroundHex("custom", current.pageBg) || "#0b1220")
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
}
