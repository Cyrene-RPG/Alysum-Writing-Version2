import {
    staffSearchUsers,
    staffUsersOverviewStats,
    staffListOnlineUsers,
} from "./staff-users-api.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
}

function formatRelative(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return formatDate(iso);
}

function presenceCell(user) {
    if (user.is_online) {
        return `<span class="mod-presence is-online"><span class="mod-presence-dot"></span>Online</span>`;
    }
    if (user.is_recent) {
        return `<span class="mod-presence is-recent"><span class="mod-presence-dot"></span>Recent</span>`;
    }
    return `<span class="mod-presence is-offline"><span class="mod-presence-dot"></span>Offline</span>`;
}

function renderFlags(user) {
    const flags = [];
    if (user.account_terminated) flags.push('<span class="mod-flag danger">Terminated</span>');
    else if (user.account_suspended) flags.push('<span class="mod-flag danger">Suspended</span>');
    if (user.publishing_revoked) flags.push('<span class="mod-flag warn">Publishing revoked</span>');
    if (Number(user.active_strikes) > 0) {
        flags.push(`<span class="mod-flag warn">${user.active_strikes} strike(s)</span>`);
    }
    return flags.length ? flags.join("") : '<span class="mod-flag ok">Clear</span>';
}

/**
 * @param {{ showStatus: (msg: string, type?: string) => void }} opts
 */
export function initUsersPanel(opts) {
    const { showStatus } = opts;
    const modStats = document.getElementById("modUsageStats");
    const modOnlineList = document.getElementById("modOnlineList");
    const modSearch = document.getElementById("modSearch");
    const modUsersBody = document.getElementById("modUsersBody");
    const modResultsTitle = document.getElementById("modResultsTitle");
    const modPagination = document.getElementById("modPagination");
    const modPageInfo = document.getElementById("modPageInfo");

    const PAGE_SIZE = 50;
    let offset = 0;
    let total = 0;
    let query = "";
    let filter = "all";

    function renderStats(stats) {
        if (!modStats) return;
        const items = [
            { label: "Online now", value: stats.onlineNow || 0, highlight: true },
            { label: "Active today", value: stats.activeToday || 0 },
            { label: "Active this week", value: stats.activeWeek || 0 },
            { label: "Total users", value: stats.totalUsers || 0 },
            { label: "New today", value: stats.newToday || 0 },
            { label: "New this week", value: stats.newThisWeek || 0 },
            { label: "Authors", value: stats.authors || 0 },
            { label: "Readers", value: stats.readers || 0 },
        ];
        modStats.innerHTML = items.map((item) => `
            <div class="mod-stat${item.highlight && Number(item.value) > 0 ? " is-online-stat" : ""}">
                <div class="mod-stat-label">${escapeHtml(item.label)}</div>
                <div class="mod-stat-value">${item.value}</div>
            </div>
        `).join("");
    }

    function renderOnlineNow(users) {
        if (!modOnlineList) return;
        if (!users?.length) {
            modOnlineList.innerHTML = '<p class="mod-detail-empty">Nobody online right now.</p>';
            return;
        }
        modOnlineList.innerHTML = users.map((u) => `
            <a class="mod-online-chip" href="moderation-user.html?user=${encodeURIComponent(u.id)}">
                <span class="mod-presence-dot"></span>
                <span>@${escapeHtml(u.username)}</span>
                <span class="mod-queue-meta">${escapeHtml(formatRelative(u.last_seen_at))}</span>
            </a>
        `).join("");
    }

    function renderUsers(users) {
        if (!modUsersBody) return;
        if (!users.length) {
            modUsersBody.innerHTML = '<tr><td colspan="8" class="mod-detail-empty">No users found.</td></tr>';
            return;
        }

        modUsersBody.innerHTML = users.map((u) => `
            <tr>
                <td>${presenceCell(u)}</td>
                <td>
                    <a href="moderation-user.html?user=${encodeURIComponent(u.id)}">@${escapeHtml(u.username)}</a>
                    <div class="mod-queue-meta">${escapeHtml(u.display_name)}</div>
                    ${u.email ? `<div class="mod-queue-meta">${escapeHtml(u.email)}</div>` : ""}
                </td>
                <td>${escapeHtml(u.account_type || "—")}</td>
                <td>${u.published_count || 0} pub · ${u.book_count || 0} total</td>
                <td>${Number(u.book_words_total ?? u.words ?? 0).toLocaleString()} words<br><span class="mod-queue-meta">streak ${u.streak || 0}</span></td>
                <td>${renderFlags(u)}</td>
                <td>${escapeHtml(formatDate(u.created_at))}</td>
                <td>${escapeHtml(formatRelative(u.last_seen_at || u.last_sign_in_at || u.last_login))}</td>
            </tr>
        `).join("");
    }

    function updatePagination() {
        if (!modPagination || !modPageInfo) return;
        const hasPages = total > PAGE_SIZE;
        modPagination.classList.toggle("hidden", !hasPages);
        modPageInfo.textContent = `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`;
        const prev = document.getElementById("modPrevBtn");
        const next = document.getElementById("modNextBtn");
        if (prev) prev.disabled = offset <= 0;
        if (next) next.disabled = offset + PAGE_SIZE >= total;
    }

    function setFilter(next) {
        filter = next;
        offset = 0;
        document.querySelectorAll("[data-user-filter]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.userFilter === filter);
        });
    }

    async function loadUsers() {
        if (modUsersBody) {
            modUsersBody.innerHTML = '<tr><td colspan="8" class="mod-detail-empty">Loading…</td></tr>';
        }
        const onlineOnly = filter === "online";
        const activeToday = filter === "today";
        const result = await staffSearchUsers(query, PAGE_SIZE, offset, { onlineOnly, activeToday });
        total = Number(result.total || 0);
        const users = result.users || [];
        if (modResultsTitle) {
            const labels = { all: "All users", online: "Online now", today: "Active today" };
            modResultsTitle.textContent = query
                ? `Results for “${query}”`
                : (labels[filter] || "Users");
        }
        renderUsers(users);
        updatePagination();
    }

    async function loadAll() {
        const [stats, online] = await Promise.all([
            staffUsersOverviewStats(),
            staffListOnlineUsers(24),
            loadUsers(),
        ]);
        renderStats(stats);
        renderOnlineNow(online);
        return stats;
    }

    document.getElementById("modSearchBtn")?.addEventListener("click", () => {
        query = modSearch?.value.trim() || "";
        offset = 0;
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modClearBtn")?.addEventListener("click", () => {
        if (modSearch) modSearch.value = "";
        query = "";
        offset = 0;
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    modSearch?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            query = modSearch.value.trim();
            offset = 0;
            loadUsers().catch((err) => showStatus(err.message, "error"));
        }
    });

    document.getElementById("modPrevBtn")?.addEventListener("click", () => {
        offset = Math.max(0, offset - PAGE_SIZE);
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modNextBtn")?.addEventListener("click", () => {
        offset += PAGE_SIZE;
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modRefreshUsersBtn")?.addEventListener("click", () => {
        loadAll().catch((e) => showStatus(e.message, "error"));
    });

    document.querySelectorAll("[data-user-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
            setFilter(btn.dataset.userFilter || "all");
            loadUsers().catch((e) => showStatus(e.message, "error"));
        });
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("q") && modSearch) {
        modSearch.value = params.get("q");
        query = modSearch.value.trim();
    }

    return { loadAll, setFilter };
}
