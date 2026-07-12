/** Known Archangel drafts whose prologue can be wiped on editor resume-open. */
export const ARCHANGEL_PROLOGUE_CHAPTER_IDS = {
    WotLrrcn0dh0KkxDaQzg: "ch_7y0mlu1lmnuhie61",
    "29f82da6-00d8-4fe2-9bff-9f7499c34133": "ch_6cb5js00mpvkix5q",
};

const REPAIR_MANIFEST_URL = "./js/archangel-prologue-repair.json?v=1";
const MIN_PROLOGUE_TEXT_LEN = 200;

function plainTextLen(html) {
    return String(html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .length;
}

export function findPrologueChapter(sections, chapterId) {
    const body = sections?.body;
    if (!Array.isArray(body) || !body.length) return null;

    if (chapterId) {
        const byId = body.findIndex(ch => ch.id === chapterId);
        if (byId >= 0) return { index: byId, chapter: body[byId] };
    }

    const byTitle = body.findIndex(ch => /^prologue\s*$/i.test(String(ch.title || "").trim()));
    if (byTitle >= 0) return { index: byTitle, chapter: body[byTitle] };
    return null;
}

export function prologueNeedsRepair(content) {
    return plainTextLen(content) < MIN_PROLOGUE_TEXT_LEN;
}

async function fetchRepairManifest() {
    try {
        const res = await fetch(REPAIR_MANIFEST_URL, { cache: "no-store" });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function loadLibraryPrologue(supabase, bookId, chapterId) {
    if (!supabase || !bookId) return null;
    const { data, error } = await supabase.from("library").select("data").eq("id", bookId).maybeSingle();
    if (error || !data?.data) return null;
    const chapters = Array.isArray(data.data.chapters) ? data.data.chapters : [];
    const match = chapters.find(ch => ch.id === chapterId) ||
        chapters.find(ch => /^prologue\s*$/i.test(String(ch.title || "").trim()));
    if (!match) return null;
    const content = match.content || "";
    return prologueNeedsRepair(content) ? null : content;
}

/**
 * Restore a wiped Archangel prologue from library (published) or bundled recovery manifest.
 * Returns true when content was patched in memory (caller should save).
 */
export async function repairArchangelPrologueIfNeeded({ bookId, book, supabase, isLocalStudio }) {
    const chapterId = ARCHANGEL_PROLOGUE_CHAPTER_IDS[bookId];
    if (!chapterId || !book?.sections) return false;

    const located = findPrologueChapter(book.sections, chapterId);
    if (!located || !prologueNeedsRepair(located.chapter.content)) return false;

    let sourceContent = null;

    if (!isLocalStudio) {
        sourceContent = await loadLibraryPrologue(supabase, bookId, chapterId);
    }

    if (!sourceContent) {
        const manifest = await fetchRepairManifest();
        const patch = manifest?.[bookId];
        if (patch && !prologueNeedsRepair(patch.content)) {
            sourceContent = patch.content;
            if (patch.title && !located.chapter.title) located.chapter.title = patch.title;
        }
    }

    if (!sourceContent) return false;

    located.chapter.content = sourceContent;
    return true;
}
