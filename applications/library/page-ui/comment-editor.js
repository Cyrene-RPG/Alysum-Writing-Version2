import { countWordsInHtml } from "@alysum/writing-engine/word-count.js";
import { COMMENT_HTML_MAX, deleteChapterComment, fetchChapterComments, postChapterComment } from "@alysum/library/book-comments.js?v=3";
import { authorInitial } from "@alysum/library/author-profile.js?v=3";
import { commentHasText, sanitizeCommentHtml } from "./comment-html.js?v=1";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatWhen(value) {
    if (!value) return "";
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "";
    const delta = Date.now() - ms;
    const mins = Math.round(delta / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d ago`;
    return new Date(ms).toLocaleDateString();
}

function runCommand(command, value) {
    try {
        document.execCommand("styleWithCSS", false, false);
        document.execCommand(command, false, value);
    } catch {
        /* ignore */
    }
}

function wrapSpoiler(editor) {
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
        runCommand("insertHTML", '<span class="reader-spoiler">spoiler</span>');
        return;
    }
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.className = "reader-spoiler";
    try {
        range.surroundContents(span);
    } catch {
        span.append(range.extractContents());
        range.insertNode(span);
    }
}

async function uploadCommentImage(supabase, userId, bookId, file) {
    if (!supabase || !file || !userId) throw new Error("Sign in to add an image.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${bookId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("comment-images").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
    });
    if (error) throw new Error("Could not upload that image.");
    const { data } = supabase.storage.from("comment-images").getPublicUrl(path);
    const url = String(data?.publicUrl || "").trim();
    if (!url) throw new Error("Could not upload that image.");
    return url;
}

function commentCard(row, { viewerId, ownerId }) {
    const name = row.displayName || row.username || "Reader";
    const canDelete = (viewerId && viewerId === row.userId) || (viewerId && ownerId && viewerId === ownerId);
    const body = sanitizeCommentHtml(row.text);
    const del = canDelete
        ? `<button type="button" class="reader-comment-del" data-delete="${escapeHtml(row.id)}">Delete</button>`
        : "";
    return `
        <article class="reader-comment" data-comment="${escapeHtml(row.id)}">
            <div class="reader-comment-head">
                <span class="reader-comment-av" aria-hidden="true">${escapeHtml(authorInitial(name))}</span>
                <div class="reader-comment-who">
                    <strong>${escapeHtml(name)}</strong>
                    <time>${escapeHtml(formatWhen(row.createdAt))}</time>
                </div>
                ${del}
            </div>
            <div class="reader-comment-body">${body}</div>
        </article>`;
}

export function mountCommentThread(root, {
    work, chapterId, supabase, session, onPosted, onLayout,
}) {
    const viewerId = session?.mode === "cloud" ? String(session.user?.id || "").trim() : "";
    const ownerId = String(work?.ownerUserId || "").trim();
    const signedIn = Boolean(viewerId);
    let comments = [];
    let loading = true;

    function paint() {
        const n = comments.length;
        const log = loading
            ? `<div class="reader-comment-skel" aria-hidden="true"></div><div class="reader-comment-skel" aria-hidden="true"></div>`
            : n
                ? comments.map((row) => commentCard(row, { viewerId, ownerId })).join("")
                : `<p class="reader-comments-empty">No comments on this chapter yet.</p>`;
        const composer = signedIn
            ? `<div class="reader-composer">
                    <div class="reader-composer-tools" role="toolbar" aria-label="Comment formatting">
                        <button type="button" data-cmd="bold" title="Bold">Bold</button>
                        <button type="button" data-cmd="italic" title="Italic">Italic</button>
                        <button type="button" data-cmd="underline" title="Underline">Underline</button>
                        <button type="button" data-cmd="spoiler" title="Spoiler">Spoiler</button>
                        <button type="button" data-cmd="quote" title="Quote">Quote</button>
                        <button type="button" data-cmd="image" title="Image">Image</button>
                    </div>
                    <div class="reader-composer-page" id="readerCommentEditor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Share your thoughts…"></div>
                    <input id="readerCommentFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
                    <div class="reader-composer-foot">
                        <span class="reader-composer-words" id="readerCommentWords">0 words</span>
                        <button type="button" class="reader-composer-post" id="readerCommentPost">Post</button>
                    </div>
                    <p class="reader-composer-hint" id="readerCommentHint" hidden></p>
                </div>`
            : `<p class="reader-comments-empty">Sign in to leave a comment on this chapter.</p>`;
        root.innerHTML = `
            <header class="reader-comments-head">
                <h2>Comments (${n})</h2>
            </header>
            <div class="reader-comment-log">${log}</div>
            ${composer}`;
        bindComposer();
        onLayout?.();
    }

    function hint(msg) {
        const el = root.querySelector("#readerCommentHint");
        if (!el) return;
        el.hidden = !msg;
        el.textContent = msg || "";
    }

    function bindComposer() {
        const editor = root.querySelector("#readerCommentEditor");
        const words = root.querySelector("#readerCommentWords");
        const file = root.querySelector("#readerCommentFile");
        editor?.addEventListener("input", () => {
            if (words) words.textContent = `${countWordsInHtml(editor.innerHTML)} words`;
        });
        root.querySelector(".reader-composer-tools")?.addEventListener("click", (event) => {
            const cmd = event.target.closest("[data-cmd]")?.dataset.cmd;
            if (!cmd || !editor) return;
            editor.focus();
            if (cmd === "spoiler") wrapSpoiler(editor);
            else if (cmd === "quote") runCommand("formatBlock", "blockquote");
            else if (cmd === "image") file?.click();
            else runCommand(cmd);
        });
        file?.addEventListener("change", async () => {
            const picked = file.files?.[0];
            file.value = "";
            if (!picked || !editor) return;
            hint("");
            try {
                const url = await uploadCommentImage(supabase, viewerId, work.id, picked);
                editor.focus();
                runCommand("insertHTML", `<img src="${escapeHtml(url)}" alt="">`);
            } catch (error) {
                hint(error?.message || "Could not add that image.");
            }
        });
        root.querySelector("#readerCommentPost")?.addEventListener("click", () => void post());
        root.querySelector(".reader-comment-log")?.addEventListener("click", (event) => {
            const spoiler = event.target.closest(".reader-spoiler");
            if (spoiler) {
                spoiler.classList.toggle("is-open");
                return;
            }
            const id = event.target.closest("[data-delete]")?.dataset.delete;
            if (id) void remove(id);
        });
    }

    async function posterNames() {
        let username = "";
        let displayName = "";
        try {
            const { data } = await supabase.from("users").select("username, display_name").eq("id", viewerId).maybeSingle();
            username = String(data?.username || "").trim();
            displayName = String(data?.display_name || "").trim();
        } catch {
            /* email fallback */
        }
        return {
            username,
            displayName: displayName || session?.user?.email || "Reader",
        };
    }

    async function post() {
        const editor = root.querySelector("#readerCommentEditor");
        const html = sanitizeCommentHtml(editor?.innerHTML || "");
        if (!commentHasText(html)) {
            hint("Write a comment first.");
            return;
        }
        if (html.length > COMMENT_HTML_MAX) {
            hint("That comment is too long.");
            return;
        }
        const btn = root.querySelector("#readerCommentPost");
        if (btn) btn.disabled = true;
        hint("");
        try {
            const names = await posterNames();
            const row = await postChapterComment(supabase, {
                bookId: work.id,
                chapterId,
                userId: viewerId,
                ...names,
                text: html,
            });
            if (row) comments = [...comments, row];
            loading = false;
            paint();
            onPosted?.(comments.length);
        } catch (error) {
            hint(error?.message || "Could not post.");
            if (btn) btn.disabled = false;
        }
    }

    async function remove(id) {
        try {
            await deleteChapterComment(supabase, id);
            comments = comments.filter((row) => row.id !== id);
            paint();
        } catch (error) {
            hint(error?.message || "Could not delete.");
        }
    }

    paint();
    void (async () => {
        try {
            comments = await fetchChapterComments(supabase, work.id, chapterId);
        } catch {
            comments = [];
        }
        loading = false;
        paint();
    })();
}
