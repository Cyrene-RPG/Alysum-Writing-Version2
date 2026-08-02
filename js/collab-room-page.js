/**
 * Collab room page — real-time shared editing + author review.
 */

import { supabase } from "../firebase.js";
import { resolveStudioSession } from "./studio-session.js?v=3";
import {
    acceptCollabChapterInvite,
    getCollabChapter,
    listCollabSuggestions,
    reviewCollabSuggestion,
    listCollabComments,
    submitCollabComment,
    resolveCollabComment,
    isCollabRoomsSchemaMissing,
} from "./collab-rooms-api.js?v=6";
import {
    DEMO_ROOM,
    DEMO_HUNKS,
    DEMO_CANON,
    DEMO_COMMENTS,
} from "./collab-rooms-demo.js?v=3";
import {
    htmlToParagraphTexts,
    paragraphsToEditableHtml,
    diffChapterHtmlSuggestions,
    normalizeManuscriptHtml,
    prepareCollaboratorChapterHtml,
    hunkPreviewHtml,
    countPending,
    escapeHtml,
    suggestionRowToHunk,
    commentRowToComment,
} from "./collab-room-render.js?v=6";
import { mountCollabToolbar } from "./collab-toolbar.js?v=1";
import { createCollabRealtimeSession } from "./collab-realtime.js?v=1";

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
    let contentHash = "";
    let baseChapterHtml = "";
    let liveHtml = "";
    /** @type {string[]} */
    let canonParagraphs = [];
    /** @type {import("./collab-room-render.js").CollabHunk[]} */
    let hunks = [];
    /** @type {import("./collab-room-render.js").CollabComment[]} */
    let comments = [];
    let activeSidebarTab = "edits";
    /** @type {{ quote: string, paragraphIndex: number } | null} */
    let pendingComment = null;
    let refreshSidebarTimer = 0;
    let currentUserLabel = "You";
    /** @type {ReturnType<typeof createCollabRealtimeSession> | null} */
    let realtimeSession = null;
    /** @type {BroadcastChannel | null} */
    let previewChannel = null;

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
    const draftPreviewBody = document.getElementById("draftPreviewBody");
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

    mountCollabToolbar({ editor: manuscript, toolbar: collabToolbar });

    function setSidebarTab(tab) {
        activeSidebarTab = tab;
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

    function openCommentComposer(quote, paragraphIndex) {
        pendingComment = { quote, paragraphIndex };
        commentQuote && (commentQuote.textContent = quote ? `"${quote}"` : "General comment");
        commentInput.value = "";
        commentComposer?.classList.remove("hidden");
        setSidebarTab("comments");
        commentInput?.focus();
    }

    function closeCommentComposer() {
        pendingComment = null;
        commentComposer?.classList.add("hidden");
        selectionCommentBtn?.classList.add("hidden");
    }

    function paragraphIndexFromSelection() {
        const sel = window.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return -1;
        const node = sel.anchorNode;
        const block = node?.nodeType === Node.TEXT_NODE ? node.parentElement?.closest("p, h2, h3, blockquote, li") : node?.closest?.("p, h2, h3, blockquote, li");
        if (!block || !manuscript.contains(block)) return -1;
        const blocks = [...manuscript.querySelectorAll("p, h2, h3, blockquote, li")];
        return blocks.indexOf(block);
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
        const sel = window.getSelection();
        const quote = sel?.toString().trim() || "";
        const idx = paragraphIndexFromSelection();
        openCommentComposer(quote, Math.max(idx, 0));
    });

    document.getElementById("commentCancelBtn")?.addEventListener("click", closeCommentComposer);

    document.getElementById("commentPostBtn")?.addEventListener("click", async () => {
        const body = String(commentInput?.value || "").trim();
        if (!body) return;
        const quote = pendingComment?.quote || "";
        const paragraphIndex = pendingComment?.paragraphIndex ?? 0;
        if (isPreview) {
            comments.push({
                id: `c-${Date.now()}`,
                by: activeRole,
                byLabel: `@${activeRole}`,
                paragraphIndex,
                quote,
                body,
                status: "open",
                parentId: "",
            });
            closeCommentComposer();
            renderAll();
            return;
        }
        const btn = document.getElementById("commentPostBtn");
        btn.disabled = true;
        try {
            await submitCollabComment(bookId, chapterId, paragraphIndex, quote, body);
            closeCommentComposer();
            await reloadLiveRoom();
        } catch (err) {
            alert(err?.message || "Could not post comment.");
        } finally {
            btn.disabled = false;
        }
    });

    document.addEventListener("selectionchange", () => {
        if (!manuscript?.contains(document.activeElement) && !manuscript?.contains(window.getSelection()?.anchorNode)) return;
        updateSelectionCommentBtn();
    });

    manuscript?.addEventListener("mouseup", updateSelectionCommentBtn);
    manuscript?.addEventListener("keyup", updateSelectionCommentBtn);

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

    function applyRemoteManuscript(html) {
        if (!manuscript || !html) return;
        liveHtml = prepareCollaboratorChapterHtml(html);
        if (realtimeSession) realtimeSession.applyingRemote = true;
        const hadFocus = document.activeElement === manuscript;
        manuscript.innerHTML = liveHtml;
        if (!manuscript.innerHTML.trim()) manuscript.innerHTML = "<p><br></p>";
        if (hadFocus) manuscript.focus();
        if (realtimeSession) realtimeSession.applyingRemote = false;
    }

    function currentSuggestionsPayload() {
        const base = prepareCollaboratorChapterHtml(baseChapterHtml);
        const next = normalizeManuscriptHtml(manuscript?.innerHTML || liveHtml || "");
        return diffChapterHtmlSuggestions(base, next);
    }

    function onManuscriptInput() {
        if (realtimeSession?.applyingRemote) return;
        liveHtml = normalizeManuscriptHtml(manuscript.innerHTML);
        const suggestions = currentSuggestionsPayload();
        if (isPreview) {
            previewChannel?.postMessage({ type: "doc", html: liveHtml, role: activeRole });
            hunks = suggestions.map((s, idx) => ({
                id: `preview-${idx}`,
                by: activeRole,
                byLabel: `@${activeRole}`,
                type: s.change_type,
                oldText: s.old_text,
                newText: s.new_text,
                paragraphIndex: s.paragraph_index,
                status: "pending",
            }));
            renderHunkList();
            updateStats();
            return;
        }
        realtimeSession?.notifyInput(liveHtml, contentHash, suggestions);
    }

    manuscript?.addEventListener("input", onManuscriptInput);

    function scheduleRefreshSidebar() {
        window.clearTimeout(refreshSidebarTimer);
        refreshSidebarTimer = window.setTimeout(refreshSidebar, 280);
    }

    async function refreshSidebar() {
        if (isPreview) return;
        try {
            const rows = await listCollabSuggestions(bookId, chapterId);
            hunks = rows.map(suggestionRowToHunk);
            const commentRows = await listCollabComments(bookId, chapterId);
            comments = commentRows.map(commentRowToComment);
            renderHunkList();
            renderCommentList();
            updateStats();
        } catch (err) {
            console.warn("[collab-room] sidebar refresh failed", err);
        }
    }

    function startRealtimeSession() {
        if (isPreview || !bookId || !chapterId || !currentUserId) return;
        realtimeSession?.disconnect();
        realtimeSession = createCollabRealtimeSession({
            bookId,
            chapterId,
            userId: currentUserId,
            userLabel: currentUserLabel,
            isAuthor,
            onRemoteDoc: (html) => applyRemoteManuscript(html),
            onRemotePersisted: (html) => applyRemoteManuscript(html),
            onSuggestionsChange: scheduleRefreshSidebar,
            onCommentsChange: scheduleRefreshSidebar,
            onPresenceChange: renderPresence,
        });
        realtimeSession.connect();
    }

    window.addEventListener("beforeunload", () => {
        realtimeSession?.disconnect();
        previewChannel?.close();
    });

    function showError(msg) {
        const panel = document.getElementById("errorPanel");
        document.getElementById("errorText").textContent = msg;
        panel?.classList.remove("hidden");
        document.querySelector(".collab-layout")?.classList.add("hidden");
        document.querySelector(".collab-app-frame")?.classList.add("hidden");
        document.getElementById("collabTopbar")?.classList.add("hidden");
        collabToolbar?.classList.add("hidden");
    }

    function setHeader(bookTitle, chapterTitle, meta = "") {
        document.getElementById("topTitle").textContent = bookTitle;
        document.getElementById("topSub").textContent = `${chapterTitle} · invite-only collab`;
        document.getElementById("chapterTitle").textContent = chapterTitle;
        document.getElementById("chapterMeta").textContent = meta;
    }

    function isMyHunk(h) {
        if (currentUserId && h.by === currentUserId) return true;
        if (isPreview && h.by === activeRole) return true;
        return false;
    }

    function updateStats() {
        const pending = countPending(hunks);
        const accepted = hunks.filter((h) => h.status === "accepted").length;
        pendingPill.textContent = `${pending} pending`;
        pendingPill.classList.toggle("pending", pending > 0);
        acceptedPill.textContent = `${accepted} accepted`;

        if (isAuthor) {
            const collaborators = new Set(hunks.filter((h) => h.status === "pending").map((h) => h.by)).size;
            reviewSub.textContent =
                pending === 0
                    ? "Live document — no pending changes vs canon"
                    : `${pending} live change${pending === 1 ? "" : "s"} · ${collaborators} editor${collaborators === 1 ? "" : "s"}`;
            document.getElementById("acceptAllBtn").disabled = pending === 0;
            document.getElementById("rejectAllBtn").disabled = pending === 0;
            return;
        }

        const mine = hunks.filter(isMyHunk);
        const minePending = mine.filter((h) => h.status === "pending").length;
        reviewSub.textContent = minePending
            ? `${minePending} of your live edits pending author review`
            : "Edits sync live — no pending changes vs canon.";
        document.getElementById("acceptAllBtn").disabled = true;
        document.getElementById("rejectAllBtn").disabled = true;
    }

    function renderHunkList() {
        const visibleHunks = isAuthor ? hunks : hunks;
        hunkEmpty?.classList.toggle("hidden", visibleHunks.length > 0);
        hunkList.classList.toggle("hidden", visibleHunks.length === 0);

        if (!visibleHunks.length) {
            hunkList.innerHTML = "";
            if (hunkEmptyHint) {
                hunkEmptyHint.textContent = isAuthor
                    ? "When collaborators edit, changes appear here in real time."
                    : "Your live edits appear here for the author to review.";
            }
            return;
        }

        hunkList.innerHTML = visibleHunks
            .map((h) => {
                const resolved = h.status !== "pending";
                const typeLabel = h.type === "insert" ? "Addition" : h.type === "delete" ? "Deletion" : "Change";
                const statusLabel = h.status === "pending" ? "Pending" : h.status === "accepted" ? "Accepted" : "Rejected";
                const body =
                    h.type === "insert"
                        ? `<span class="new">${hunkPreviewHtml("", h.newText)}</span>`
                        : hunkPreviewHtml(h.oldText, h.newText);
                const actions =
                    resolved || !isAuthor
                        ? `<span class="collab-hunk-status is-${h.status}">${statusLabel}</span>`
                        : `<div class="collab-hunk-actions">
                            <button type="button" class="collab-btn primary" data-action="accept" data-id="${h.id}">Accept</button>
                            <button type="button" class="collab-btn danger" data-action="reject" data-id="${h.id}">Reject</button>
                           </div>`;
                const mine = isMyHunk(h);
                return `<article class="collab-hunk is-${h.status}${resolved ? " is-resolved" : ""}${mine ? " is-mine" : ""}" data-hunk-id="${h.id}" tabindex="0" role="button" aria-label="Suggestion by ${escapeHtml(h.byLabel)}">
                        <div class="collab-hunk-head">
                            <span class="collab-hunk-author" data-by="${escapeHtml(h.by)}">${escapeHtml(h.byLabel)}${mine && !isAuthor ? " · you" : ""}</span>
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
                const hunk = hunks.find((x) => x.id === id);
                if (!hunk || hunk.status !== "pending") return;
                if (isPreview) {
                    hunk.status = action === "accept" ? "accepted" : "rejected";
                    renderAll();
                    return;
                }
                btn.disabled = true;
                try {
                    await reviewCollabSuggestion(id, action === "accept" ? "accept" : "reject");
                    await reloadLiveRoom({ applyManuscript: true });
                } catch (err) {
                    alert(err?.message || "Could not review suggestion.");
                } finally {
                    btn.disabled = false;
                }
            });
        });

        hunkList.querySelectorAll(".collab-hunk").forEach((card) => {
            card.addEventListener("click", () => {
                if (isAuthor) highlightHunk(card.getAttribute("data-hunk-id"));
            });
        });
    }

    function highlightHunk(hunkId) {
        const hunk = hunks.find((x) => x.id === hunkId);
        hunkList.querySelectorAll(".collab-hunk").forEach((el) => {
            el.classList.toggle("is-selected", el.getAttribute("data-hunk-id") === hunkId);
        });
        if (hunk && manuscript) {
            const blocks = manuscript.querySelectorAll("p, h2, h3, blockquote, li");
            blocks[hunk.paragraphIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    function collaboratorManuscriptHtml() {
        const html = String(liveHtml || baseChapterHtml || "").trim();
        if (html) return prepareCollaboratorChapterHtml(html);
        return paragraphsToEditableHtml(canonParagraphs);
    }

    function renderManuscript() {
        manuscript.setAttribute("contenteditable", "true");
        manuscript.setAttribute("spellcheck", "true");
        collabToolbar?.classList.remove("hidden");
        document.body.classList.remove("collab-author-mode");

        if (realtimeSession?.applyingRemote) return;

        const html = collaboratorManuscriptHtml();
        if (document.activeElement !== manuscript || !manuscript.innerHTML.trim()) {
            manuscript.innerHTML = html;
        }
        if (!manuscript.innerHTML.trim()) manuscript.innerHTML = "<p><br></p>";
        liveHtml = normalizeManuscriptHtml(manuscript.innerHTML);
    }

    function renderModeBanner() {
        reviewPanel?.classList.remove("hidden");
        draftPreview?.classList.add("hidden");
        sidebarSubmit?.classList.add("hidden");

        if (isAuthor) {
            modeBanner.classList.add("is-author");
            modeBannerLabel.textContent = "Author · live collab";
            modeBannerText.textContent =
                "Everyone edits the same document in real time. Accept or reject changes in the sidebar to merge into your canon draft.";
            reviewTitle.textContent = "Live suggested edits";
            document.getElementById("bulkActions")?.classList.remove("hidden");
            return;
        }

        modeBanner.classList.remove("is-author");
        modeBannerLabel.textContent = "Live editing";
        modeBannerText.textContent =
            "Changes sync instantly with everyone in the room. Select text and click Comment for feedback.";
        reviewTitle.textContent = "Live edits";
        document.getElementById("bulkActions")?.classList.add("hidden");
    }

    function renderCommentList() {
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
                const resolveBtn =
                    isAuthor || isMyHunk({ by: c.by })
                        ? `<button type="button" class="collab-btn" data-comment-action="${resolved ? "reopen" : "resolve"}" data-id="${c.id}">${resolved ? "Reopen" : "Resolve"}</button>`
                        : "";
                return `<article class="collab-comment${resolved ? " is-resolved" : ""}" data-comment-id="${c.id}">
                    <div class="collab-comment-head">
                        <span class="collab-hunk-author" data-by="${escapeHtml(c.by)}">${escapeHtml(c.byLabel)}</span>
                        <span class="collab-hunk-type">${resolved ? "Resolved" : "Open"}</span>
                    </div>
                    ${c.quote ? `<div class="collab-comment-quote">${escapeHtml(c.quote)}</div>` : ""}
                    <div class="collab-comment-body">${escapeHtml(c.body)}</div>
                    ${replies.map((r) => `<div class="collab-comment-reply"><strong>${escapeHtml(r.byLabel)}</strong> ${escapeHtml(r.body)}</div>`).join("")}
                    <div class="collab-comment-actions">${resolveBtn}</div>
                </article>`;
            })
            .join("");

        commentList.querySelectorAll("[data-comment-action]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                const action = btn.getAttribute("data-comment-action");
                const comment = comments.find((x) => x.id === id);
                if (!comment) return;
                if (isPreview) {
                    comment.status = action === "resolve" ? "resolved" : "open";
                    renderAll();
                    return;
                }
                btn.disabled = true;
                try {
                    await resolveCollabComment(id, action);
                    await reloadLiveRoom({ applyManuscript: false });
                } catch (err) {
                    alert(err?.message || "Could not update comment.");
                } finally {
                    btn.disabled = false;
                }
            });
        });

        commentList.querySelectorAll(".collab-comment").forEach((card) => {
            card.addEventListener("click", () => highlightComment(card.getAttribute("data-comment-id")));
        });
    }

    function highlightComment(commentId) {
        const comment = comments.find((c) => c.id === commentId);
        commentList?.querySelectorAll(".collab-comment").forEach((el) => {
            el.classList.toggle("is-selected", el.getAttribute("data-comment-id") === commentId);
        });
        if (comment?.quote && manuscript) {
            const walker = document.createTreeWalker(manuscript, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const text = node.textContent || "";
                const idx = text.indexOf(comment.quote);
                if (idx >= 0) {
                    const range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + comment.quote.length);
                    range.startContainer.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
                    break;
                }
            }
        }
    }

    function renderAll() {
        renderModeBanner();
        renderManuscript();
        renderHunkList();
        renderCommentList();
        updateStats();
    }

    async function reloadLiveRoom(options = {}) {
        const chapter = await getCollabChapter(bookId, chapterId);
        contentHash = chapter.content_hash || "";
        baseChapterHtml = chapter.content || "";
        isAuthor = !!chapter.is_author;
        canonParagraphs = htmlToParagraphTexts(baseChapterHtml);

        const canonHash = chapter.content_hash || "";
        const liveBaseHash = chapter.live_base_hash || canonHash;
        if (!chapter.live_html || liveBaseHash === canonHash) {
            liveHtml = prepareCollaboratorChapterHtml(chapter.live_html || chapter.content || "");
        } else {
            liveHtml = prepareCollaboratorChapterHtml(chapter.content || "");
        }

        const wordCount = canonParagraphs.join(" ").split(/\s+/).filter(Boolean).length;
        setHeader(
            chapter.book_title || "Untitled",
            chapter.chapter_title || "Chapter",
            `${wordCount.toLocaleString()} words · live collab`
        );
        const rows = await listCollabSuggestions(bookId, chapterId);
        hunks = rows.map(suggestionRowToHunk);
        try {
            const commentRows = await listCollabComments(bookId, chapterId);
            comments = commentRows.map(commentRowToComment);
        } catch {
            comments = [];
        }

        if (options.applyManuscript || document.activeElement !== manuscript) {
            renderAll();
        } else {
            renderHunkList();
            renderCommentList();
            updateStats();
            renderPresence();
        }

        startRealtimeSession();
    }

    function bootDemo() {
        document.getElementById("testBanner")?.classList.remove("hidden");
        roleTabs?.classList.remove("hidden");
        activeRole = params.get("role") || "author";
        isAuthor = activeRole === "author";
        hunks = DEMO_HUNKS.map((h) => ({ ...h }));
        comments = DEMO_COMMENTS.map((c) => ({ ...c }));
        canonParagraphs = [...DEMO_CANON];
        baseChapterHtml = paragraphsToEditableHtml(canonParagraphs);
        liveHtml = baseChapterHtml;
        setHeader(DEMO_ROOM.bookTitle, DEMO_ROOM.chapterTitle, DEMO_ROOM.chapterMeta);

        previewChannel = new BroadcastChannel("alysum-collab-preview");
        previewChannel.onmessage = (event) => {
            const msg = event.data;
            if (!msg || msg.role === activeRole) return;
            if (msg.type === "doc" && msg.html) {
                applyRemoteManuscript(msg.html);
            }
        };

        roleTabs.querySelectorAll(".collab-role-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                activeRole = tab.getAttribute("data-role");
                isAuthor = activeRole === "author";
                currentUserLabel = `@${activeRole}`;
                roleTabs.querySelectorAll(".collab-role-tab").forEach((t) => {
                    t.classList.toggle("is-active", t.getAttribute("data-role") === activeRole);
                });
                renderPresence([{ userId: activeRole, label: `@${activeRole}`, color: "#22c55e" }]);
                renderAll();
            });
        });

        renderPresence([{ userId: activeRole, label: `@${activeRole}`, color: "#22c55e" }]);

        document.getElementById("acceptAllBtn").addEventListener("click", () => {
            hunks.forEach((h) => {
                if (h.status === "pending") h.status = "accepted";
            });
            renderAll();
        });
        document.getElementById("rejectAllBtn").addEventListener("click", () => {
            hunks.forEach((h) => {
                if (h.status === "pending") h.status = "rejected";
            });
            renderAll();
        });
        document.getElementById("submitBtn").addEventListener("click", () => {
            alert("Demo mode — open two preview tabs with different roles to test live sync.");
        });
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
                    showError("Collab rooms are not set up in Supabase yet. Run supabase-collab-rooms.sql in the SQL Editor.");
                    return;
                }
                showError(err?.message || "Could not accept invite.");
                return;
            }
        }

        if (!bookId || !chapterId) {
            showError("Missing book or chapter. Open a collab invite link, or review from Collab rooms.");
            return;
        }

        try {
            await reloadLiveRoom();
        } catch (err) {
            console.error(err);
            if (isCollabRoomsSchemaMissing(err)) {
                showError("Collab rooms are not set up in Supabase yet. Run supabase-collab-rooms.sql in the SQL Editor.");
                return;
            }
            showError(err?.message || "Could not open collab room.");
            return;
        }

        document.getElementById("acceptAllBtn").addEventListener("click", async () => {
            const pending = hunks.filter((h) => h.status === "pending");
            if (!pending.length) return;
            const acceptBtn = document.getElementById("acceptAllBtn");
            const rejectBtn = document.getElementById("rejectAllBtn");
            acceptBtn.disabled = true;
            rejectBtn.disabled = true;
            try {
                for (const h of pending) {
                    await reviewCollabSuggestion(h.id, "accept");
                }
                await reloadLiveRoom({ applyManuscript: true });
            } catch (err) {
                alert(err?.message || "Could not accept all suggestions.");
                await reloadLiveRoom({ applyManuscript: true });
            } finally {
                acceptBtn.disabled = false;
                rejectBtn.disabled = false;
            }
        });

        document.getElementById("rejectAllBtn").addEventListener("click", async () => {
            const pending = hunks.filter((h) => h.status === "pending");
            if (!pending.length) return;
            const acceptBtn = document.getElementById("acceptAllBtn");
            const rejectBtn = document.getElementById("rejectAllBtn");
            acceptBtn.disabled = true;
            rejectBtn.disabled = true;
            try {
                for (const h of pending) {
                    await reviewCollabSuggestion(h.id, "reject");
                }
                await reloadLiveRoom({ applyManuscript: true });
            } catch (err) {
                alert(err?.message || "Could not reject all suggestions.");
                await reloadLiveRoom({ applyManuscript: true });
            } finally {
                acceptBtn.disabled = false;
                rejectBtn.disabled = false;
            }
        });
    }

    hunkList.addEventListener("mouseover", (e) => {
        const card = e.target.closest(".collab-hunk");
        if (card && isAuthor) highlightHunk(card.getAttribute("data-hunk-id"));
    });

    document.getElementById("backBtn").href = "collab-rooms.html";

    if (isPreview) {
        bootDemo();
    } else {
        await bootLive();
    }
}
