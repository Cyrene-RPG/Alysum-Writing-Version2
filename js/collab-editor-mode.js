/**
 * Collab mode inside editor.html — full editor UI with suggestion review / submit.
 */

import {
    acceptCollabChapterInvite,
    getCollabChapter,
    listCollabSuggestions,
    submitCollabSuggestions,
    reviewCollabSuggestion,
    isCollabRoomsSchemaMissing,
} from "./collab-rooms-api.js?v=3";
import {
    diffChapterHtmlSuggestions,
    countPending,
    escapeHtml,
    suggestionRowToHunk,
} from "./collab-room-render.js?v=2";

/**
 * @param {{
 *   params: URLSearchParams,
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   getBookId: () => string,
 *   setBookId: (id: string) => void,
 *   getCurrentBook: () => object | null,
 *   setCurrentBook: (book: object) => void,
 *   normalizeBookData: (row: object) => object,
 *   editor: HTMLElement,
 *   loadChapter: (section: string, index: number, rerender?: boolean) => void,
 *   findChapterLocation: (chapterId: string) => { section: string, index: number } | null,
 *   reloadBookFromCloud: () => Promise<void>,
 *   cleanAndStoreCurrentChapterFromEditor: () => string,
 *   setSaveStatus: (msg: string) => void,
 *   isLocalStudio: boolean,
 * }} deps
 */
export async function bootCollabEditorMode(deps) {
    if (deps.isLocalStudio) return null;

    let bookId = deps.getBookId();
    let chapterId = String(deps.params.get("chapter") || "").trim();
    let collabMode = String(deps.params.get("collab") || "").trim();
    const inviteToken = String(deps.params.get("invite") || "").trim();

    if (inviteToken) {
        try {
            const membership = await acceptCollabChapterInvite(inviteToken);
            bookId = membership.book_id;
            chapterId = membership.chapter_id;
            collabMode = "edit";
            deps.setBookId(bookId);
            const url = new URL(window.location.href);
            url.searchParams.delete("invite");
            url.searchParams.set("book", bookId);
            url.searchParams.set("chapter", chapterId);
            url.searchParams.set("collab", "edit");
            window.history.replaceState({}, "", url.pathname + url.search);
        } catch (err) {
            alert(isCollabRoomsSchemaMissing(err)
                ? "Collab rooms are not set up in Supabase yet. Run supabase-collab-rooms.sql."
                : err?.message || "Could not accept invite.");
            return null;
        }
    }

    if (!collabMode || !bookId || !chapterId) return null;

    let chapterMeta;
    try {
        chapterMeta = await getCollabChapter(bookId, chapterId);
    } catch (err) {
        alert(isCollabRoomsSchemaMissing(err)
            ? "Collab rooms are not set up in Supabase yet. Run supabase-collab-rooms.sql."
            : err?.message || "Could not open collab chapter.");
        return null;
    }

    const isAuthor = !!chapterMeta.is_author;
    const isReview = isAuthor || collabMode === "review";
    document.body.classList.add(isReview ? "collab-editor-review" : "collab-editor-edit");

    const loc = deps.findChapterLocation(chapterId);
    if (loc) deps.loadChapter(loc.section, loc.index, true);

    const panel = injectReviewPanel();
    const submitBar = injectSubmitBar();
    /** @type {import("./collab-room-render.js").CollabHunk[]} */
    let hunks = [];
    let contentHash = chapterMeta.content_hash || "";
    let baseChapterHtml = chapterMeta.content || "";

    function currentChapterHtml() {
        deps.cleanAndStoreCurrentChapterFromEditor();
        const ch = loc ? deps.getCurrentBook()?.sections?.[loc.section]?.[loc.index] : null;
        return ch?.content || deps.editor.innerHTML || "";
    }

    async function reloadSuggestionsAndChapter() {
        const meta = await getCollabChapter(bookId, chapterId);
        contentHash = meta.content_hash || "";
        baseChapterHtml = meta.content || "";
        await deps.reloadBookFromCloud();
        if (loc) deps.loadChapter(loc.section, loc.index, true);
        const rows = await listCollabSuggestions(bookId, chapterId);
        hunks = rows.map(suggestionRowToHunk);
        renderPanel();
        updateSubmitBar();
    }

    function renderPanel() {
        const pending = countPending(hunks);
        panel.querySelector("#collabReviewSub").textContent =
            pending === 0
                ? "All suggestions reviewed"
                : `${pending} suggestion${pending === 1 ? "" : "s"} pending review`;
        panel.querySelector("#collabPendingPill").textContent = `${pending} pending`;
        panel.querySelector("#collabAcceptAllBtn").disabled = !isReview || pending === 0;
        panel.querySelector("#collabRejectAllBtn").disabled = !isReview || pending === 0;

        const list = panel.querySelector("#collabHunkList");
        list.innerHTML = hunks
            .map((h) => {
                const resolved = h.status !== "pending";
                const body =
                    h.type === "insert"
                        ? `<span class="new">${escapeHtml(h.newText)}</span>`
                        : `<span class="old">${escapeHtml(h.oldText)}</span><span class="new">${escapeHtml(h.newText)}</span>`;
                const actions =
                    resolved || !isReview
                        ? `<div class="collab-hunk-type">${h.status}</div>`
                        : `<div class="collab-hunk-actions">
                            <button type="button" class="collab-btn primary" data-action="accept" data-id="${h.id}">Accept</button>
                            <button type="button" class="collab-btn danger" data-action="reject" data-id="${h.id}">Reject</button>
                           </div>`;
                return `<article class="collab-hunk${resolved ? " is-resolved" : ""}">
                    <div class="collab-hunk-head">
                        <span class="collab-hunk-author">${escapeHtml(h.byLabel)}</span>
                        <span class="collab-hunk-type">${escapeHtml(h.type)}</span>
                    </div>
                    <div class="collab-hunk-body">${body}</div>
                    ${actions}
                </article>`;
            })
            .join("");

        list.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                const action = btn.getAttribute("data-action");
                btn.disabled = true;
                try {
                    await reviewCollabSuggestion(id, action === "accept" ? "accept" : "reject");
                    await reloadSuggestionsAndChapter();
                    deps.setSaveStatus(action === "accept" ? "Suggestion accepted — draft updated" : "Suggestion rejected");
                } catch (err) {
                    alert(err?.message || "Could not review suggestion.");
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    function updateSubmitBar() {
        if (isReview) {
            submitBar.classList.add("hidden");
            panel.classList.remove("hidden");
            return;
        }
        panel.classList.add("hidden");
        submitBar.classList.remove("hidden");
    }

    panel.querySelector("#collabAcceptAllBtn").addEventListener("click", async () => {
        const pending = hunks.filter((h) => h.status === "pending");
        for (const h of pending) {
            await reviewCollabSuggestion(h.id, "accept");
        }
        await reloadSuggestionsAndChapter();
        deps.setSaveStatus("All suggestions accepted — draft updated");
    });

    panel.querySelector("#collabRejectAllBtn").addEventListener("click", async () => {
        const pending = hunks.filter((h) => h.status === "pending");
        for (const h of pending) {
            await reviewCollabSuggestion(h.id, "reject");
        }
        await reloadSuggestionsAndChapter();
        deps.setSaveStatus("All suggestions rejected");
    });

    submitBar.querySelector("#collabSubmitBtn").addEventListener("click", async () => {
        const nextHtml = currentChapterHtml();
        const suggestions = diffChapterHtmlSuggestions(baseChapterHtml, nextHtml);
        if (!suggestions.length) {
            alert("No changes to submit.");
            return;
        }
        const btn = submitBar.querySelector("#collabSubmitBtn");
        btn.disabled = true;
        try {
            const count = await submitCollabSuggestions(bookId, chapterId, contentHash, suggestions);
            alert(count ? `Submitted ${count} suggestion${count === 1 ? "" : "s"} for author review.` : "Nothing new to submit.");
            await reloadSuggestionsAndChapter();
            baseChapterHtml = currentChapterHtml();
        } catch (err) {
            const msg = /stale_base_hash/i.test(err?.message || "")
                ? "The chapter changed since you opened it. Refresh and try again."
                : err?.message || "Could not submit suggestions.";
            alert(msg);
        } finally {
            btn.disabled = false;
        }
    });

    // Restrict collaborators to the invited chapter.
    if (!isReview && loc) {
        document.querySelectorAll(".chapter-item").forEach((el) => {
            if (!el.classList.contains("active")) {
                el.style.opacity = "0.45";
                el.style.pointerEvents = "none";
            }
        });
        for (const id of ["publishBtn", "publishTopBtn", "deleteBookBtn", "deleteBookTopBtn", "quickAddBtn", "collabShareLink", "collabShareTopLinkWrap", "betaShareLink", "betaShareTopLinkWrap"]) {
            document.getElementById(id)?.classList.add("hidden");
        }
    }

    injectModeBanner(isReview);
    await reloadSuggestionsAndChapter();

    return {
        blockSave: !isReview,
        chapterId,
        isAuthor: isReview,
    };
}

function injectModeBanner(isReview) {
    if (document.getElementById("collabEditorBanner")) return;
    const banner = document.createElement("div");
    banner.id = "collabEditorBanner";
    banner.className = `collab-mode-banner${isReview ? " is-author" : ""}`;
    banner.innerHTML = isReview
        ? "<div><strong>Collab review</strong><span>Accept suggestions to merge into your draft. Changes save to this book immediately.</span></div>"
        : "<div><strong>Collab editor</strong><span>Edit this chapter, then submit suggestions. Your changes stay pending until the author approves.</span></div>";
    const workspace = document.getElementById("editorWorkspace");
    workspace?.querySelector(".page")?.prepend(banner);
}

function injectReviewPanel() {
    let panel = document.getElementById("collabEditorReviewPanel");
    if (panel) return panel;

    panel = document.createElement("aside");
    panel.id = "collabEditorReviewPanel";
    panel.className = "collab-review-panel collab-editor-review-panel";
    panel.innerHTML = `
        <div class="collab-review-head">
            <h3>Pending review</h3>
            <p id="collabReviewSub">Loading…</p>
        </div>
        <div class="collab-review-stats">
            <span class="collab-stat-pill pending" id="collabPendingPill">0 pending</span>
        </div>
        <div class="collab-review-actions">
            <button type="button" class="collab-btn primary" id="collabAcceptAllBtn">Accept all</button>
            <button type="button" class="collab-btn danger" id="collabRejectAllBtn">Reject all</button>
        </div>
        <div class="collab-hunk-list" id="collabHunkList"></div>
    `;
    document.body.appendChild(panel);
    return panel;
}

function injectSubmitBar() {
    let bar = document.getElementById("collabEditorSubmitBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "collabEditorSubmitBar";
    bar.className = "collab-submit-bar collab-editor-submit-bar hidden";
    bar.innerHTML = `
        <p><strong>Your edits stay pending</strong> until the author approves. Submit when you're done with this pass.</p>
        <button type="button" class="collab-btn primary" id="collabSubmitBtn">Submit suggestions</button>
    `;
    document.body.appendChild(bar);
    return bar;
}
