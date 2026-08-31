import { mountReaderAuthor } from "./reader-author.js?v=3";
import { mountCommentThread } from "./comment-editor.js?v=1";

export function mountReaderEnd({ work, chapterId, supabase, session, onLayout }) {
    const el = document.getElementById("readerEnd");
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `
        <section class="reader-afterword" id="readerAuthor"></section>
        <section class="reader-comments" id="readerComments" aria-label="Chapter comments"></section>`;
    const author = document.getElementById("readerAuthor");
    const comments = document.getElementById("readerComments");
    if (author) void mountReaderAuthor(author, { work, supabase, session }).then(() => onLayout?.());
    if (comments) {
        mountCommentThread(comments, {
            work,
            chapterId,
            supabase,
            session,
            onLayout,
        });
    }
}
