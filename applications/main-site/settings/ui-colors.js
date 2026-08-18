import { els } from "/js/settings/elements.js";
import {
    UI_COLORS,
    applyUiColor,
    getStoredUiColorId,
    getStoredCustomUiColor,
    getUiColorPreview
} from "@alysum/site-appearance/ui-color.js";
import { paintChipInk } from "@alysum/site-appearance/text-ink.js";

export function setUiColorChipActive(id) {
    els.uiColorChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.style === id);
    });
}

export function refreshUiColorThemeChip() {
    const themeBtn = els.uiColorChipRow?.querySelector('[data-style="theme"]');
    if (!themeBtn) return;
    themeBtn.style.background = getUiColorPreview("theme");
    paintChipInk(themeBtn, getUiColorPreview("theme"));
}

export function syncUiColorCustomPanelVisibility(colorId) {
    if (!els.uiColorCustom) return;
    const show = colorId === "custom";
    els.uiColorCustom.hidden = !show;
    els.uiColorCustom.classList.toggle("is-visible", show);
}

function bindCustomUiColorInput() {
    if (!els.uiColorPicker || els.uiColorPicker.dataset.bound === "1") return;
    els.uiColorPicker.dataset.bound = "1";
    els.uiColorPicker.value = getStoredCustomUiColor();
    els.uiColorPicker.addEventListener("input", () => {
        if (getStoredUiColorId() !== "custom") return;
        applyUiColor("custom", els.uiColorPicker.value);
        const customBtn = els.uiColorChipRow?.querySelector('[data-style="custom"]');
        if (customBtn) {
            customBtn.style.background = els.uiColorPicker.value;
            paintChipInk(customBtn, els.uiColorPicker.value);
        }
    });
}

export function initUiColorPicker() {
    if (!els.uiColorChipRow || els.uiColorChipRow.dataset.ready === "1") return;
    els.uiColorChipRow.dataset.ready = "1";
    els.uiColorChipRow.innerHTML = "";
    const cur = getStoredUiColorId();
    UI_COLORS.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        let cls = "theme-chip title-color-chip" + (c.id === cur ? " active" : "");
        const preview = getUiColorPreview(c.id);
        if (preview) {
            cls += " has-preview";
            b.style.background = preview;
        }
        b.className = cls;
        b.dataset.style = c.id;
        b.title = c.hint || "";
        const labelEl = document.createElement("span");
        labelEl.className = "text-style-chip-label";
        labelEl.textContent = c.label;
        b.append(labelEl);
        paintChipInk(b, preview || c.color || "#111827");
        b.addEventListener("click", () => {
            if (c.id === "custom") {
                applyUiColor("custom", els.uiColorPicker?.value || getStoredCustomUiColor());
            } else {
                applyUiColor(c.id);
            }
            els.uiColorChipRow.querySelectorAll(".theme-chip").forEach((x) => {
                x.classList.remove("active");
            });
            b.classList.add("active");
            syncUiColorCustomPanelVisibility(c.id);
        });
        els.uiColorChipRow.appendChild(b);
    });
    syncUiColorCustomPanelVisibility(cur);
    bindCustomUiColorInput();
}
