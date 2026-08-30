/**
 * Recency + blank-cache rules for device draft vs site.
 * Empty/unedited cache is not a newer file.
 */
import { countWordsInSections } from "../writing-engine/word-count.js";

export function cacheIsPending(book) {
    return !!(book && book._pending);
}

export function isLocalOnlyId(id) {
    return String(id || "").startsWith("local-book-");
}

export function isBlankDraft(book) {
    if (!book || typeof book !== "object") return true;
    const words = Number(book.words);
    if (Number.isFinite(words) && words > 0) return false;
    return countWordsInSections(book.sections) <= 0;
}

/**
 * @returns {{ book: object | null, action: "keep-local" | "keep-cloud" | "upload" | "insert" }}
 */
export function chooseBook(local, cloud) {
    if (!local && !cloud) return { book: null, action: "keep-cloud" };
    if (!local) return { book: cloud, action: "keep-cloud" };
    if (!cloud) {
        if (cacheIsPending(local) || isLocalOnlyId(local.id)) {
            return { book: local, action: "insert" };
        }
        if (isBlankDraft(local)) return { book: null, action: "keep-cloud" };
        return { book: local, action: "keep-local" };
    }
    if (isBlankDraft(local) && !cacheIsPending(local)) {
        return { book: cloud, action: "keep-cloud" };
    }
    const localUpdated = Number(local.updated) || 0;
    const cloudUpdated = Number(cloud.updated) || 0;
    if (cacheIsPending(local) && localUpdated > cloudUpdated) {
        return { book: local, action: "upload" };
    }
    if (cloudUpdated > localUpdated) {
        return { book: cloud, action: "keep-cloud" };
    }
    if (localUpdated > cloudUpdated) {
        return { book: local, action: cacheIsPending(local) ? "upload" : "keep-local" };
    }
    if (cacheIsPending(local)) return { book: local, action: "upload" };
    return { book: cloud, action: "keep-cloud" };
}
