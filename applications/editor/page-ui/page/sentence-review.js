import { listBodyChapters } from "@alysum/writing-engine/manuscript.js?v=5";
import { reviewSentencesForXp } from "@alysum/statistics/sentence-review.js";
import { currentChapter } from "./helpers.js?v=41";

/** Idle sentence XP review for the open manuscript. */
export function createSentenceReview({
    getBook,
    getSelectedId,
    getClosing,
    editor,
    session,
    supabase,
}) {
    let sentenceReviewTimer = 0;
    let sentenceReviewBusy = false;

    async function runSentenceReview() {
        if (sentenceReviewBusy || getClosing()) return;
        sentenceReviewBusy = true;
        try {
            const book = getBook();
            const selectedId = getSelectedId();
            const live = { ...currentChapter(book, selectedId), content: editor.getHtml() };
            const chapters = listBodyChapters(book.sections)
                .filter((ch) => ch && ch.kind !== "folder")
                .map((ch) => (ch.id === live.id ? live : ch));
            await reviewSentencesForXp({
                chapters,
                source: "solo",
                userId: session.user?.id,
                isLocal: session.mode !== "cloud",
                supabase,
            });
        } catch {
            /* try again next idle */
        } finally {
            sentenceReviewBusy = false;
        }
    }

    function scheduleSentenceReview(delay = 8000) {
        clearTimeout(sentenceReviewTimer);
        sentenceReviewTimer = window.setTimeout(() => { void runSentenceReview(); }, delay);
    }

    return { scheduleSentenceReview, runSentenceReview };
}
