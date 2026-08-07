import {
    DEFAULT_FONT_ID,
    DEFAULT_FONT_SIZE_PX,
    fontStackForId,
    normalizeFontId,
    normalizeFontSize,
} from "./editor-font-catalog.js";

function readChapterField(chapter, camel, snake) {
    if (!chapter || typeof chapter !== "object") return "";
    const value = chapter[camel] ?? chapter[snake];
    return value == null ? "" : String(value).trim();
}

/** @param {object | null | undefined} chapter */
export function chapterTypography(chapter) {
    const fontRaw = readChapterField(chapter, "defaultFont", "default_font");
    const sizeRaw = readChapterField(chapter, "defaultFontSize", "default_font_size");
    return {
        fontId: fontRaw ? normalizeFontId(fontRaw) : "",
        fontSizePx: sizeRaw ? normalizeFontSize(sizeRaw) : "",
    };
}

/** @param {HTMLElement | null | undefined} el @param {object | null | undefined} chapter */
export function applyChapterTypographyStyles(el, chapter) {
    if (!el) return;
    const { fontId, fontSizePx } = chapterTypography(chapter);
    if (fontId) {
        el.style.fontFamily = fontStackForId(fontId);
    } else {
        el.style.removeProperty("font-family");
    }
    if (fontSizePx) {
        el.style.fontSize = `${fontSizePx}px`;
    } else {
        el.style.removeProperty("font-size");
    }
    if (fontId || fontSizePx) {
        el.style.lineHeight = "1.7";
    }
}

/** @param {object | null | undefined} chapter @param {string} fallbackFontId */
export function resolveEditorChapterFontId(chapter, fallbackFontId = DEFAULT_FONT_ID) {
    const saved = chapterTypography(chapter).fontId;
    return saved || normalizeFontId(fallbackFontId);
}

/** @param {object | null | undefined} chapter @param {string | number} fallbackSizePx */
export function resolveEditorChapterFontSize(chapter, fallbackSizePx = DEFAULT_FONT_SIZE_PX) {
    const saved = chapterTypography(chapter).fontSizePx;
    return saved || normalizeFontSize(fallbackSizePx);
}

/** @param {object | null | undefined} chapter */
export function chapterTypographyPayload(chapter) {
    const { fontId, fontSizePx } = chapterTypography(chapter);
    const payload = {};
    if (fontId) payload.defaultFont = fontId;
    if (fontSizePx) payload.defaultFontSize = fontSizePx;
    return payload;
}

/** @param {object} chapter @param {{ fontId?: string, fontSizePx?: string | number }} values */
export function writeChapterTypography(chapter, values = {}) {
    if (!chapter || typeof chapter !== "object") return;
    if (values.fontId != null) {
        chapter.defaultFont = normalizeFontId(values.fontId);
    }
    if (values.fontSizePx != null) {
        chapter.defaultFontSize = normalizeFontSize(values.fontSizePx);
    }
}
