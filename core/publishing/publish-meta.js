/**
 * Shared publish draft on books.publish_meta. Preview and Publish read/write this.
 */
import { normalizeCrop } from "./cover-upload.js";
import { normalizeGenreList } from "./genres.js";

export const CONTENT_WARNINGS = [
    "Graphic Violence",
    "Explicit Sexual Content",
    "Death",
    "Self-harm",
];

export const RATINGS = [
    { id: "general", label: "General Audiences" },
    { id: "teen", label: "Teen & Up" },
    { id: "mature", label: "Mature" },
    { id: "explicit", label: "Explicit" },
];

function asStringList(value) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asIdList(value) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function normalizeHexColor(value) {
    const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toLowerCase()}` : "";
}

export const PAGE_LOOKS = ["dark", "sepia", "light", "alysum", "saved"];

export function normalizePageLook(value) {
    const id = String(value || "").trim();
    return PAGE_LOOKS.includes(id) ? id : "";
}

export function normalizePageLookSaved(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
        label: String(value.label || "").trim().slice(0, 24),
        gradientTheme: String(value.gradientTheme || ""),
        bodyBg: String(value.bodyBg || ""),
        bodyBgCustom: normalizeHexColor(value.bodyBgCustom),
        uiColor: String(value.uiColor || ""),
        uiColorCustom: normalizeHexColor(value.uiColorCustom),
        textColor: String(value.textColor || ""),
        textColorMain: normalizeHexColor(value.textColorMain),
        textColorAccent: normalizeHexColor(value.textColorAccent),
    };
}

export function normalizePageBgId(value) {
    const id = String(value || "").trim();
    return /^[a-z0-9-]{1,40}$/i.test(id) ? id : "";
}

export function readPublishDraft(book) {
    const raw = book?.publish_meta && typeof book.publish_meta === "object" && !Array.isArray(book.publish_meta)
        ? book.publish_meta
        : {};
    const posted = asIdList(book?.published_chapter_ids);
    const draft = asIdList(raw.draftChapterIds);
    const genres = normalizeGenreList(raw);
    return {
        author: String(raw.author || ""),
        synopsis: String(raw.synopsis || ""),
        tags: asStringList(raw.tags),
        warnings: asStringList(raw.warnings),
        cover_url: String(raw.cover_url || raw.coverUrl || ""),
        coverCrop: normalizeCrop(raw.coverCrop || raw.cover_crop),
        coverMini: normalizeCrop(raw.coverMini || raw.cover_mini),
        coverWide: normalizeCrop(raw.coverWide || raw.cover_wide),
        coverWideEnabled: Boolean(raw.coverWideEnabled ?? raw.cover_wide_enabled),
        genre: genres[0] || "",
        genres,
        rating: String(raw.rating || ""),
        notesBefore: String(raw.notesBefore || raw.notes_before || ""),
        complete: Boolean(raw.complete),
        draftChapterIds: draft.length ? draft : posted,
        pageLook: normalizePageLook(raw.pageLook || raw.page_look),
        pageLookSaved: normalizePageLookSaved(raw.pageLookSaved || raw.page_look_saved),
        pageBgId: normalizePageBgId(raw.pageBgId || raw.page_bg_id)
            || (normalizeHexColor(raw.pageBg || raw.page_bg) ? "custom" : ""),
        pageBg: normalizeHexColor(raw.pageBg || raw.page_bg),
    };
}

export function mergePublishMeta(existing, patch) {
    const base = existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...existing }
        : {};
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
    return { ...base, ...patch };
}
