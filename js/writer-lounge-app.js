/**
 * Writer's Lounge page app — renders forum index, board topics, and thread posts.
 */

import {
    listLoungeHome,
    listLoungeThreads,
    getLoungeThread,
    getLoungePost,
    createLoungeThread,
    replyLoungeThread,
    toggleLoungeReaction,
    listLoungeOnlineMembers,
    subscribeLoungeThread,
    normalizeBoard,
    normalizeThread,
    normalizePost,
    normalizePagination,
    writersLoungeUrl,
    isWriterLoungeSchemaMissing,
} from "./writer-lounge-api.js?v=4";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥"];

const root = document.getElementById("loungeRoot");
const schemaBanner = document.getElementById("schemaBanner");
const statusBanner = document.getElementById("statusBanner");

let currentUserId = "";
let currentUserName = "You";
let quotePostId = null;
let quotePreview = "";
let cachedCategories = [];
let cachedOnlineMembers = { totalOnline: 0, members: [] };
let loungeRealtimeUnsub = null;
let onlineMembersTimer = null;
let liveThreadContext = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatNumber(value) {
    return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sameDay) return `Today, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate();
    if (isYesterday) return `Yesterday, ${time}`;
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatJoined(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString([], { month: "short", year: "numeric" });
}

function bodyToHtml(body) {
    const withMentions = escapeHtml(body).replace(
        /@([a-zA-Z0-9_][a-zA-Z0-9_-]{0,31})/g,
        '<span class="dc-mention">@$1</span>'
    );
    return withMentions
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
        .join("");
}

function renderReactionsHtml(post) {
    const reactions = Array.isArray(post.reactions) ? post.reactions : [];
    const chips = reactions
        .map(
            (reaction) =>
                `<button type="button" class="dc-reaction${reaction.reacted ? " is-mine" : ""}" data-react="${escapeHtml(reaction.emoji)}" data-post-id="${escapeHtml(post.id)}" title="Toggle ${escapeHtml(reaction.emoji)}">
                    <span class="dc-reaction-emoji">${escapeHtml(reaction.emoji)}</span>
                    <span class="dc-reaction-count">${formatNumber(reaction.count)}</span>
                </button>`
        )
        .join("");
    const quick = QUICK_REACTIONS.map(
        (emoji) =>
            `<button type="button" class="dc-react-add" data-react="${emoji}" data-post-id="${escapeHtml(post.id)}" title="React with ${emoji}">${emoji}</button>`
    ).join("");
    return `<div class="dc-reactions">${chips}${quick}</div>`;
}

function renderPostArticle(post, index, prevPost, board) {
    const compact = shouldCompactMessage(prevPost, post);

    const pct =
        board.slug === "word-count-hype" && post.authorDailyGoal > 0
            ? Math.min(100, Math.round((post.authorTodayWords / post.authorDailyGoal) * 100))
            : 0;
    const signature =
        board.slug === "word-count-hype"
            ? `<div class="dc-signature">
                <span>Today: ${formatNumber(post.authorTodayWords)} / ${formatNumber(post.authorDailyGoal)} words</span>
                <div class="dc-signature-bar"><span style="width:${pct}%;"></span></div>
               </div>`
            : "";
    const quote =
        post.quotePostId && post.quoteBody
            ? `<div class="dc-reply-embed">
                <span class="dc-reply-embed-bar"></span>
                <span class="dc-reply-embed-copy">
                    <span class="dc-reply-embed-author">${escapeHtml(post.quoteAuthorName || "Writer")}</span>
                    <span class="dc-reply-embed-body">${escapeHtml(post.quoteBody)}</span>
                </span>
               </div>`
            : "";

    const avatar = compact
        ? ``
        : `<div class="dc-avatar ${avatarClass(index)}">${escapeHtml(post.authorInitials || "WR")}</div>`;

    const head = compact
        ? `<span class="dc-msg-time-compact">${escapeHtml(formatChatTime(post.createdAt))}</span>`
        : `<div class="dc-msg-head">
                <span class="dc-username" style="color:${usernameColor(index)}">${escapeHtml(post.authorName)}</span>
                <span class="dc-msg-time">${escapeHtml(formatChatTime(post.createdAt))}</span>
           </div>`;

    return `
        <article class="dc-msg${compact ? " is-compact" : ""}" data-post-id="${escapeHtml(post.id)}">
            ${avatar}
            <div class="dc-msg-main">
                ${head}
                ${quote}
                <div class="dc-msg-text">${bodyToHtml(post.body)}</div>
                ${renderReactionsHtml(post)}
                ${signature}
            </div>
            <div class="dc-msg-actions">
                ${QUICK_REACTIONS.map((emoji) => `<button type="button" class="dc-react-quick" data-react="${emoji}" data-post-id="${escapeHtml(post.id)}" title="React ${emoji}">${emoji}</button>`).join("")}
                <button type="button" title="Reply" data-quote="${escapeHtml(post.id)}" data-quote-body="${escapeHtml(post.body.slice(0, 240))}" data-quote-author="${escapeHtml(post.authorName)}">↩</button>
            </div>
        </article>
    `;
}

function renderPostsHtml(posts, board) {
    let lastDay = "";
    return posts
        .map((post, index) => {
            const prev = index > 0 ? posts[index - 1] : null;
            let divider = "";
            if (!sameDay(lastDay, post.createdAt)) {
                divider = `<div class="dc-date-divider"><span>${escapeHtml(formatDateDivider(post.createdAt))}</span></div>`;
                lastDay = post.createdAt;
            }
            return `${divider}${renderPostArticle(post, index, prev, board)}`;
        })
        .join("");
}

async function refreshOnlineMembers() {
    try {
        cachedOnlineMembers = await listLoungeOnlineMembers(50);
        updateMemberSidebar();
    } catch {
        /* migration may not be applied yet */
    }
}

function updateMemberSidebar(memberCount = 0) {
    const aside = root?.querySelector(".dc-members");
    if (!aside) return;
    const members = cachedOnlineMembers.members.map((member, index) => ({
        id: member.id,
        name: member.name,
        initials: member.initials,
        online: true,
        colorIndex: index,
    }));
    const total = memberCount || cachedOnlineMembers.totalOnline || members.length;
    aside.outerHTML = renderMemberSidebar(members, total);
}

function startOnlineMembersPoll() {
    if (onlineMembersTimer) window.clearInterval(onlineMembersTimer);
    void refreshOnlineMembers();
    onlineMembersTimer = window.setInterval(() => {
        void refreshOnlineMembers();
    }, 60_000);
}

function stopOnlineMembersPoll() {
    if (onlineMembersTimer) {
        window.clearInterval(onlineMembersTimer);
        onlineMembersTimer = null;
    }
}

function disconnectLoungeRealtime() {
    loungeRealtimeUnsub?.();
    loungeRealtimeUnsub = null;
    liveThreadContext = null;
}

async function appendLivePost(postId) {
    if (!liveThreadContext || document.querySelector(`[data-post-id="${postId}"]`)) return;
    try {
        const post = await getLoungePost(postId);
        if (!post) return;
        const list = document.getElementById("dcMessages");
        if (!list) return;
        liveThreadContext.posts.push(post);
        const index = liveThreadContext.posts.length - 1;
        const prev = index > 0 ? liveThreadContext.posts[index - 1] : null;
        let divider = "";
        if (!sameDay(prev?.createdAt, post.createdAt)) {
            divider = `<div class="dc-date-divider"><span>${escapeHtml(formatDateDivider(post.createdAt))}</span></div>`;
        }
        list.insertAdjacentHTML("beforeend", divider + renderPostArticle(post, index, prev, liveThreadContext.board));
        bindPostInteractions(list);
        scrollChatToBottom();
        void refreshOnlineMembers();
    } catch {
        /* ignore */
    }
}

async function refreshPostReactions(postId) {
    if (!document.querySelector(`[data-post-id="${postId}"]`)) return;
    try {
        const post = await getLoungePost(postId);
        if (!post) return;
        const article = document.querySelector(`[data-post-id="${postId}"]`);
        const reactionsEl = article?.querySelector(".dc-reactions");
        if (reactionsEl) {
            reactionsEl.outerHTML = renderReactionsHtml(post);
            bindPostInteractions(article.parentElement);
        }
    } catch {
        /* ignore */
    }
}

function bindPostInteractions(scope = root) {
    scope.querySelectorAll("[data-react]").forEach((el) => {
        if (el.dataset.bound) return;
        el.dataset.bound = "1";
        el.addEventListener("click", async () => {
            const postId = el.dataset.postId;
            const emoji = el.dataset.react;
            if (!postId || !emoji) return;
            el.disabled = true;
            try {
                await toggleLoungeReaction(postId, emoji);
                await refreshPostReactions(postId);
            } catch (err) {
                showStatus(err?.message || "Could not react.", true);
            } finally {
                el.disabled = false;
            }
        });
    });
    scope.querySelectorAll("[data-quote]").forEach((el) => {
        if (el.dataset.boundQuote) return;
        el.dataset.boundQuote = "1";
        el.addEventListener("click", () => {
            quotePostId = el.dataset.quote;
            quotePreview = el.dataset.quoteBody || "";
            const author = el.dataset.quoteAuthor || "Writer";
            const quotePreviewEl = document.getElementById("quotePreview");
            const quotePreviewText = document.getElementById("quotePreviewText");
            const quotePreviewAuthor = document.getElementById("quotePreviewAuthor");
            if (quotePreviewEl && quotePreviewText) {
                if (quotePreviewAuthor) quotePreviewAuthor.textContent = author;
                quotePreviewText.textContent = quotePreview;
                quotePreviewEl.classList.remove("is-hidden");
            }
            document.getElementById("replyBody")?.focus();
        });
    });
}

function connectLoungeRealtime(threadId) {
    disconnectLoungeRealtime();
    loungeRealtimeUnsub = subscribeLoungeThread(threadId, {
        onPost: (postId) => {
            void appendLivePost(postId);
        },
        onReaction: (postId) => {
            void refreshPostReactions(postId);
        },
    });
}

function formatChatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    if (sameDay) return `Today at ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate();
    if (isYesterday) return `Yesterday at ${time}`;
    return `${date.toLocaleDateString([], { month: "2-digit", day: "2-digit", year: "numeric" })} ${time}`;
}

function formatDateDivider(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    if (sameDay) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate();
    if (isYesterday) return "Yesterday";
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function sameDay(a, b) {
    if (!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    return (
        da.getFullYear() === db.getFullYear() &&
        da.getMonth() === db.getMonth() &&
        da.getDate() === db.getDate()
    );
}

function shouldCompactMessage(prev, curr) {
    if (!prev || !curr) return false;
    if (prev.authorId !== curr.authorId) return false;
    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(curr.createdAt).getTime();
    if (Number.isNaN(prevTime) || Number.isNaN(currTime)) return false;
    return currTime - prevTime < 7 * 60 * 1000 && sameDay(prev.createdAt, curr.createdAt);
}

const USERNAME_COLORS = ["#c4b5fd", "#86efac", "#7dd3fc", "#f9a8d4", "#fcd34d", "#fdba74"];

function usernameColor(index) {
    return USERNAME_COLORS[index % USERNAME_COLORS.length];
}

function setLoungeLayoutMode() {
    document.body.classList.add("lounge-discord-view");
    document.body.classList.remove("lounge-chat-view", "lounge-browse-view");
    const shell = document.querySelector(".camp-shell");
    shell?.classList.add("is-discord-view");
    shell?.classList.remove("is-chat-view", "is-browse-view");
}

function setChatViewMode() {
    setLoungeLayoutMode();
}

function scrollChatToBottom() {
    const list = document.getElementById("dcMessages");
    if (list) list.scrollTop = list.scrollHeight;
}

function avatarClass(index) {
    const classes = ["", "green", "purple"];
    return classes[index % classes.length];
}

function readRoute() {
    const params = new URLSearchParams(window.location.search);
    const thread = params.get("thread") || "";
    const board = params.get("board") || "";
    const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);
    if (thread) return { view: "thread", threadId: thread, boardSlug: board, page };
    if (board) return { view: "board", boardSlug: board, page };
    return { view: "home", page: 1 };
}

function syncRouteUrl(params = {}, { replace = true } = {}) {
    const url = writersLoungeUrl(params);
    const current = window.location.pathname + window.location.search;
    if (current === url) return;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
}

function navigate(params = {}, { replace = false } = {}) {
    syncRouteUrl(params, { replace });
    return boot();
}

/** Redirect legacy .html URLs to clean path before the server 301 strips query params. */
export function normalizeWritersLoungePath() {
    const path = window.location.pathname.replace(/\\/g, "/");
    if (!/\/writers-lounge\.html$/i.test(path)) return;
    const params = new URLSearchParams(window.location.search);
    const target = writersLoungeUrl({
        board: params.get("board") || undefined,
        thread: params.get("thread") || undefined,
        page: params.get("page") && Number(params.get("page")) > 1 ? Number(params.get("page")) : undefined,
    });
    window.location.replace(target);
}

function showStatus(message, isError = false) {
    if (!statusBanner) return;
    statusBanner.textContent = message;
    statusBanner.hidden = !message;
    statusBanner.dataset.error = isError ? "1" : "0";
}

function renderServerRail() {
    return `
        <nav class="dc-server-rail" aria-label="Servers">
            <button type="button" class="dc-server-icon is-active" data-action="home" title="Writer's Lounge">
                <span aria-hidden="true">WL</span>
            </button>
            <div class="dc-server-divider" aria-hidden="true"></div>
        </nav>
    `;
}

function uniqueMembers(members) {
    const seen = new Map();
    for (const member of members) {
        if (!member?.id || seen.has(member.id)) continue;
        seen.set(member.id, member);
    }
    return [...seen.values()];
}

function membersFromPosts(posts) {
    return uniqueMembers(
        (Array.isArray(posts) ? posts : []).map((post, index) => ({
            id: post.authorId,
            name: post.authorName || "Writer",
            initials: post.authorInitials || "WR",
            online: post.authorId === currentUserId,
            colorIndex: index,
        }))
    );
}

function membersFromThreads(threads) {
    return uniqueMembers(
        (Array.isArray(threads) ? threads : []).flatMap((thread, index) => [
            {
                id: thread.authorId,
                name: thread.authorName || "Writer",
                initials: (thread.authorName || "W").slice(0, 2).toUpperCase(),
                online: thread.authorId === currentUserId,
                colorIndex: index,
            },
            thread.lastPostBy
                ? {
                      id: thread.lastPostBy,
                      name: thread.lastPostByName || "Writer",
                      initials: (thread.lastPostByName || "W").slice(0, 2).toUpperCase(),
                      online: thread.lastPostBy === currentUserId,
                      colorIndex: index + 1,
                  }
                : null,
        ].filter(Boolean))
    );
}

function renderMemberSidebar(members = [], memberCount = 0) {
    const list = uniqueMembers(members);
    const online = list.filter((member) => member.online);
    const offline = list.filter((member) => !member.online);
    const total = memberCount || list.length;

    const renderRow = (member) => `
        <div class="dc-member-row">
            <div class="dc-member-avatar ${avatarClass(member.colorIndex || 0)}">${escapeHtml(member.initials || "WR")}</div>
            <span class="dc-member-name" style="color:${usernameColor(member.colorIndex || 0)}">${escapeHtml(member.name)}</span>
            ${member.online ? `<span class="dc-member-status-dot" title="Online"></span>` : ""}
        </div>
    `;

    return `
        <aside class="dc-members" aria-label="Members">
            <div class="dc-members-head">Members — ${formatNumber(total)}</div>
            <div class="dc-members-scroll">
                ${
                    online.length
                        ? `<div class="dc-members-group">
                            <div class="dc-members-label">Online — ${online.length}</div>
                            ${online.map(renderRow).join("")}
                           </div>`
                        : `<div class="dc-members-group">
                            <div class="dc-members-label">Online — 0</div>
                            <p class="dc-members-empty">Nobody else here yet.</p>
                           </div>`
                }
                ${
                    offline.length
                        ? `<div class="dc-members-group">
                            <div class="dc-members-label">Offline — ${offline.length}</div>
                            ${offline.map(renderRow).join("")}
                           </div>`
                        : ""
                }
            </div>
        </aside>
    `;
}

function renderUserPanel() {
    return `
        <div class="dc-user-panel">
            <div class="dc-user-avatar">${escapeHtml(currentUserName.slice(0, 2).toUpperCase())}</div>
            <div class="dc-user-meta">
                <span class="dc-user-name">${escapeHtml(currentUserName)}</span>
                <span class="dc-user-status">Online</span>
            </div>
            <div class="dc-user-tools">
                <button type="button" class="dc-user-tool" title="Mute" aria-label="Mute">🔇</button>
                <button type="button" class="dc-user-tool" title="Settings" aria-label="Settings">⚙</button>
            </div>
        </div>
    `;
}

function renderChannelToolbar() {
    return `
        <div class="dc-channel-toolbar">
            <button type="button" class="dc-toolbar-btn" title="Threads" aria-label="Threads">#</button>
            <button type="button" class="dc-toolbar-btn" title="Notification settings" aria-label="Notifications">🔔</button>
            <button type="button" class="dc-toolbar-btn" title="Pinned messages" aria-label="Pinned messages">📌</button>
            <button type="button" class="dc-toolbar-btn dc-toolbar-members" title="Hide member list" aria-label="Toggle member list">👥</button>
        </div>
    `;
}

function renderDiscordShell({ activeBoardSlug = "", stageHtml, members = [], memberCount = 0 }) {
    setLoungeLayoutMode();
    return `
        <div class="dc-app">
            ${renderServerRail()}
            ${renderChannelSidebar(cachedCategories, activeBoardSlug)}
            <div class="dc-stage">${stageHtml}</div>
            ${renderMemberSidebar(members, memberCount)}
        </div>
    `;
}

function renderChannelSidebar(categories, activeBoardSlug = "") {
    const groups = (Array.isArray(categories) ? categories : [])
        .map((category) => {
            const boards = Array.isArray(category.boards) ? category.boards : [];
            const channels = boards
                .map((rawBoard) => {
                    const board = normalizeBoard(rawBoard);
                    const active = board.slug === activeBoardSlug ? " is-active" : "";
                    return `
                        <button type="button" class="dc-channel-item${active}" data-board="${escapeHtml(board.slug)}">
                            <span class="dc-channel-hash">#</span>
                            <span class="dc-channel-name">${escapeHtml(board.title)}</span>
                        </button>
                    `;
                })
                .join("");
            return `
                <div class="dc-channel-group">
                    <div class="dc-channel-group-label">${escapeHtml(category.title || category.slug || "Channels")}</div>
                    ${channels}
                </div>
            `;
        })
        .join("");

    return `
        <aside class="dc-sidebar">
            <div class="dc-server-head">
                <button type="button" class="dc-server-name" data-action="home">Writer's Lounge</button>
            </div>
            <nav class="dc-channel-list" aria-label="Channels">${groups}</nav>
            ${renderUserPanel()}
        </aside>
    `;
}

function bindSidebarEvents() {
    root.querySelectorAll('[data-action="home"]').forEach((el) => {
        el.addEventListener("click", () => navigate({}));
    });
    root.querySelectorAll(".dc-server-icon[data-action='home']").forEach((el) => {
        el.addEventListener("click", () => navigate({}));
    });
    root.querySelectorAll(".dc-channel-item[data-board]").forEach((el) => {
        el.addEventListener("click", () => navigate({ board: el.dataset.board }));
    });
    root.querySelector(".dc-toolbar-members")?.addEventListener("click", () => {
        document.querySelector(".dc-app")?.classList.toggle("members-hidden");
    });
}

function renderPagination(pagination, baseParams) {
    const page = pagination.page;
    const totalPages = pagination.totalPages;
    if (totalPages <= 1) return "";

    const prev =
        page > 1
            ? `<button type="button" class="dc-page-btn" data-page="${page - 1}">Previous</button>`
            : "";
    const next =
        page < totalPages
            ? `<button type="button" class="dc-page-btn" data-page="${page + 1}">Next</button>`
            : "";

    return `
        <div class="dc-pagination">
            <span>Page ${page} of ${totalPages}</span>
            <div class="dc-pagination-actions">${prev}${next}</div>
        </div>
    `;
}

function renderHome(data) {
    const stats = data.stats || {};
    cachedCategories = Array.isArray(data.categories) ? data.categories : [];

    const stageHtml = `
        <main class="dc-main">
            <header class="dc-channel-head dc-channel-head--browse">
                <div class="dc-channel-title-row">
                    <span class="dc-hash">#</span>
                    <h1 class="dc-channel-title">welcome</h1>
                </div>
                ${renderChannelToolbar()}
            </header>
            <div class="dc-browse-scroll">
                <div class="dc-welcome-hero">
                    <h2>Welcome to Writer's Lounge</h2>
                    <p>
                        Share daily word counts, swap craft advice, find a writing buddy,
                        and cheer each other on. Be kind — no full manuscripts in public channels.
                    </p>
                </div>
                <div class="dc-stat-row">
                    <div class="dc-stat-pill"><strong>${formatNumber(stats.memberCount || 0)}</strong> members</div>
                    <div class="dc-stat-pill"><strong>${formatNumber(stats.topicCount || 0)}</strong> topics</div>
                    <div class="dc-stat-pill"><strong>${formatNumber(stats.postCount || 0)}</strong> posts</div>
                </div>
                <p class="dc-browse-foot">
                    Pick a channel on the left to jump in ·
                    <a href="terms-of-service.html">Community guidelines</a>
                </p>
            </div>
        </main>
    `;

    root.innerHTML = renderDiscordShell({
        activeBoardSlug: "",
        stageHtml,
        members: cachedOnlineMembers.members.map((member, index) => ({
            id: member.id,
            name: member.name,
            initials: member.initials,
            online: true,
            colorIndex: index,
        })),
        memberCount: stats.memberCount || cachedOnlineMembers.totalOnline || 0,
    });
    syncRouteUrl({});
    void refreshOnlineMembers();
}

function renderBoard(data, page) {
    const board = normalizeBoard(data.board);
    const threads = (Array.isArray(data.threads) ? data.threads : []).map(normalizeThread);
    const pagination = normalizePagination(data.pagination);

    const threadRows = threads
        .map((thread) => {
            const pin = thread.isSticky
                ? `<span class="dc-thread-pin">${thread.isAnnouncement ? "📢" : "📌"}</span>`
                : "";
            return `
                <button type="button" class="dc-thread-row${thread.isSticky ? " is-pinned" : ""}" data-thread="${escapeHtml(thread.id)}">
                    <div class="dc-thread-row-top">
                        ${pin}
                        <span class="dc-thread-row-title">${escapeHtml(thread.title)}</span>
                    </div>
                    <div class="dc-thread-row-meta">
                        Started by ${escapeHtml(thread.authorName)} ·
                        ${formatNumber(thread.replyCount)} replies ·
                        ${formatNumber(thread.viewCount)} views ·
                        last by ${escapeHtml(thread.lastPostByName || thread.authorName)}
                        · ${escapeHtml(formatDate(thread.lastPostAt || thread.createdAt))}
                    </div>
                </button>
            `;
        })
        .join("");

    const newTopicBtn = board.canPost
        ? `<button type="button" class="dc-btn-primary" id="newTopicBtn">New Post</button>`
        : `<span class="dc-channel-badge">Staff only</span>`;

    const stageHtml = `
        <main class="dc-main">
            <header class="dc-channel-head dc-channel-head--browse">
                <div class="dc-channel-title-row">
                    <span class="dc-hash">#</span>
                    <h1 class="dc-channel-title">${escapeHtml(board.title)}</h1>
                </div>
                <div class="dc-channel-head-actions">
                    ${newTopicBtn}
                    ${renderChannelToolbar()}
                </div>
            </header>
            <div class="dc-channel-topic">${escapeHtml(board.description)}</div>
            <div class="dc-browse-scroll">
                <div class="dc-thread-list">
                    ${threadRows || `<div class="dc-empty">No posts yet. Start the conversation.</div>`}
                </div>
                ${renderPagination(pagination, { board: board.slug })}
            </div>
        </main>
    `;

    root.innerHTML =
        renderDiscordShell({
            activeBoardSlug: board.slug,
            stageHtml,
            members: membersFromThreads(threads),
            memberCount: cachedOnlineMembers.totalOnline || 0,
        }) +
        `
        <div class="dc-modal is-hidden" id="newTopicModal" aria-hidden="true">
            <div class="dc-modal-panel">
                <header class="dc-modal-head">
                    <h2>Create post in #${escapeHtml(board.title)}</h2>
                    <button type="button" class="dc-modal-close" id="cancelTopicBtn" aria-label="Close">×</button>
                </header>
                <div class="dc-modal-body">
                    <label for="newTopicTitle">Title</label>
                    <input type="text" id="newTopicTitle" maxlength="200" placeholder="What's on your mind?" />
                    <label for="newTopicBody">Message</label>
                    <textarea id="newTopicBody" placeholder="Share your update, question, or invite…"></textarea>
                    <div class="dc-modal-actions">
                        <button type="button" class="dc-btn-primary" id="submitTopicBtn">Create post</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    syncRouteUrl({ board: board.slug, page: page > 1 ? page : undefined });
    void refreshOnlineMembers();
}

function renderThread(data, page) {
    const board = normalizeBoard(data.board);
    const thread = normalizeThread(data.thread);
    const posts = (Array.isArray(data.posts) ? data.posts : []).map(normalizePost);
    const pagination = normalizePagination(data.pagination);
    quotePostId = null;
    quotePreview = "";

    const messageHtml = renderPostsHtml(posts, board);

    const loadEarlier =
        pagination.page > 1
            ? `<button type="button" class="dc-load-earlier" data-page="${pagination.page - 1}">Load earlier messages</button>`
            : "";

    const composer = board.canPost && thread.status === "open"
        ? `
            <footer class="dc-composer">
                <div class="dc-reply-preview is-hidden" id="quotePreview">
                    <span class="dc-reply-preview-bar"></span>
                    <div class="dc-reply-preview-copy">
                        <span class="dc-reply-preview-label">Replying to <strong id="quotePreviewAuthor"></strong></span>
                        <span class="dc-reply-preview-text" id="quotePreviewText"></span>
                    </div>
                    <button type="button" class="dc-reply-preview-close" id="clearQuoteBtn" aria-label="Cancel reply">×</button>
                </div>
                <div class="dc-composer-box">
                    <button type="button" class="dc-composer-plus" tabindex="-1" aria-hidden="true">+</button>
                    <textarea id="replyBody" rows="1" spellcheck="true" placeholder="Message #${escapeHtml(thread.title.slice(0, 60))}"></textarea>
                    <div class="dc-composer-tools">
                        <button type="button" class="dc-tool-btn" tabindex="-1" aria-hidden="true">GIF</button>
                        <button type="button" class="dc-tool-btn dc-tool-emoji" tabindex="-1" aria-hidden="true">☺</button>
                    </div>
                    <button type="button" class="dc-send-hidden" id="submitReplyBtn">Send</button>
                </div>
            </footer>
        `
        : `<footer class="dc-composer is-readonly"><p class="dc-composer-hint">This channel is read-only.</p></footer>`;

    const stageHtml = `
        <div class="dc-thread">
            <header class="dc-channel-head">
                <button type="button" class="dc-back" data-action="board" data-slug="${escapeHtml(board.slug)}" aria-label="Back to ${escapeHtml(board.title)}">←</button>
                <div class="dc-channel-title-row">
                    <span class="dc-hash">#</span>
                    <h1 class="dc-channel-title">${escapeHtml(thread.title)}</h1>
                </div>
                ${renderChannelToolbar()}
            </header>
            <div class="dc-channel-topic">${escapeHtml(board.title)} · ${formatNumber(thread.postCount || posts.length)} messages</div>
            <div class="dc-messages" id="dcMessages">
                ${loadEarlier}
                ${messageHtml || `<div class="dc-empty">No messages yet. Say hello.</div>`}
            </div>
            ${composer}
        </div>
    `;

    root.innerHTML = renderDiscordShell({
        activeBoardSlug: board.slug,
        stageHtml,
        members: cachedOnlineMembers.members.length
            ? cachedOnlineMembers.members.map((member, index) => ({
                  id: member.id,
                  name: member.name,
                  initials: member.initials,
                  online: true,
                  colorIndex: index,
              }))
            : membersFromPosts(posts),
        memberCount: cachedOnlineMembers.totalOnline || 0,
    });
    liveThreadContext = { threadId: thread.id, board, posts: [...posts] };
    connectLoungeRealtime(thread.id);
    syncRouteUrl({
        board: board.slug,
        thread: thread.id,
        page: page > 1 ? page : undefined,
    });
    void refreshOnlineMembers();
}

function bindHomeEvents() {
    bindSidebarEvents();
}

function bindBoardEvents(boardSlug) {
    bindSidebarEvents();
    root.querySelectorAll("[data-thread]").forEach((el) => {
        el.addEventListener("click", () => navigate({ board: boardSlug, thread: el.dataset.thread }));
    });
    root.querySelectorAll(".dc-pagination [data-page]").forEach((el) => {
        el.addEventListener("click", () => navigate({ board: boardSlug, page: Number(el.dataset.page) }));
    });

    const modal = document.getElementById("newTopicModal");
    const openBtn = document.getElementById("newTopicBtn");
    const cancelBtn = document.getElementById("cancelTopicBtn");
    const submitBtn = document.getElementById("submitTopicBtn");

    openBtn?.addEventListener("click", () => {
        modal?.classList.remove("is-hidden");
        modal?.setAttribute("aria-hidden", "false");
    });
    cancelBtn?.addEventListener("click", () => {
        modal?.classList.add("is-hidden");
        modal?.setAttribute("aria-hidden", "true");
    });
    submitBtn?.addEventListener("click", async () => {
        const title = document.getElementById("newTopicTitle")?.value || "";
        const body = document.getElementById("newTopicBody")?.value || "";
        if (!title.trim() || !body.trim()) {
            showStatus("Subject and message are required.", true);
            return;
        }
        submitBtn.disabled = true;
        try {
            const threadId = await createLoungeThread(boardSlug, title, body);
            showStatus("");
            navigate({ board: boardSlug, thread: threadId });
        } catch (err) {
            showStatus(err?.message || "Could not create topic.", true);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function bindThreadEvents(boardSlug, threadId) {
    bindSidebarEvents();
    bindPostInteractions();
    root.querySelectorAll('[data-action="board"]').forEach((el) => {
        el.addEventListener("click", () => navigate({ board: el.dataset.slug || boardSlug }));
    });
    root.querySelectorAll(".dc-load-earlier").forEach((el) => {
        el.addEventListener("click", () =>
            navigate({ board: boardSlug, thread: threadId, page: Number(el.dataset.page) })
        );
    });

    const quotePreviewEl = document.getElementById("quotePreview");
    const quotePreviewText = document.getElementById("quotePreviewText");
    const quotePreviewAuthor = document.getElementById("quotePreviewAuthor");
    const clearQuoteBtn = document.getElementById("clearQuoteBtn");
    const replyBody = document.getElementById("replyBody");
    const submitReplyBtn = document.getElementById("submitReplyBtn");

    clearQuoteBtn?.addEventListener("click", () => {
        quotePostId = null;
        quotePreview = "";
        quotePreviewEl?.classList.add("is-hidden");
    });

    replyBody?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitReplyBtn?.click();
        }
    });

    submitReplyBtn?.addEventListener("click", async () => {
        const body = replyBody?.value || "";
        if (!body.trim()) {
            showStatus("Message cannot be empty.", true);
            return;
        }
        submitReplyBtn.disabled = true;
        try {
            const postId = await replyLoungeThread(threadId, body, quotePostId);
            showStatus("");
            if (replyBody) replyBody.value = "";
            quotePostId = null;
            quotePreview = "";
            quotePreviewEl?.classList.add("is-hidden");
            await appendLivePost(postId);
        } catch (err) {
            showStatus(err?.message || "Could not send message.", true);
        } finally {
            submitReplyBtn.disabled = false;
        }
    });

    scrollChatToBottom();
}

async function boot() {
    if (!root) return;
    disconnectLoungeRealtime();
    showStatus("");
    const route = readRoute();
    root.innerHTML = `<p class="camp-page-desc">Loading…</p>`;

    try {
        if (route.view === "home") {
            const data = await listLoungeHome();
            renderHome(data);
            bindHomeEvents();
            return;
        }
        if (route.view === "board") {
            const [homeData, boardData] = await Promise.all([
                listLoungeHome(),
                listLoungeThreads(route.boardSlug, route.page),
            ]);
            cachedCategories = homeData.categories || [];
            renderBoard(boardData, route.page);
            bindBoardEvents(route.boardSlug);
            return;
        }
        if (route.view === "thread") {
            const hasPage = new URLSearchParams(window.location.search).has("page");
            let page = route.page;
            let data;
            let homeData;

            if (!hasPage) {
                const [home, peek] = await Promise.all([
                    listLoungeHome(),
                    getLoungeThread(route.threadId, 1, 50),
                ]);
                homeData = home;
                const lastPage = normalizePagination(peek.pagination).totalPages || 1;
                page = lastPage;
                data =
                    lastPage > 1 ? await getLoungeThread(route.threadId, lastPage, 50) : peek;
            } else {
                [homeData, data] = await Promise.all([
                    listLoungeHome(),
                    getLoungeThread(route.threadId, page, 50),
                ]);
            }

            cachedCategories = homeData.categories || [];
            const boardSlug = normalizeBoard(data.board).slug || route.boardSlug;
            renderThread(data, page);
            bindThreadEvents(boardSlug, route.threadId);
        }
    } catch (err) {
        if (schemaBanner && isWriterLoungeSchemaMissing(err)) {
            schemaBanner.hidden = false;
        }
        if (route.view === "thread" && route.threadId) {
            cachedCategories = cachedCategories.length ? cachedCategories : [];
            root.innerHTML = renderDiscordShell({
                activeBoardSlug: route.boardSlug || "",
                stageHtml: `
                    <div class="dc-thread">
                        <header class="dc-channel-head">
                            <button type="button" class="dc-back" data-action="board" data-slug="${escapeHtml(route.boardSlug || "")}">←</button>
                            <div class="dc-channel-title-row">
                                <span class="dc-hash">#</span>
                                <h1 class="dc-channel-title">Thread</h1>
                            </div>
                        </header>
                        <div class="dc-messages">
                            <div class="dc-empty">Could not load this thread. ${escapeHtml(err?.message || "Unknown error")}</div>
                        </div>
                    </div>
                `,
                members: [],
                memberCount: 0,
            });
            bindSidebarEvents();
            if (route.boardSlug) {
                root.querySelector('[data-action="board"]')?.addEventListener("click", () => {
                    navigate({ board: route.boardSlug });
                });
            }
            syncRouteUrl({
                board: route.boardSlug || undefined,
                thread: route.threadId,
                page: route.page > 1 ? route.page : undefined,
            });
            return;
        }
        root.innerHTML = `<p class="camp-page-desc">Could not load Writer's Lounge. ${escapeHtml(err?.message || "Unknown error")}</p>`;
    }
}

export function initWriterLoungeApp(session) {
    currentUserId = session?.user?.id || "";
    currentUserName =
        session?.user?.email?.split("@")[0] ||
        session?.user?.user_metadata?.display_name ||
        "You";
    normalizeWritersLoungePath();
    startOnlineMembersPoll();
    window.addEventListener("popstate", boot);
    boot();
}
