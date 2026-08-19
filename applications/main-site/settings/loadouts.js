import { els } from "/js/settings/elements.js";
import {
    LOADOUT_NAME_MAX,
    applyAppearanceLoadout,
    getLoadoutPreview,
    readAppearanceLoadouts,
    renameAppearanceLoadout,
    saveAppearanceLoadoutToSlot
} from "@alysum/site-appearance/js-runtime/appearance-loadout.js?v=3";
import { alysumConfirm, alysumPrompt } from "/js/prompt.js?v=2";
import { getAppearanceMixMode, getBodyBgPreview, getStoredBodyBgId, getStoredCustomBodyBg } from "@alysum/site-appearance/js-runtime/body-background.js";
import { getStoredGradientThemeId } from "@alysum/site-appearance/js-runtime/gradient-theme.js";
import { getStoredSurfaceStyleId } from "@alysum/site-appearance/js-runtime/surface-style.js";
import { getStoredCornerStyleId } from "@alysum/site-appearance/js-runtime/corner-style.js";
import { getStoredDisplayTextStyleId } from "@alysum/site-appearance/js-runtime/display-text-style.js";
import { getStoredCustomDisplayColors, getStoredDisplayTextColorId } from "@alysum/site-appearance/js-runtime/display-text-color.js";
import { getStoredCustomUiColor, getStoredUiColorId } from "@alysum/site-appearance/js-runtime/ui-color.js";
import { paintChipInk } from "@alysum/site-appearance/js-runtime/text-ink.js";
import {
    refreshUiColorThemeChip,
    setUiColorChipActive,
    syncUiColorCustomPanelVisibility
} from "/js/settings/ui-colors.js";

let arming = false;
let msgTimer = 0;

function setArming(next) {
    arming = next;
    els.appearanceLoadoutSlots?.classList.toggle("is-arming", arming);
    els.appearanceLoadoutSave?.classList.toggle("is-arming", arming);
    els.appearanceLoadoutSave?.setAttribute("aria-pressed", arming ? "true" : "false");
    renderLoadoutSlots();
}

function showLoadoutMsg(text) {
    if (!els.appearanceLoadoutMsg) return;
    els.appearanceLoadoutMsg.hidden = !text;
    els.appearanceLoadoutMsg.textContent = text || "";
    window.clearTimeout(msgTimer);
    if (text) {
        msgTimer = window.setTimeout(() => {
            if (els.appearanceLoadoutMsg) {
                els.appearanceLoadoutMsg.hidden = true;
                els.appearanceLoadoutMsg.textContent = "";
            }
        }, 2600);
    }
}

function syncPickersFromStorage() {
    const themeId = getStoredGradientThemeId();
    const bodyId = getStoredBodyBgId();
    const uiId = getStoredUiColorId();
    const surfaceId = getStoredSurfaceStyleId();
    const cornerId = getStoredCornerStyleId();
    const fontId = getStoredDisplayTextStyleId();
    const colorId = getStoredDisplayTextColorId();
    const customText = getStoredCustomDisplayColors();

    els.themeChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.theme === themeId);
    });
    els.bodyBgChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.style === bodyId);
    });
    els.glassChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.surface === surfaceId);
    });
    els.cornerChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.corner === cornerId);
    });
    els.textStyleChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.style === fontId);
    });
    els.textColorChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.style === colorId);
    });
    setUiColorChipActive(uiId);

    if (els.bodyBgCustom) {
        const show = bodyId === "custom";
        els.bodyBgCustom.hidden = !show;
        els.bodyBgCustom.classList.toggle("is-visible", show);
    }
    if (els.displayColorCustom) {
        const show = colorId === "custom";
        els.displayColorCustom.hidden = !show;
        els.displayColorCustom.classList.toggle("is-visible", show);
    }
    syncUiColorCustomPanelVisibility(uiId);
    refreshUiColorThemeChip();
    const themeBtn = els.bodyBgChipRow?.querySelector('[data-style="theme"]');
    if (themeBtn) {
        const preview = getBodyBgPreview("theme");
        themeBtn.style.background = preview;
        paintChipInk(themeBtn, preview);
    }

    if (els.bodyBgColor) els.bodyBgColor.value = getStoredCustomBodyBg();
    if (els.uiColorPicker) els.uiColorPicker.value = getStoredCustomUiColor();
    if (els.displayColorMain) els.displayColorMain.value = customText.main;
    if (els.displayColorAccent) els.displayColorAccent.value = customText.accent;

    const linked = getAppearanceMixMode() !== "free";
    if (els.appearanceMixLinked) els.appearanceMixLinked.checked = linked;
    if (els.appearanceMixFree) els.appearanceMixFree.checked = !linked;
}

async function askLoadoutName(current) {
    const next = await alysumPrompt("Name this look", current || "Saved", {
        maxLength: LOADOUT_NAME_MAX,
        confirmLabel: "Save"
    });
    if (next == null) return null;
    return next.trim().slice(0, LOADOUT_NAME_MAX) || "Saved";
}

function renderLoadoutSlots() {
    if (!els.appearanceLoadoutSlots) return;
    const slots = readAppearanceLoadouts();
    els.appearanceLoadoutSlots.innerHTML = "";
    slots.forEach((slot, index) => {
        const filled = Boolean(slot);
        const cell = document.createElement("div");
        cell.className = "appearance-loadout-cell";

        const b = document.createElement("button");
        b.type = "button";
        b.className = "appearance-loadout-slot" + (filled ? "" : " is-empty");
        b.dataset.slot = String(index);
        if (filled) {
            const preview = getLoadoutPreview(slot);
            if (preview) b.style.background = preview;
        }
        const name = document.createElement("span");
        name.className = "appearance-loadout-slot-label";
        name.textContent = filled ? slot.label : "Empty";
        b.append(name);
        if (filled) paintChipInk(b, getLoadoutPreview(slot) || "#111827");
        const n = index + 1;
        b.setAttribute(
            "aria-label",
            arming
                ? filled
                    ? `Overwrite slot ${n}, ${slot.label}`
                    : `Save to empty slot ${n}`
                : filled
                  ? `Apply ${slot.label}`
                  : `Empty slot ${n}`
        );
        b.addEventListener("click", () => {
            void onSlotClick(index, filled);
        });
        cell.appendChild(b);

        if (filled && !arming) {
            const renameBtn = document.createElement("button");
            renameBtn.type = "button";
            renameBtn.className = "appearance-loadout-rename";
            renameBtn.title = "Rename";
            renameBtn.setAttribute("aria-label", `Rename ${slot.label}`);
            renameBtn.textContent = "Rename";
            renameBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                void renameSlot(index, slot.label);
            });
            cell.appendChild(renameBtn);
        }

        els.appearanceLoadoutSlots.appendChild(cell);
    });
}

async function renameSlot(index, current) {
    const next = await askLoadoutName(current);
    if (next == null) return;
    renameAppearanceLoadout(index, next);
    renderLoadoutSlots();
    showLoadoutMsg("Renamed");
}

async function onSlotClick(index, filled) {
    if (arming) {
        if (filled && !(await alysumConfirm("Do you want to overwrite?"))) return;
        const slots = readAppearanceLoadouts();
        const name = await askLoadoutName(filled ? slots[index]?.label : "Saved");
        if (name == null) return;
        saveAppearanceLoadoutToSlot(index, name);
        setArming(false);
        showLoadoutMsg("Successfully saved");
        return;
    }
    if (!filled) {
        showLoadoutMsg("This slot is empty");
        return;
    }
    const slots = readAppearanceLoadouts();
    if (!applyAppearanceLoadout(slots[index])) return;
    syncPickersFromStorage();
}

export function initAppearanceLoadouts() {
    if (!els.appearanceLoadoutSlots || els.appearanceLoadoutSlots.dataset.ready === "1") return;
    els.appearanceLoadoutSlots.dataset.ready = "1";
    renderLoadoutSlots();

    els.appearanceLoadoutSave?.addEventListener("click", () => {
        setArming(!arming);
        showLoadoutMsg(arming ? "Click a slot to save" : "");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && arming) {
            setArming(false);
            showLoadoutMsg("");
        }
    });

    document.documentElement.addEventListener("alysum-appearance-loadout-applied", () => {
        syncPickersFromStorage();
        renderLoadoutSlots();
    });
}
