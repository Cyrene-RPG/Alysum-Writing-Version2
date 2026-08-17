import { els } from "/js/settings/elements.js";
import {
    GRADIENT_THEMES,
    applyGradientTheme,
    applyChromeGradient,
    getStoredGradientThemeId,
    getThemePreview
} from "@alysum/site-appearance/gradient-theme.js";
import {
    DISPLAY_TEXT_STYLES,
    DISPLAY_TEXT_STYLE_META,
    DISPLAY_TEXT_FONT_GROUPS,
    applyDisplayTextStyle,
    getStoredDisplayTextStyleId,
    initDisplayTextStyleOnPage
} from "@alysum/site-appearance/display-text-style.js";
import {
    DISPLAY_TEXT_COLORS,
    applyDisplayTextColor,
    getStoredDisplayTextColorId,
    getStoredCustomDisplayColors,
    initDisplayTextColorOnPage,
    getColorPreview,
    getColorPreviewTextColor,
    resolveDisplayColorPair
} from "@alysum/site-appearance/display-text-color.js";
import {
    BODY_BG_PRESETS,
    applyBodyBackground,
    getStoredBodyBgId,
    getStoredCustomBodyBg,
    initBodyBackgroundOnPage,
    getBodyBgPreview,
    getAppearanceMixMode,
    setAppearanceMixMode,
    isAppearanceLinked,
    getMixableBodyBgPresets
} from "@alysum/site-appearance/body-background.js";
import {
    SURFACE_STYLES,
    applySurfaceStyle,
    getStoredSurfaceStyleId,
    initSurfaceStyleOnPage
} from "@alysum/site-appearance/surface-style.js";
import {
    applyUiColor,
    getStoredUiColorId,
    initUiColorOnPage
} from "@alysum/site-appearance/ui-color.js";
import {
    initUiColorPicker,
    setUiColorChipActive,
    refreshUiColorThemeChip,
    syncUiColorCustomPanelVisibility
} from "/js/settings/ui-colors.js";

export function setAvatarPreview(imageUrl, label) {
    if (!els.profileAvatarPreview || !els.profileAvatarPreviewWrap) return;
    const cleanUrl = String(imageUrl || "").trim();
    const initial = String(label || "A").trim()[0]?.toUpperCase() || "A";
    if (els.profileAvatarInitial) els.profileAvatarInitial.textContent = initial;

    if (cleanUrl) {
        els.profileAvatarPreview.src = cleanUrl;
        els.profileAvatarPreviewWrap.classList.remove("has-initial");
    } else {
        els.profileAvatarPreview.removeAttribute("src");
        els.profileAvatarPreviewWrap.classList.add("has-initial");
    }
}

export function initSurfaceStylePicker() {
    if (!els.glassChipRow || els.glassChipRow.dataset.ready === "1") return;
    els.glassChipRow.dataset.ready = "1";
    els.glassChipRow.innerHTML = "";
    const cur = getStoredSurfaceStyleId();
    SURFACE_STYLES.forEach((style) => {
        const b = document.createElement("button");
        b.type = "button";
        let cls = "theme-chip" + (style.id === cur ? " active" : "");
        if (style.preview) {
            cls += " has-preview";
            b.style.background = style.preview;
        }
        if (style.id === "glass") cls += " surface-chip--glass";
        b.className = cls;
        b.dataset.surface = style.id;
        b.textContent = style.label;
        b.title = style.hint || "";
        b.addEventListener("click", () => {
            applySurfaceStyle(style.id);
            els.glassChipRow.querySelectorAll(".theme-chip").forEach((x) => {
                x.classList.remove("active");
            });
            b.classList.add("active");
        });
        els.glassChipRow.appendChild(b);
    });
}

export function initThemePicker() {
    if (!els.themeChipRow || els.themeChipRow.dataset.ready === "1") return;
    els.themeChipRow.dataset.ready = "1";
    els.themeChipRow.innerHTML = "";
    const cur = getStoredGradientThemeId();
    GRADIENT_THEMES.forEach(t => {
        const b = document.createElement("button");
        b.type = "button";
        let cls = "theme-chip" + (t.id === cur ? " active" : "");
        if (t.preview) {
            cls += " has-preview";
            b.style.background = t.preview;
        }
        b.className = cls;
        b.dataset.theme = t.id;
        b.textContent = t.label;
        b.title = t.hint || "";
        b.addEventListener("click", () => {
            applyGradientTheme(t.id);
            applyChromeGradient(t.preview || getThemePreview(t.id));
            if (isAppearanceLinked()) {
                applyBodyBackground("theme");
                refreshBodyBgThemeChip();
                setBodyBgChipActive("theme");
                applyDisplayTextColor("theme");
                setTextColorChipActive("theme");
                applyUiColor("theme");
                setUiColorChipActive("theme");
                refreshUiColorThemeChip();
            } else {
                if (getStoredDisplayTextColorId() === "theme") {
                    applyDisplayTextColor("theme");
                }
                if (getStoredBodyBgId() === "theme") {
                    applyBodyBackground("theme");
                    refreshBodyBgThemeChip();
                }
                if (getStoredUiColorId() === "theme") {
                    applyUiColor("theme");
                    refreshUiColorThemeChip();
                }
            }
            els.themeChipRow.querySelectorAll(".theme-chip").forEach((x) => {
                x.classList.remove("active");
            });
            b.classList.add("active");
        });
        els.themeChipRow.appendChild(b);
    });
}

export function createFontStyleChip(style, activeId) {
    const meta = DISPLAY_TEXT_STYLE_META[style.id] || {};
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-chip text-style-chip" + (style.id === activeId ? " active" : "");
    b.dataset.style = style.id;
    b.title = style.hint || meta.hint || "";

    const preview = document.createElement("span");
    preview.className = "text-style-chip-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.textContent = "Aa";
    if (meta.fontFamily) {
        preview.style.fontFamily = meta.fontFamily;
        preview.style.fontWeight = String(meta.weight || 700);
        if (meta.caps) preview.style.textTransform = "uppercase";
    }

    const label = document.createElement("span");
    label.className = "text-style-chip-label";
    label.textContent = style.label;

    b.append(preview, label);
    b.addEventListener("click", () => {
        applyDisplayTextStyle(style.id);
        els.textStyleChipRow.querySelectorAll(".theme-chip").forEach((x) => {
            x.classList.remove("active");
        });
        b.classList.add("active");
    });
    return b;
}

export function initTextStylePicker() {
    if (!els.textStyleChipRow || els.textStyleChipRow.dataset.ready === "1") return;
    els.textStyleChipRow.dataset.ready = "1";
    els.textStyleChipRow.innerHTML = "";
    const cur = getStoredDisplayTextStyleId();

    const groups = Array.isArray(DISPLAY_TEXT_FONT_GROUPS) && DISPLAY_TEXT_FONT_GROUPS.length
        ? DISPLAY_TEXT_FONT_GROUPS
        : [{ id: "all", label: "Title fonts" }];

    groups.forEach((group) => {
        const styles = group.id === "all"
            ? DISPLAY_TEXT_STYLES
            : DISPLAY_TEXT_STYLES.filter(
                  (s) => (DISPLAY_TEXT_STYLE_META[s.id] || {}).category === group.id
              );
        if (!styles.length) return;

        if (group.id !== "all") {
            const heading = document.createElement("div");
            heading.className = "font-group-label";
            heading.textContent = group.label;
            els.textStyleChipRow.appendChild(heading);
        }

        styles.forEach((s) => {
            els.textStyleChipRow.appendChild(createFontStyleChip(s, cur));
        });
    });
}

export function initAppearancePickers() {
    try {
        bindAppearanceMixControls();
        initSurfaceStylePicker();
        initThemePicker();
        initBodyBgPicker();
        initUiColorPicker();
        initTextStylePicker();
        initTextColorPicker();
        syncAppearanceMixModeUi();
    } catch (err) {
        console.error("Appearance pickers failed:", err);
    }
}

export function titleColorPreviewMain(color) {
    if (color.main) return color.main;
    if (color.id === "custom") return getStoredCustomDisplayColors().main;
    if (color.id === "theme") return resolveDisplayColorPair("theme").main;
    return "#f59e0b";
}

export function syncCustomColorPanelVisibility(colorId) {
    if (!els.displayColorCustom) return;
    const show = colorId === "custom";
    els.displayColorCustom.hidden = !show;
    els.displayColorCustom.classList.toggle("is-visible", show);
}

export function bindCustomColorInputs() {
    if (!els.displayColorMain || !els.displayColorAccent || els.displayColorMain.dataset.bound === "1") return;
    els.displayColorMain.dataset.bound = "1";
    const custom = getStoredCustomDisplayColors();
    els.displayColorMain.value = custom.main;
    els.displayColorAccent.value = custom.accent;
    const refreshCustomColorChip = () => {
        const customBtn = els.textColorChipRow?.querySelector('[data-style="custom"]');
        if (!customBtn) return;
        const main = els.displayColorMain.value;
        const accent = els.displayColorAccent.value;
        customBtn.style.background = `linear-gradient(145deg, ${accent}, ${main})`;
        const aa = customBtn.querySelector(".text-style-chip-preview");
        if (aa) aa.style.color = getColorPreviewTextColor(main);
    };
    const onCustomChange = () => {
        if (getStoredDisplayTextColorId() !== "custom") return;
        applyDisplayTextColor("custom", els.displayColorMain.value, els.displayColorAccent.value);
        refreshCustomColorChip();
    };
    els.displayColorMain.addEventListener("input", onCustomChange);
    els.displayColorAccent.addEventListener("input", onCustomChange);
}

export function initTextColorPicker() {
    if (!els.textColorChipRow || els.textColorChipRow.dataset.ready === "1") return;
    els.textColorChipRow.dataset.ready = "1";
    els.textColorChipRow.innerHTML = "";
    const cur = getStoredDisplayTextColorId();
    DISPLAY_TEXT_COLORS.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        let cls = "theme-chip title-color-chip" + (c.id === cur ? " active" : "");
        const preview = getColorPreview(c.id);
        if (preview) {
            cls += " has-preview";
            b.style.background = preview;
        }
        b.className = cls;
        b.dataset.style = c.id;
        b.title = c.hint || "";
        const previewEl = document.createElement("span");
        previewEl.className = "text-style-chip-preview";
        previewEl.setAttribute("aria-hidden", "true");
        previewEl.textContent = "Aa";
        previewEl.style.color = getColorPreviewTextColor(titleColorPreviewMain(c));

        const labelEl = document.createElement("span");
        labelEl.className = "text-style-chip-label";
        labelEl.textContent = c.label;

        b.append(previewEl, labelEl);
        b.addEventListener("click", () => {
            if (c.id === "custom") {
                const main = els.displayColorMain?.value || getStoredCustomDisplayColors().main;
                const accent = els.displayColorAccent?.value || getStoredCustomDisplayColors().accent;
                applyDisplayTextColor("custom", main, accent);
            } else {
                applyDisplayTextColor(c.id);
            }
            els.textColorChipRow.querySelectorAll(".theme-chip").forEach((x) => {
                x.classList.remove("active");
            });
            b.classList.add("active");
            syncCustomColorPanelVisibility(c.id);
        });
        els.textColorChipRow.appendChild(b);
    });
    syncCustomColorPanelVisibility(cur);
    bindCustomColorInputs();
}

export function syncBodyBgCustomPanelVisibility(bgId) {
    if (!els.bodyBgCustom) return;
    const show = bgId === "custom";
    els.bodyBgCustom.hidden = !show;
    els.bodyBgCustom.classList.toggle("is-visible", show);
}

export function bindBodyBgCustomInput() {
    if (!els.bodyBgColor || els.bodyBgColor.dataset.bound === "1") return;
    els.bodyBgColor.dataset.bound = "1";
    els.bodyBgColor.value = getStoredCustomBodyBg();
    const refreshCustomBgChip = () => {
        const customBtn = els.bodyBgChipRow?.querySelector('[data-style="custom"]');
        if (!customBtn) return;
        customBtn.style.background = getBodyBgPreview("custom");
    };
    els.bodyBgColor.addEventListener("input", () => {
        if (getStoredBodyBgId() !== "custom") return;
        applyBodyBackground("custom", els.bodyBgColor.value);
        refreshCustomBgChip();
    });
}

export function syncAppearanceMixModeUi() {
    const linked = isAppearanceLinked();
    if (els.appearanceMixLinked) els.appearanceMixLinked.checked = linked;
    if (els.appearanceMixFree) els.appearanceMixFree.checked = !linked;
}

export function bindAppearanceMixControls() {
    if (els.appearanceMixLinked?.dataset.bound === "1") return;
    if (els.appearanceMixLinked) els.appearanceMixLinked.dataset.bound = "1";
    syncAppearanceMixModeUi();

    els.appearanceMixLinked?.addEventListener("change", () => {
        if (!els.appearanceMixLinked.checked) return;
        setAppearanceMixMode("linked");
        applyBodyBackground("theme");
        applyDisplayTextColor("theme");
        setBodyBgChipActive("theme");
        setTextColorChipActive("theme");
        applyUiColor("theme");
        setUiColorChipActive("theme");
        syncBodyBgCustomPanelVisibility("theme");
        syncCustomColorPanelVisibility("theme");
        syncUiColorCustomPanelVisibility("theme");
        refreshBodyBgThemeChip();
        refreshUiColorThemeChip();
    });

    els.appearanceMixFree?.addEventListener("change", () => {
        if (!els.appearanceMixFree?.checked) return;
        setAppearanceMixMode("free");
    });

    els.appearanceMixShuffle?.addEventListener("click", () => {
        setAppearanceMixMode("free");
        syncAppearanceMixModeUi();
        const accents = GRADIENT_THEMES;
        const bgs = getMixableBodyBgPresets();
        const accent = accents[Math.floor(Math.random() * accents.length)];
        let bg = bgs[Math.floor(Math.random() * bgs.length)];
        if (bgs.length > 1 && bg.id === accent.id) {
            bg = bgs[(bgs.indexOf(bg) + 1) % bgs.length];
        }
        applyGradientTheme(accent.id);
        applyChromeGradient(accent.preview || getThemePreview(accent.id));
        applyBodyBackground(bg.id);
        applyDisplayTextColor("theme");
        els.themeChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
            x.classList.toggle("active", x.dataset.theme === accent.id);
        });
        setBodyBgChipActive(bg.id);
        setTextColorChipActive("theme");
        setUiColorChipActive("theme");
        applyUiColor("theme");
        syncBodyBgCustomPanelVisibility(bg.id);
        syncCustomColorPanelVisibility("theme");
        syncUiColorCustomPanelVisibility("theme");
        refreshUiColorThemeChip();
    });
}

export function setBodyBgChipActive(id) {
    els.bodyBgChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.style === id);
    });
}

export function setTextColorChipActive(id) {
    els.textColorChipRow?.querySelectorAll(".theme-chip").forEach((x) => {
        x.classList.toggle("active", x.dataset.style === id);
    });
}

export function refreshBodyBgThemeChip() {
    const themeBtn = els.bodyBgChipRow?.querySelector('[data-style="theme"]');
    if (!themeBtn) return;
    themeBtn.style.background = getBodyBgPreview("theme");
}

export function initBodyBgPicker() {
    if (!els.bodyBgChipRow || els.bodyBgChipRow.dataset.ready === "1") return;
    els.bodyBgChipRow.dataset.ready = "1";
    els.bodyBgChipRow.innerHTML = "";
    const cur = getStoredBodyBgId();
    BODY_BG_PRESETS.forEach((p) => {
        const b = document.createElement("button");
        b.type = "button";
        let cls = "theme-chip title-color-chip" + (p.id === cur ? " active" : "");
        const preview = getBodyBgPreview(p.id);
        if (preview) {
            cls += " has-preview";
            b.style.background = preview;
        }
        if (p.tone === "light") cls += " is-light";
        b.className = cls;
        b.dataset.style = p.id;
        b.title = p.hint || "";
        const labelEl = document.createElement("span");
        labelEl.className = "text-style-chip-label";
        labelEl.textContent = p.label;
        b.append(labelEl);
        b.addEventListener("click", () => {
            if (p.id === "custom") {
                const color = els.bodyBgColor?.value || getStoredCustomBodyBg();
                applyBodyBackground("custom", color);
                setAppearanceMixMode("free");
                syncAppearanceMixModeUi();
            } else if (p.id === "theme") {
                applyBodyBackground("theme");
                setAppearanceMixMode("linked");
                syncAppearanceMixModeUi();
            } else if (p.id === "default") {
                applyBodyBackground("default");
            } else {
                applyBodyBackground(p.id);
                setAppearanceMixMode("free");
                syncAppearanceMixModeUi();
            }
            els.bodyBgChipRow.querySelectorAll(".theme-chip").forEach((x) => {
                x.classList.remove("active");
            });
            b.classList.add("active");
            syncBodyBgCustomPanelVisibility(p.id);
        });
        els.bodyBgChipRow.appendChild(b);
    });
    syncBodyBgCustomPanelVisibility(cur);
    bindBodyBgCustomInput();
}

initDisplayTextStyleOnPage();
initDisplayTextColorOnPage();
initBodyBackgroundOnPage();
initSurfaceStyleOnPage();
initUiColorOnPage();
initAppearancePickers();
