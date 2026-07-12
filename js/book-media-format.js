/**
 * Book media format helpers — novel vs manga/comic/manhwa.
 */

export const MEDIA_FORMAT_NOVEL = "novel";
export const MEDIA_FORMAT_MANGA = "manga";
export const MEDIA_FORMAT_COMIC = "comic";
export const MEDIA_FORMAT_MANHWA = "manhwa";

export const COMIC_MEDIA_FORMATS = new Set([
  MEDIA_FORMAT_MANGA,
  MEDIA_FORMAT_COMIC,
  MEDIA_FORMAT_MANHWA,
]);

export const MEDIA_FORMAT_OPTIONS = [
  { value: MEDIA_FORMAT_NOVEL, label: "Novel", description: "Prose chapters with rich text editing" },
  { value: MEDIA_FORMAT_MANGA, label: "Manga", description: "Upload page images for each chapter" },
  { value: MEDIA_FORMAT_COMIC, label: "Comic", description: "Upload comic page images" },
  { value: MEDIA_FORMAT_MANHWA, label: "Manhwa", description: "Upload vertical-scroll page images" },
];

export function newChapterId() {
  return "ch_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function normalizeMediaFormat(raw) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (COMIC_MEDIA_FORMATS.has(value)) return value;
  return MEDIA_FORMAT_NOVEL;
}

export function isComicFormat(format) {
  return COMIC_MEDIA_FORMATS.has(normalizeMediaFormat(format));
}

export function mediaFormatLabel(format) {
  const normalized = normalizeMediaFormat(format);
  const match = MEDIA_FORMAT_OPTIONS.find((opt) => opt.value === normalized);
  return match ? match.label : "Novel";
}

export function defaultSectionsForFormat(format) {
  if (isComicFormat(format)) {
    return {
      front: [],
      body: [{ id: newChapterId(), title: "Page 1", content: "", imageUrl: "" }],
      back: [],
    };
  }
  return {
    front: [
      { id: newChapterId(), title: "Copyright", content: "" },
      { id: newChapterId(), title: "Table of Contents", content: "" },
    ],
    body: [{ id: newChapterId(), title: "Chapter 1", content: "" }],
    back: [],
  };
}

export function countComicPages(sections) {
  if (!sections || typeof sections !== "object") return 0;
  const body = Array.isArray(sections.body) ? sections.body : [];
  return body.length;
}

export function countComicPagesWithImages(sections) {
  if (!sections || typeof sections !== "object") return 0;
  const body = Array.isArray(sections.body) ? sections.body : [];
  return body.filter((page) => {
    const url = page?.imageUrl ?? page?.image_url;
    return typeof url === "string" && url.trim();
  }).length;
}
