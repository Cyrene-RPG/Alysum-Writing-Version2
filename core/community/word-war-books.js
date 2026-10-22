/**
 * Which book a racer writes in. No DOM.
 */
import { groupRevisionBooks, revisionLabel } from "../writing-engine/draft-revisions.js";

/**
 * Books for a picker: each main book, then its drafts and backups with their
 * label, so nobody writes into a copy Studio keeps out of sight by mistake.
 * [{ id, label }]
 */
export function bookChoices(books) {
    return groupRevisionBooks(Array.isArray(books) ? books : []).flatMap(({ book, drafts }) => [
        { id: String(book.id), label: book.title || "Untitled" },
        ...drafts
            .filter((draft) => draft !== book)
            .map((draft) => ({ id: String(draft.id), label: `${draft.title || book.title || "Untitled"} · ${revisionLabel(draft)}` })),
    ]);
}
