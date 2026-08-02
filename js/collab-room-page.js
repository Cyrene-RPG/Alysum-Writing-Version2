/**
 * Collab room — Google Docs-style Suggesting mode + live sync + comments.
 */

import { supabase } from "../firebase.js";
import { resolveStudioSession } from "./studio-session.js?v=3";
import {
    acceptCollabChapterInvite,
    getCollabChapter,
    upsertCollabLiveDraft,
    commitCollabChapterContent,
    listCollabComments,
    submitCollabComment,
    resolveCollabComment,
    isCollabRoomsSchemaMissing,
} from "./collab-rooms-api.js?v=9";
import { DEMO_ROOM, DEMO_CANON, DEMO_COMMENTS } from "./collab-rooms-demo.js?v=4";
import {
    htmlToParagraphTexts,
    paragraphsToEditableHtml,
    normalizeManuscriptHtml,
    prepareCollaboratorChapterHtml,
    escapeHtml,
    commentRowToComment,
} from "./collab-room-render.js?v=8";
import { mountCollabToolbar } from "./collab-toolbar.js?v=2";
import { createCollabRealtimeSession } from "./collab-realtime.js?v=5";
import {
    mountSuggestingMode,
    extractSuggestionsFromDom,
    acceptSuggestionInDom,
    rejectSuggestionInDom,
    acceptAllSuggestionsInDom,
    rejectAllSuggestionsInDom,
    canonHtmlFromSuggesting,
    highlightSuggestionMarks,
} from "./collab-suggesting.js?v=4";

/**
 * @param {{ isPreview?: boolean, params?: URLSearchParams }} opts
 */
export async function bootCollabRoomPage(opts = {}) {
    document.body.classList.add("collab-room-active");

    const params = opts.params || new URLSearchParams(window.location.search);
    const isPreview = !!opts.isPreview;

    let bookId = String(params.get("book") || "").trim();
    let chapterId = String(params.get("chapter") || "").trim();
    const inviteToken = String(params.get("invite") || "").trim();

    let activeRole = "author";
    let isAuthor = true;
    let currentUserId = "";
    let currentUserLabel = "You";
    let contentHash = "";
    let baseChapterHtml = "";
    let liveHtml = "";
    /** @type {import("./collab-room-render.js").CollabComment[]} */
    let comments = [];
    /** @type {ReturnType<typeof extractSuggestionsFromDom>} */
    let hunks = [];
    let replyTargetId = "";
    let replyDraftText = "";
    let pendingComment = null;
    let refreshTimer = 0;
    let realtimeStarted = false;
    /** @type {ReturnType<typeof createCollabRealtimeSession> | null} */
    let realtimeSession = null;
    /** @type {BroadcastChannel | null} */
    let previewChannel = null;
    /** @type {(() => void) | null} */
    let unmountSuggesting = null;

    const manuscript = document.getElementById("manuscript");
    const hunkList = document.getElementById("hunkList");
    const hunkEmpty = document.getElementById("hunkEmpty");
    const hunkEmptyHint = document.getElementById("hunkEmptyHint");
    const reviewPanel = document.getElementById("reviewPanel");
    const sidebarSubmit = document.getElementById("sidebarSubmit");
    const reviewTitle = document.getElementById("reviewTitle");
    const modeBanner = document.getElementById("modeBanner");
    const modeBannerLabel = document.getElementById("modeBannerLabel");
    const modeBannerText = document.getElementById("modeBannerText");
    const pendingPill = document.getElementById("pendingPill");
    const acceptedPill = document.getElementById("acceptedPill");
    const reviewSub = document.getElementById("reviewSub");
    const roleTabs = document.getElementById("roleTabs");
    const collabToolbar = document.getElementById("collabToolbar");
    const themeTopBtn = document.getElementById("themeTopBtn");
    const draftPreview = document.getElementById("draftPreview");
    const commentList = document.getElementById("commentList");
    const commentEmpty = document.getElementById("commentEmpty");
    const commentBadge = document.getElementById("commentBadge");
    const commentComposer = document.getElementById("commentComposer");
    const commentQuote = document.getElementById("commentQuote");
    const commentInput = document.getElementById("commentInput");
    const selectionCommentBtn = document.getElementById("selectionCommentBtn");
    const editsPane = document.getElementById("editsPane");
    const commentsPane = document.getElementById("commentsPane");
    const collabPresence = document.getElementById("collabPresence");

    function applyTheme(theme) {
        document.body.classList.toggle("dark", theme === "dark");
        document.body.classList.toggle("light", theme === "light");
        try {
            localStorage.setItem("alysum-theme", theme);
        } catch {
            /* ignore */
        }
    }
    applyTheme(localStorage.getItem("alysum-theme") || "dark");
    themeTopBtn?.addEventListener("click", () => {
        applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
    });

    mountCollabToolbar({
        editor: manuscript,
        toolbar: collabToolbar,
        onCommand: () => {
            if (!isAuthor) persistLive();
        },
    });

    function setSidebarTab(tab) {
        document.querySelectorAll(".collab-sidebar-tab").forEach((btn) => {
            const on = btn.getAttribute("data-tab") === tab;
            btn.classList.toggle("is-active", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        editsPane?.classList.toggle("hidden", tab !== "edits");
        commentsPane?.classList.toggle("hidden", tab !== "comments");
    }
    document.querySelectorAll(".collab-sidebar-tab").forEach((btn) => {
        btn.addEventListener("click", () => setSidebarTab(btn.getAttribute("data-tab") || "edits"));
    });

    function showError(msg) {
        document.getElementById("errorText").textContent = msg;
        document.getElementById("errorPanel")?.classList.remove("hidden");
        document.querySelector(".collab-layout")?.classList.add("hidden");
        document.querySelector(".collab-app-frame")?.classList.add("hidden");
        document.getElementById("collabTopbar")?.classList.add("hidden");
        collabToolbar?.classList.add("hidden");
    }

    function setHeader(bookTitle, chapterTitle, meta = "") {
        document.getElementById("topTitle").textContent = bookTitle;
        document.getElementById("topSub").textContent = `${chapterTitle} · live suggesting`;
        document.getElementById("chapterTitle").textContent = chapterTitle;
        document.getElementById("chapterMeta").textContent = meta;
    }

    function renderPresence(users = []) {
        if (!collabPresence) return;
        const list = users.length
            ? users
            : [{ userId: currentUserId || activeRole, label: currentUserLabel, color: "#22c55e" }];
        collabPresence.innerHTML =
            `<span class="collab-presence-live">Live</span>` +
            list
                .map(
                    (u) =>
                        `<span class="collab-presence-pill${u.userId === currentUserId ? " is-self" : ""}" style="border-color:${u.color}55;color:${u.color}">${escapeHtml(u.label)}${u.userId === currentUserId ? " · you" : ""}</span>`
                )
                .join("");
    }

    function syncHunksFromDom() {
        hunks = extractSuggestionsFromDom(manuscript);
    }

    function persistLive(extra = {}) {
        liveHtml = normalizeManuscriptHtml(manuscript?.innerHTML || liveHtml || "");
        syncHunksFromDom();
        renderHunkList();
        updateStats();

        if (isPreview) {
            previewChannel?.postMessage({
                type: "doc",
                html: liveHtml,
                role: activeRole,
                label: currentUserLabel,
            });
            return;
        }
        realtimeSession?.notifyInput(liveHtml, contentHash, []);
        if (extra.commitCanon) {
            /* handled by review actions */
        }
    }

    function bindAuthorMarkClicks() {
        if (!isAuthor || !manuscript) return;
        manuscript.querySelectorAll("[data-suggest-id]").forEach((el) => {
            el.addEventListener("click", (e) => {
                e.preventDefault();
                const id = el.getAttribute("data-suggest-id");
                highlightSuggestionMarks(manuscript, id);
                highlightHunkCard(id);
                setSidebarTab("edits");
            });
        });
    }

    function applyRemoteHtml(html, fromUserId = "", fromLabel = "") {
        if (!manuscript || !html) return;
        if (realtimeSession) realtimeSession.applyingRemote = true;
        const hadFocus = document.activeElement === manuscript;
        liveHtml = normalizeManuscriptHtml(html);
        manuscript.innerHTML = liveHtml;
        if (!manuscript.innerHTML.trim()) manuscript.innerHTML = "<p><br></p>";
        syncHunksFromDom();
        renderHunkList();
        updateStats();
        if (isAuthor) bindAuthorMarkClicks();
        if (hadFocus && !isAuthor) manuscript.focus();
        if (realtimeSession) realtimeSession.applyingRemote = false;
        void fromUserId;
        void fromLabel;
    }

    function mountEditorMode() {
        unmountSuggesting?.();
        unmountSuggesting = null;

        if (isAuthor) {
            manuscript.removeAttribute("contenteditable");
            collabToolbar?.classList.add("hidden");
            document.body.classList.add("collab-author-mode");
            liveHtml = normalizeManuscriptHtml(liveHtml || baseChapterHtml || "<p><br></p>");
            manuscript.innerHTML = liveHtml;
            syncHunksFromDom();
            bindAuthorMarkClicks();
            return;
        }

        document.body.classList.remove("collab-author-mode");
        manuscript.setAttribute("contenteditable", "true");
        manuscript.setAttribute("spellcheck", "true");
        collabToolbar?.classList.remove("hidden");
        if (document.activeElement !== manuscript) {
            liveHtml = normalizeManuscriptHtml(liveHtml || baseChapterHtml || "<p><br></p>");
            manuscript.innerHTML = liveHtml;
        }
        if (!manuscript.innerHTML.trim()) manuscript.innerHTML = "<p><br></p>";

        unmountSuggesting = mountSuggestingMode({
            editor: manuscript,
            userId: currentUserId || activeRole,
            userLabel: currentUserLabel || `@${activeRole}`,
            enabled: () => !isAuthor && !realtimeSession?.applyingRemote,
            onChange: () => {
                if (realtimeSession?.applyingRemote) return;
                persistLive();
            },
        });
        syncHunksFromDom();
    }

    function isMySuggestion(h) {
        if (!h) return false;
        if (currentUserId && h.by === currentUserId) return true;
        if (isPreview && h.by === activeRole) return true;
        return false;
    }

    function updateStats() {
        const pending = hunks.length;
        const mine = hunks.filter(isMySuggestion).length;
        pendingPill.textContent = `${pending} pending`;
        pendingPill.classList.toggle("pending", pending > 0);
        acceptedPill.textContent = isAuthor ? "Suggesting mode" : `${mine} yours`;
        const removeMineBtn = document.getElementById("removeMySuggestionsBtn");
        if (isAuthor) {
            reviewSub.textContent =
                pending === 0
                    ? "No suggestions — manuscript matches your draft"
                    : `${pending} suggestion${pending === 1 ? "" : "s"} in the document — Accept or Reject`;
            document.getElementById("acceptAllBtn").disabled = pending === 0;
            // Reject all always available — hard-resets live draft to chapter (clears gaps)
            document.getElementById("rejectAllBtn").disabled = false;
            document.getElementById("repairDraftBtn")?.removeAttribute("disabled");
            if (removeMineBtn) removeMineBtn.disabled = true;
        } else {
            reviewSub.textContent =
                mine === 0
                    ? "Type to suggest edits — they appear in green for the author"
                    : `${mine} of your suggestion${mine === 1 ? "" : "s"} pending — remove any you want to withdraw`;
            document.getElementById("acceptAllBtn").disabled = true;
            document.getElementById("rejectAllBtn").disabled = true;
            if (removeMineBtn) removeMineBtn.disabled = mine === 0;
        }
        const dismissBtn = document.getElementById("dismissResolvedBtn");
        if (dismissBtn) dismissBtn.classList.add("hidden");
    }

    function highlightHunkCard(hunkId) {
        hunkList?.querySelectorAll(".collab-hunk").forEach((el) => {
            el.classList.toggle("is-selected", el.getAttribute("data-hunk-id") === hunkId);
        });
        highlightSuggestionMarks(manuscript, hunkId);
        if (!hunkId || !manuscript) return;
        const safe = String(hunkId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const mark = manuscript.querySelector(`[data-suggest-id="${safe}"]`);
        mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function renderHunkList() {
        syncHunksFromDom();
        const visible = hunks;
        hunkEmpty?.classList.toggle("hidden", visible.length > 0);
        hunkList?.classList.toggle("hidden", visible.length === 0);
        if (!hunkList) return;

        if (!visible.length) {
            hunkList.innerHTML = "";
            if (hunkEmptyHint) {
                hunkEmptyHint.textContent = isAuthor
                    ? "When collaborators type, green and red marks appear here and in the manuscript."
                    : "Start typing — your edits show as green suggestions (Google Docs Suggesting mode).";
            }
            return;
        }

        hunkList.innerHTML = visible
            .map((h) => {
                const typeLabel =
                    h.type === "insert"
                        ? "Addition"
                        : h.type === "delete"
                          ? "Deletion"
                          : h.type === "indent"
                            ? "Indent"
                            : h.type === "outdent"
                              ? "Outdent"
                              : h.type === "format"
                                ? "Format"
                                : "Change";
                const body =
                    h.type === "insert"
                        ? `<span class="new"><span class="collab-suggest-add">${escapeHtml(h.newText)}</span></span>`
                        : h.type === "delete"
                          ? `<span class="old"><span class="collab-suggest-del">${escapeHtml(h.oldText)}</span></span>`
                          : h.type === "indent" || h.type === "outdent" || h.type === "format"
                            ? `<span class="new"><span class="collab-suggest-add">${escapeHtml(h.newText || typeLabel)}</span></span>`
                            : `<span class="old"><span class="collab-suggest-del">${escapeHtml(h.oldText)}</span></span><span class="new"><span class="collab-suggest-add">${escapeHtml(h.newText)}</span></span>`;
                const mine = isMySuggestion(h);
                const actions = isAuthor
                    ? `<div class="collab-hunk-actions">
                        <button type="button" class="collab-btn primary" data-action="accept" data-id="${escapeHtml(h.id)}">Accept</button>
                        <button type="button" class="collab-btn danger" data-action="reject" data-id="${escapeHtml(h.id)}">Reject</button>
                       </div>`
                    : mine
                      ? `<div class="collab-hunk-actions">
                            <span class="collab-hunk-status is-pending">Pending</span>
                            <button type="button" class="collab-btn danger" data-action="withdraw" data-id="${escapeHtml(h.id)}">Remove</button>
                           </div>`
                      : `<span class="collab-hunk-status is-pending">Pending</span>`;
                return `<article class="collab-hunk is-pending${mine ? " is-mine" : ""}" data-hunk-id="${escapeHtml(h.id)}" tabindex="0" role="button">
                    <div class="collab-hunk-head">
                        <span class="collab-hunk-author">${escapeHtml(h.byLabel)}${mine && !isAuthor ? " · you" : ""}</span>
                        <span class="collab-hunk-type">${typeLabel}</span>
                    </div>
                    <div class="collab-hunk-body">${body}</div>
                    ${actions}
                </article>`;
            })
            .join("");

        hunkList.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                const action = btn.getAttribute("data-action");
                if (!id) return;
                const hunk = hunks.find((x) => x.id === id);
                if (action === "withdraw") {
                    if (!isMySuggestion(hunk)) return;
                    btn.disabled = true;
                    try {
                        await withdrawOne(id);
                    } finally {
                        btn.disabled = false;
                    }
                    return;
                }
                if (!isAuthor) return;
                btn.disabled = true;
                try {
                    if (action === "accept") await acceptOne(id);
                    if (action === "reject") await rejectOne(id);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        hunkList.querySelectorAll(".collab-hunk").forEach((card) => {
            card.addEventListener("click", () => highlightHunkCard(card.getAttribute("data-hunk-id")));
        });
    }

    async function saveAfterReview() {
        liveHtml = normalizeManuscriptHtml(manuscript.innerHTML);
        const canon = canonHtmlFromSuggesting(liveHtml);
        baseChapterHtml = canon;
        contentHash = undefined; // refreshed below
        if (isPreview) {
            syncHunksFromDom();
            renderHunkList();
            updateStats();
            previewChannel?.postMessage({ type: "doc", html: liveHtml, role: activeRole, label: currentUserLabel });
            return;
        }
        try {
            const result = await commitCollabChapterContent(bookId, chapterId, canon, liveHtml);
            contentHash = result?.content_hash || contentHash;
            baseChapterHtml = result?.content || canon;
            liveHtml = result?.live_html || liveHtml;
            manuscript.innerHTML = liveHtml;
            syncHunksFromDom();
            renderHunkList();
            updateStats();
            mountEditorMode();
            realtimeSession?.notifyInput(liveHtml, contentHash, []);
        } catch (err) {
            // Fallback: at least persist live draft
            await upsertCollabLiveDraft(bookId, chapterId, liveHtml, contentHash);
            throw err;
        }
    }

    async function persistLiveOnly() {
        liveHtml = normalizeManuscriptHtml(manuscript.innerHTML);
        syncHunksFromDom();
        renderHunkList();
        updateStats();
        if (isPreview) {
            previewChannel?.postMessage({ type: "doc", html: liveHtml, role: activeRole, label: currentUserLabel });
            return;
        }
        await upsertCollabLiveDraft(bookId, chapterId, liveHtml, contentHash);
        realtimeSession?.notifyInput(liveHtml, contentHash, []);
    }

    async function withdrawOne(id) {
        rejectSuggestionInDom(manuscript, id);
        await persistLiveOnly();
        mountEditorMode();
    }

    async function withdrawMine() {
        const mine = hunks.filter(isMySuggestion);
        if (!mine.length) return;
        for (const h of mine) rejectSuggestionInDom(manuscript, h.id);
        await persistLiveOnly();
        mountEditorMode();
    }

    async function acceptOne(id) {
        acceptSuggestionInDom(manuscript, id);
        await saveAfterReview();
    }

    async function rejectOne(id) {
        rejectSuggestionInDom(manuscript, id);
        await saveAfterReview();
    }

    async function acceptAll() {
        acceptAllSuggestionsInDom(manuscript);
        liveHtml = normalizeManuscriptHtml(manuscript.innerHTML);
        if (isPreview) {
            baseChapterHtml = liveHtml;
            syncHunksFromDom();
            renderHunkList();
            updateStats();
            return;
        }
        await commitCollabChapterContent(bookId, chapterId, liveHtml, liveHtml);
        baseChapterHtml = liveHtml;
        contentHash = undefined;
        await reloadLiveRoom({ applyManuscript: true });
    }

    async function rejectAll() {
        // Hard reset to last saved chapter canon — wipes corrupted live gaps
        liveHtml = prepareCollaboratorChapterHtml(baseChapterHtml);
        manuscript.innerHTML = liveHtml || "<p><br></p>";
        syncHunksFromDom();
        renderHunkList();
        updateStats();
        if (isPreview) {
            previewChannel?.postMessage({ type: "doc", html: liveHtml, role: activeRole, label: currentUserLabel });
            return;
        }
        if (isAuthor) {
            await commitCollabChapterContent(bookId, chapterId, baseChapterHtml, liveHtml);
        } else {
            await upsertCollabLiveDraft(bookId, chapterId, liveHtml, contentHash);
        }
        realtimeSession?.notifyInput(liveHtml, contentHash, []);
        await reloadLiveRoom({ applyManuscript: true });
        mountEditorMode();
    }

    /** Repair empty-paragraph spam / layout junk in the current live draft and save it. */
    async function repairLiveDraft() {
        const cleaned = normalizeManuscriptHtml(manuscript?.innerHTML || liveHtml || "");
        liveHtml = cleaned || "<p><br></p>";
        manuscript.innerHTML = liveHtml;
        syncHunksFromDom();
        renderHunkList();
        updateStats();
        if (isPreview) {
            previewChannel?.postMessage({ type: "doc", html: liveHtml, role: activeRole, label: currentUserLabel });
            mountEditorMode();
            return;
        }
        if (isAuthor) {
            const canon = canonHtmlFromSuggesting(liveHtml);
            await commitCollabChapterContent(bookId, chapterId, baseChapterHtml, liveHtml);
            void canon;
        } else {
            await upsertCollabLiveDraft(bookId, chapterId, liveHtml, contentHash);
        }
        realtimeSession?.notifyInput(liveHtml, contentHash, []);
        mountEditorMode();
    }

    function renderModeBanner() {
        reviewPanel?.classList.remove("hidden");
        draftPreview?.classList.add("hidden");
        sidebarSubmit?.classList.add("hidden");
        const commentsSub = document.getElementById("commentsSub");

        if (isAuthor) {
            modeBanner.classList.add("is-author");
            modeBannerLabel.textContent = "Author · Suggesting review";
            modeBannerText.textContent =
                "Collaborator edits appear in green (additions) and red strikethrough (deletions), like Google Docs. Accept or Reject each one.";
            reviewTitle.textContent = "Suggestions";
            document.getElementById("bulkActions")?.classList.remove("hidden");
            document.getElementById("collaboratorActions")?.classList.add("hidden");
            if (commentsSub) commentsSub.textContent = "Reply to collaborator threads, or resolve when done.";
            return;
        }
        modeBanner.classList.remove("is-author");
        modeBannerLabel.textContent = "Suggesting";
        modeBannerText.textContent =
            "You're in Suggesting mode — everything you type is a green suggestion until the author accepts it. Deletes stay visible with a red strikethrough. Use Remove to withdraw a suggestion.";
        reviewTitle.textContent = "Your suggestions";
        document.getElementById("bulkActions")?.classList.add("hidden");
        document.getElementById("collaboratorActions")?.classList.remove("hidden");
        if (commentsSub) commentsSub.textContent = "Select text in the manuscript to add a comment.";
    }

    /* —— Comments (unchanged pattern) —— */
    function openCommentComposer(quote, paragraphIndex, parentId = "") {
        pendingComment = { quote, paragraphIndex, parentId: parentId || "" };
        replyTargetId = parentId || "";
        if (parentId) {
            commentComposer?.classList.add("hidden");
            setSidebarTab("comments");
            renderCommentList();
            requestAnimationFrame(() => {
                commentList?.querySelector(`.collab-reply-input[data-parent-id="${parentId}"]`)?.focus();
            });
            return;
        }
        if (commentQuote) commentQuote.textContent = quote ? `"${quote}"` : "General comment";
        if (commentInput) {
            commentInput.value = "";
            commentInput.placeholder = "Add a comment…";
        }
        commentComposer?.classList.remove("hidden");
        setSidebarTab("comments");
        commentInput?.focus();
    }

    function closeCommentComposer() {
        pendingComment = null;
        replyTargetId = "";
        replyDraftText = "";
        commentComposer?.classList.add("hidden");
        selectionCommentBtn?.classList.add("hidden");
        renderCommentList();
    }

    function captureReplyDraft() {
        if (!replyTargetId || !commentList) return;
        const box = commentList.querySelector(`.collab-reply-input[data-parent-id="${replyTargetId}"]`);
        if (box) replyDraftText = String(box.value || "");
    }

    function paragraphIndexFromSelection() {
        const sel = window.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return -1;
        const node = sel.anchorNode;
        const block =
            node?.nodeType === Node.TEXT_NODE
                ? node.parentElement?.closest("p, h2, h3, blockquote, li")
                : node?.closest?.("p, h2, h3, blockquote, li");
        if (!block || !manuscript.contains(block)) return -1;
        return [...manuscript.querySelectorAll("p, h2, h3, blockquote, li")].indexOf(block);
    }

    function updateSelectionCommentBtn() {
        const sel = window.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed || !manuscript.contains(sel.anchorNode)) {
            selectionCommentBtn?.classList.add("hidden");
            return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect.width && !rect.height) {
            selectionCommentBtn?.classList.add("hidden");
            return;
        }
        selectionCommentBtn.style.top = `${Math.max(8, rect.top - 40)}px`;
        selectionCommentBtn.style.left = `${rect.left + rect.width / 2}px`;
        selectionCommentBtn?.classList.remove("hidden");
    }

    selectionCommentBtn?.addEventListener("click", () => {
        const quote = window.getSelection()?.toString().trim() || "";
        openCommentComposer(quote, Math.max(paragraphIndexFromSelection(), 0));
    });
    document.getElementById("commentCancelBtn")?.addEventListener("click", closeCommentComposer);
    document.getElementById("commentPostBtn")?.addEventListener("click", async () => {
        const body = String(commentInput?.value || "").trim();
        if (!body) return;
        const quote = pendingComment?.quote || "";
        const paragraphIndex = pendingComment?.paragraphIndex ?? 0;
        const parentId = pendingComment?.parentId || "";
        if (isPreview) {
            comments.push({
                id: `c-${Date.now()}`,
                by: activeRole,
                byLabel: `@${activeRole}`,
                paragraphIndex,
                quote: parentId ? "" : quote,
                body,
                status: "open",
                parentId,
            });
            closeCommentComposer();
            renderCommentList();
            return;
        }
        const btn = document.getElementById("commentPostBtn");
        btn.disabled = true;
        try {
            await submitCollabComment(bookId, chapterId, paragraphIndex, parentId ? "" : quote, body, parentId || null);
            closeCommentComposer();
            await refreshComments();
            setSidebarTab("comments");
        } catch (err) {
            alert(err?.message || "Could not post comment.");
        } finally {
            btn.disabled = false;
        }
    });

    document.addEventListener("selectionchange", () => {
        if (!manuscript?.contains(window.getSelection()?.anchorNode)) return;
        updateSelectionCommentBtn();
    });
    manuscript?.addEventListener("mouseup", updateSelectionCommentBtn);

    function renderCommentList() {
        captureReplyDraft();
        const threads = comments.filter((c) => !c.parentId);
        const openCount = threads.filter((c) => c.status === "open").length;
        commentBadge?.classList.toggle("hidden", openCount === 0);
        if (commentBadge) commentBadge.textContent = String(openCount);
        commentEmpty?.classList.toggle("hidden", threads.length > 0);
        commentList?.classList.toggle("hidden", threads.length === 0);
        if (!commentList) return;

        commentList.innerHTML = threads
            .map((c) => {
                const replies = comments.filter((r) => r.parentId === c.id);
                const resolved = c.status === "resolved";
                const isReplying = replyTargetId === c.id;
                const canResolve = isAuthor || c.by === currentUserId || (isPreview && c.by === activeRole);
                const resolveBtn = canResolve
                    ? `<button type="button" class="collab-btn" data-comment-action="${resolved ? "reopen" : "resolve"}" data-id="${c.id}">${resolved ? "Reopen" : "Resolve"}</button>`
                    : "";
                const replyBtn = !resolved
                    ? `<button type="button" class="collab-btn primary" data-comment-action="reply" data-id="${c.id}">Reply</button>`
                    : "";
                const inlineReply = isReplying
                    ? `<div class="collab-comment-inline-reply">
                        <textarea rows="2" class="collab-reply-input" data-parent-id="${c.id}" placeholder="${isAuthor ? "Reply as author…" : "Write a reply…"}">${escapeHtml(replyDraftText)}</textarea>
                        <div class="collab-comment-composer-actions">
                            <button type="button" class="collab-btn" data-comment-action="cancel-reply" data-id="${c.id}">Cancel</button>
                            <button type="button" class="collab-btn primary" data-comment-action="post-reply" data-id="${c.id}">Post reply</button>
                        </div>
                       </div>`
                    : "";
                return `<article class="collab-comment${resolved ? " is-resolved" : ""}${isReplying ? " is-replying" : ""}" data-comment-id="${c.id}">
                    <div class="collab-comment-head">
                        <span class="collab-hunk-author">${escapeHtml(c.byLabel)}</span>
                        <span class="collab-hunk-type">${resolved ? "Resolved" : "Open"}</span>
                    </div>
                    ${c.quote ? `<div class="collab-comment-quote">${escapeHtml(c.quote)}</div>` : ""}
                    <div class="collab-comment-body">${escapeHtml(c.body)}</div>
                    ${replies.map((r) => `<div class="collab-comment-reply"><strong>${escapeHtml(r.byLabel)}</strong> ${escapeHtml(r.body)}</div>`).join("")}
                    <div class="collab-comment-actions">${replyBtn}${resolveBtn}</div>
                    ${inlineReply}
                </article>`;
            })
            .join("");

        if (replyTargetId) {
            const box = commentList.querySelector(`.collab-reply-input[data-parent-id="${replyTargetId}"]`);
            box?.addEventListener("input", () => {
                replyDraftText = box.value || "";
            });
            box?.focus();
        }

        commentList.querySelectorAll("[data-comment-action]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                const action = btn.getAttribute("data-comment-action");
                const comment = comments.find((x) => x.id === id);
                if (action === "reply" && comment) {
                    openCommentComposer(comment.quote || "", comment.paragraphIndex ?? 0, comment.id);
                    return;
                }
                if (action === "cancel-reply") {
                    closeCommentComposer();
                    return;
                }
                if (action === "post-reply" && comment) {
                    const box = commentList.querySelector(`.collab-reply-input[data-parent-id="${id}"]`);
                    const body = String(box?.value || replyDraftText || "").trim();
                    if (!body) return;
                    if (isPreview) {
                        comments.push({
                            id: `c-${Date.now()}`,
                            by: activeRole,
                            byLabel: `@${activeRole}`,
                            paragraphIndex: comment.paragraphIndex,
                            quote: "",
                            body,
                            status: "open",
                            parentId: comment.id,
                        });
                        closeCommentComposer();
                        renderCommentList();
                        return;
                    }
                    btn.disabled = true;
                    try {
                        await submitCollabComment(bookId, chapterId, comment.paragraphIndex, "", body, comment.id);
                        closeCommentComposer();
                        await refreshComments();
                        setSidebarTab("comments");
                    } catch (err) {
                        alert(err?.message || "Could not post reply.");
                    } finally {
                        btn.disabled = false;
                    }
                    return;
                }
                if ((action === "resolve" || action === "reopen") && comment) {
                    if (isPreview) {
                        comment.status = action === "resolve" ? "resolved" : "open";
                        renderCommentList();
                        return;
                    }
                    btn.disabled = true;
                    try {
                        await resolveCollabComment(id, action);
                        await refreshComments();
                    } catch (err) {
                        alert(err?.message || "Could not update comment.");
                    } finally {
                        btn.disabled = false;
                    }
                }
            });
        });
    }

    async function refreshComments() {
        if (isPreview) return;
        try {
            const rows = await listCollabComments(bookId, chapterId);
            comments = rows.map(commentRowToComment);
            renderCommentList();
        } catch {
            /* ignore */
        }
    }

    function renderAll() {
        renderModeBanner();
        mountEditorMode();
        renderHunkList();
        renderCommentList();
        updateStats();
        renderPresence();
    }

    function startRealtime() {
        if (isPreview || !bookId || !chapterId || !currentUserId || realtimeStarted) return;
        realtimeSession = createCollabRealtimeSession({
            bookId,
            chapterId,
            userId: currentUserId,
            userLabel: currentUserLabel,
            isAuthor,
            onRemoteDoc: (html) => applyRemoteHtml(html),
            onRemotePersisted: (html) => applyRemoteHtml(html),
            onSuggestionsChange: () => {},
            onCommentsChange: () => {
                window.clearTimeout(refreshTimer);
                refreshTimer = window.setTimeout(refreshComments, 280);
            },
            onPresenceChange: renderPresence,
        });
        // Don't sync empty suggestion payloads into DB — marks live in HTML
        const origNotify = realtimeSession.notifyInput.bind(realtimeSession);
        realtimeSession.notifyInput = (html, hash) => origNotify(html, hash, []);
        realtimeSession.connect();
        realtimeStarted = true;
    }

    async function reloadLiveRoom(options = {}) {
        const chapter = await getCollabChapter(bookId, chapterId);
        contentHash = chapter.content_hash || "";
        baseChapterHtml = prepareCollaboratorChapterHtml(chapter.content || "");
        isAuthor = !!chapter.is_author;
        const rawLive = chapter.live_html || chapter.content || "";
        liveHtml = prepareCollaboratorChapterHtml(rawLive);
        // If the stored draft had empty-paragraph spam / layout junk, write the cleaned version back
        if (!isPreview) {
            const rawEmpty = (String(rawLive).match(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi) || []).length;
            const cleanEmpty = (String(liveHtml).match(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi) || []).length;
            const hadLayoutJunk = /margin-top\s*:|min-height\s*:|(?:^|;)\s*height\s*:/i.test(String(rawLive));
            if (rawEmpty > cleanEmpty || hadLayoutJunk || rawEmpty > 2) {
                upsertCollabLiveDraft(bookId, chapterId, liveHtml, chapter.content_hash || contentHash).catch(() => {});
            }
        }
        const paras = htmlToParagraphTexts(baseChapterHtml);
        setHeader(
            chapter.book_title || "Untitled",
            chapter.chapter_title || "Chapter",
            `${paras.join(" ").split(/\s+/).filter(Boolean).length.toLocaleString()} words · suggesting`
        );
        try {
            comments = (await listCollabComments(bookId, chapterId)).map(commentRowToComment);
        } catch {
            comments = [];
        }
        if (options.applyManuscript || document.activeElement !== manuscript) {
            renderAll();
        } else {
            syncHunksFromDom();
            renderHunkList();
            renderCommentList();
            updateStats();
        }
        startRealtime();
    }

    function bootDemo() {
        document.getElementById("testBanner")?.classList.remove("hidden");
        roleTabs?.classList.remove("hidden");
        activeRole = params.get("role") || "author";
        isAuthor = activeRole === "author";
        currentUserLabel = `@${activeRole}`;
        currentUserId = activeRole;
        comments = DEMO_COMMENTS.map((c) => ({ ...c }));
        baseChapterHtml = paragraphsToEditableHtml([...DEMO_CANON]);
        // Seed a demo suggestion mark for author view
        liveHtml = baseChapterHtml.replace(
            "crows and cart wheels",
            `<span class="collab-suggest-del" data-suggest-id="demo-1" data-by="alex" data-by-label="@alex">crows and cart wheels</span><span class="collab-suggest-add" data-suggest-id="demo-1" data-by="alex" data-by-label="@alex">crows, cart wheels, and the last stars</span>`
        );
        setHeader(DEMO_ROOM.bookTitle, DEMO_ROOM.chapterTitle, DEMO_ROOM.chapterMeta);

        previewChannel = new BroadcastChannel("alysum-collab-preview");
        previewChannel.onmessage = (ev) => {
            const msg = ev.data;
            if (!msg || msg.role === activeRole) return;
            if (msg.type === "doc") applyRemoteHtml(msg.html);
        };

        roleTabs.querySelectorAll(".collab-role-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                activeRole = tab.getAttribute("data-role");
                isAuthor = activeRole === "author";
                currentUserId = activeRole;
                currentUserLabel = `@${activeRole}`;
                roleTabs.querySelectorAll(".collab-role-tab").forEach((t) => {
                    t.classList.toggle("is-active", t.getAttribute("data-role") === activeRole);
                });
                renderAll();
            });
        });

        document.getElementById("acceptAllBtn")?.addEventListener("click", () => acceptAll().catch((e) => alert(e.message)));
        document.getElementById("rejectAllBtn")?.addEventListener("click", () => rejectAll().catch((e) => alert(e.message)));
        document.getElementById("repairDraftBtn")?.addEventListener("click", () => repairLiveDraft().catch((e) => alert(e.message)));
        document.getElementById("repairDraftBtnCollab")?.addEventListener("click", () => repairLiveDraft().catch((e) => alert(e.message)));
        document.getElementById("removeMySuggestionsBtn")?.addEventListener("click", () =>
            withdrawMine().catch((e) => alert(e.message || "Could not remove suggestions."))
        );
        renderAll();
    }

    async function bootLive() {
        const session = await resolveStudioSession(supabase);
        if (!session?.user) {
            const next = window.location.pathname + window.location.search;
            window.location.href = `login.html?next=${encodeURIComponent(next)}`;
            return;
        }
        currentUserId = session.user.id;
        currentUserLabel =
            session.profile?.username || session.profile?.display_name || session.user.email?.split("@")[0] || "You";
        if (!currentUserLabel.startsWith("@")) currentUserLabel = `@${currentUserLabel}`;

        if (inviteToken && !bookId) {
            try {
                const membership = await acceptCollabChapterInvite(inviteToken);
                bookId = membership.book_id;
                chapterId = membership.chapter_id;
                const url = new URL(window.location.href);
                url.searchParams.delete("invite");
                url.searchParams.set("book", bookId);
                url.searchParams.set("chapter", chapterId);
                window.history.replaceState({}, "", url.pathname + url.search);
            } catch (err) {
                if (isCollabRoomsSchemaMissing(err)) {
                    showError("Collab rooms are not set up. Run supabase-collab-rooms.sql in Supabase.");
                    return;
                }
                showError(err?.message || "Could not accept invite.");
                return;
            }
        }

        if (!bookId || !chapterId) {
            showError("Missing book or chapter. Open a collab invite link.");
            return;
        }

        try {
            await reloadLiveRoom({ applyManuscript: true });
        } catch (err) {
            if (isCollabRoomsSchemaMissing(err)) {
                showError("Collab rooms are not set up. Run supabase-collab-rooms.sql in Supabase.");
                return;
            }
            showError(err?.message || "Could not open collab room.");
            return;
        }

        document.getElementById("acceptAllBtn")?.addEventListener("click", async () => {
            try {
                await acceptAll();
            } catch (err) {
                alert(err?.message || "Could not accept all.");
            }
        });
        document.getElementById("rejectAllBtn")?.addEventListener("click", async () => {
            try {
                await rejectAll();
            } catch (err) {
                alert(err?.message || "Could not reject all.");
            }
        });
        const runRepair = async () => {
            try {
                await repairLiveDraft();
            } catch (err) {
                alert(err?.message || "Could not fix spacing.");
            }
        };
        document.getElementById("repairDraftBtn")?.addEventListener("click", runRepair);
        document.getElementById("repairDraftBtnCollab")?.addEventListener("click", runRepair);
        document.getElementById("removeMySuggestionsBtn")?.addEventListener("click", async () => {
            const btn = document.getElementById("removeMySuggestionsBtn");
            btn.disabled = true;
            try {
                await withdrawMine();
            } catch (err) {
                alert(err?.message || "Could not remove your suggestions.");
            } finally {
                btn.disabled = false;
            }
        });
    }

    window.addEventListener("beforeunload", () => {
        unmountSuggesting?.();
        realtimeSession?.disconnect();
        previewChannel?.close();
    });

    document.getElementById("backBtn").href = "collab-rooms.html";

    if (isPreview) bootDemo();
    else await bootLive();
}
