/**
 * Collab room page — author review + collaborator editing with suggestion submit.
 */

import { supabase } from "../firebase.js";
import { resolveStudioSession } from "./studio-session.js?v=3";
import {
    acceptCollabChapterInvite,
    getCollabChapter,
    listCollabSuggestions,
    submitCollabSuggestions,
    reviewCollabSuggestion,
    isCollabRoomsSchemaMissing,
} from "./collab-rooms-api.js?v=4";
import {
    DEMO_ROOM,
    DEMO_HUNKS,
    DEMO_CANON,
} from "./collab-rooms-demo.js?v=2";
import {
    htmlToParagraphTexts,
    renderAuthorManuscriptHtml,
    paragraphsToEditableHtml,
    diffChapterHtmlSuggestions,
    normalizeManuscriptHtml,
    prepareCollaboratorChapterHtml,
    hunkPreviewHtml,
    countPending,
    escapeHtml,
    suggestionRowToHunk,
} from "./collab-room-render.js?v=5";
import { mountCollabToolbar } from "./collab-toolbar.js?v=1";

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
    /** @type {string[]} */
    let canonParagraphs = [];
    /** @type {import("./collab-room-render.js").CollabHunk[]} */
    let hunks = [];

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
                    ? "All suggestions reviewed"
                    : `${pending} suggestion${pending === 1 ? "" : "s"} waiting · ${collaborators} collaborator${collaborators === 1 ? "" : "s"}`;
            document.getElementById("acceptAllBtn").disabled = pending === 0;
            document.getElementById("rejectAllBtn").disabled = pending === 0;
            return;
        }

        const mine = hunks.filter(isMyHunk);
        const minePending = mine.filter((h) => h.status === "pending").length;
        reviewSub.textContent = mine.length
            ? `${minePending} of your suggestion${minePending === 1 ? "" : "s"} pending review`
            : "Submit edits from the manuscript — they'll appear here.";
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
                    ? "When collaborators submit edits, they'll appear here for you to accept or reject."
                    : "Edits you submit will appear here for the author to review.";
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
                        ? `<span class="new">${hunkPreviewHtml(h.newText)}</span>`
                        : `<span class="old">${hunkPreviewHtml(h.oldText)}</span><span class="new">${hunkPreviewHtml(h.newText)}</span>`;
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
                    await reloadLiveRoom();
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
        manuscript.querySelectorAll("[data-hunk]").forEach((el) => {
            el.style.outline = el.getAttribute("data-hunk") === hunkId ? "2px solid #22c55e" : "";
        });
        hunkList.querySelectorAll(".collab-hunk").forEach((el) => {
            el.classList.toggle("is-selected", el.getAttribute("data-hunk-id") === hunkId);
        });
    }

    function collaboratorManuscriptHtml() {
        const html = String(baseChapterHtml || "").trim();
        if (html) return prepareCollaboratorChapterHtml(html);
        return paragraphsToEditableHtml(canonParagraphs);
    }

    function renderManuscript() {
        if (isAuthor) {
            manuscript.removeAttribute("contenteditable");
            collabToolbar?.classList.add("hidden");
            manuscript.innerHTML = renderAuthorManuscriptHtml(baseChapterHtml, hunks);
            manuscript.querySelectorAll("[data-hunk]").forEach((el) => {
                el.addEventListener("mouseenter", () => highlightHunk(el.getAttribute("data-hunk")));
            });
            return;
        }
        manuscript.setAttribute("contenteditable", "true");
        manuscript.setAttribute("spellcheck", "true");
        collabToolbar?.classList.remove("hidden");
        manuscript.innerHTML = collaboratorManuscriptHtml();
        if (!manuscript.innerHTML.trim()) manuscript.innerHTML = "<p><br></p>";
    }

    function renderModeBanner() {
        document.body.classList.toggle("collab-author-mode", isAuthor);
        reviewPanel?.classList.remove("hidden");

        if (isAuthor) {
            modeBanner.classList.add("is-author");
            modeBannerLabel.textContent = "Author review";
            modeBannerText.textContent =
                "Green highlights in the manuscript match suggestions in the sidebar. Accept to merge into your draft.";
            reviewTitle.textContent = "Suggested edits";
            document.getElementById("bulkActions")?.classList.remove("hidden");
            sidebarSubmit?.classList.add("hidden");
            return;
        }

        modeBanner.classList.remove("is-author");
        modeBannerLabel.textContent = "Collaborator · editor";
        modeBannerText.textContent =
            "Edit the chapter, then submit. Your suggestions appear in the sidebar until the author approves.";
        reviewTitle.textContent = "Your submissions";
        document.getElementById("bulkActions")?.classList.add("hidden");
        sidebarSubmit?.classList.remove("hidden");
    }

    function renderAll() {
        renderModeBanner();
        renderManuscript();
        renderHunkList();
        updateStats();
    }

    async function reloadLiveRoom() {
        const chapter = await getCollabChapter(bookId, chapterId);
        contentHash = chapter.content_hash || "";
        baseChapterHtml = chapter.content || "";
        isAuthor = !!chapter.is_author;
        canonParagraphs = htmlToParagraphTexts(baseChapterHtml);
        const wordCount = canonParagraphs.join(" ").split(/\s+/).filter(Boolean).length;
        setHeader(
            chapter.book_title || "Untitled",
            chapter.chapter_title || "Chapter",
            `${wordCount.toLocaleString()} words · invite-only collab`
        );
        const rows = await listCollabSuggestions(bookId, chapterId);
        hunks = rows.map(suggestionRowToHunk);
        renderAll();
    }

    function bootDemo() {
        document.getElementById("testBanner")?.classList.remove("hidden");
        roleTabs?.classList.remove("hidden");
        activeRole = params.get("role") || "author";
        isAuthor = activeRole === "author";
        hunks = DEMO_HUNKS.map((h) => ({ ...h }));
        canonParagraphs = [...DEMO_CANON];
        baseChapterHtml = paragraphsToEditableHtml(canonParagraphs);
        setHeader(DEMO_ROOM.bookTitle, DEMO_ROOM.chapterTitle, DEMO_ROOM.chapterMeta);

        roleTabs.querySelectorAll(".collab-role-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                activeRole = tab.getAttribute("data-role");
                isAuthor = activeRole === "author";
                roleTabs.querySelectorAll(".collab-role-tab").forEach((t) => {
                    t.classList.toggle("is-active", t.getAttribute("data-role") === activeRole);
                });
                renderAll();
            });
        });

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
            alert("Demo mode — use a real invite link for live suggestions.");
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
                await reloadLiveRoom();
            } catch (err) {
                alert(err?.message || "Could not accept all suggestions.");
                await reloadLiveRoom();
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
                await reloadLiveRoom();
            } catch (err) {
                alert(err?.message || "Could not reject all suggestions.");
                await reloadLiveRoom();
            } finally {
                acceptBtn.disabled = false;
                rejectBtn.disabled = false;
            }
        });

        document.getElementById("submitBtn").addEventListener("click", async () => {
            const normalizedBase = prepareCollaboratorChapterHtml(baseChapterHtml);
            const nextHtml = normalizeManuscriptHtml(manuscript.innerHTML);
            const suggestions = diffChapterHtmlSuggestions(normalizedBase, nextHtml);
            if (!suggestions.length) {
                alert("No changes to submit. Edit text or formatting, then submit.");
                return;
            }
            const summary =
                suggestions.length === 1
                    ? "Submit 1 suggestion for author review?"
                    : `Submit ${suggestions.length} paragraph changes for author review?`;
            if (!window.confirm(summary)) return;

            const btn = document.getElementById("submitBtn");
            btn.disabled = true;
            try {
                const count = await submitCollabSuggestions(bookId, chapterId, contentHash, suggestions);
                if (count) {
                    alert(`Submitted ${count} suggestion${count === 1 ? "" : "s"} for author review.`);
                } else {
                    alert("Nothing new to submit.");
                }
                await reloadLiveRoom();
            } catch (err) {
                const msg = /stale_base_hash/i.test(err?.message || "")
                    ? "The chapter changed since you opened it. Refresh and try again."
                    : err?.message || "Could not submit suggestions.";
                alert(msg);
            } finally {
                btn.disabled = false;
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
