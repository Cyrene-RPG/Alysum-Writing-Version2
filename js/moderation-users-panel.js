import {
    staffSearchUsers,
    staffUsersOverviewStats,
    staffListOnlineUsers,
} from "./staff-users-api.js";
import { mountUserDetail, escapeHtml, formatRelative, listUserStandingLabel } from "./moderation-user-detail.js";

function presenceDot(user) {
    if (user.is_online) return '<span class="mod-presence-dot is-online" title="Online"></span>';
    if (user.is_recent) return '<span class="mod-presence-dot is-recent" title="Recent"></span>';
    return '<span class="mod-presence-dot" title="Offline"></span>';
}

/**
 * @param {{
 *   showStatus: (msg: string, type?: string) => void,
 *   onUserSelect?: (userId: string) => void,
 *   getSelectedUserId?: () => string | null,
 * }} opts
 */
export function initUsersPanel(opts) {
    const { showStatus, onUserSelect, getSelectedUserId } = opts;
    const modUserList = document.getElementById("modUserList");
    const modUserDetailPane = document.getElementById("modUserDetailPane");
    const modSearch = document.getElementById("modSearch");
    const modPagination = document.getElementById("modPagination");
    const modPageInfo = document.getElementById("modPageInfo");
    const modOnlineList = document.getElementById("modOnlineList");

    const PAGE_SIZE = 40;
    let offset = 0;
    let total = 0;
    let query = "";
    let filter = "all";
    let selectedUserId = getSelectedUserId?.() || null;

    function setSidebarBadges(stats) {
        const el = document.getElementById("modPeopleBadge");
        if (el) el.textContent = String(stats.usersNeedingAttention || 0);
    }

    function renderOnlineNow(users) {
        if (!modOnlineList) return;
        if (!users?.length) {
            modOnlineList.innerHTML = '<span class="mod-detail-empty">Nobody online</span>';
            return;
        }
        modOnlineList.innerHTML = users.slice(0, 8).map((u) => `
            <button type="button" class="mod-online-chip" data-pick-user="${escapeHtml(u.id)}">
                <span class="mod-presence-dot is-online"></span>@${escapeHtml(u.username)}
            </button>
        `).join("");
        modOnlineList.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => pickUser(btn.dataset.pickUser));
        });
    }

    function renderUserList(users) {
        if (!modUserList) return;
        if (!users.length) {
            modUserList.innerHTML = '<p class="mod-detail-empty">No users found.</p>';
            return;
        }

        modUserList.innerHTML = users.map((u) => {
            const standing = listUserStandingLabel(u);
            const pending = Number(u.pending_reports || 0) + Number(u.open_violations || 0) + Number(u.pending_appeals || 0);
            return `
                <button type="button"
                    class="mod-user-row${u.id === selectedUserId ? " is-selected" : ""}${pending > 0 ? " has-pending" : ""}"
                    data-pick-user="${escapeHtml(u.id)}">
                    <div class="mod-user-row-top">
                        ${presenceDot(u)}
                        <span class="mod-user-row-name">@${escapeHtml(u.username)}</span>
                        <span class="mod-flag ${standing.kind}">${escapeHtml(standing.text)}</span>
                    </div>
                    <div class="mod-user-row-meta">
                        ${escapeHtml(u.display_name || "")}
                        · ${u.book_count || 0} books
                        · ${Number(u.book_words_total || 0).toLocaleString()} words
                    </div>
                    ${pending > 0 ? `<div class="mod-user-row-pending">${pending} pending item(s)</div>` : ""}
                    <div class="mod-user-row-meta">${escapeHtml(formatRelative(u.last_seen_at || u.last_sign_in_at))}</div>
                </button>
            `;
        }).join("");

        modUserList.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => pickUser(btn.dataset.pickUser));
        });
    }

    async function pickUser(userId) {
        selectedUserId = userId;
        onUserSelect?.(userId);
        modUserList?.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.classList.toggle("is-selected", btn.dataset.pickUser === userId);
        });
        if (!modUserDetailPane) return;
        await mountUserDetail(userId, modUserDetailPane, { showStatus });
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
        if (modUserList) modUserList.innerHTML = '<p class="mod-detail-empty">Loading…</p>';
        const onlineOnly = filter === "online";
        const activeToday = filter === "today";
        const needsAttention = filter === "attention";
        const result = await staffSearchUsers(query, PAGE_SIZE, offset, { onlineOnly, activeToday, needsAttention });
        total = Number(result.total || 0);
        renderUserList(result.users || []);
        updatePagination();
    }

    async function loadAll() {
        const [stats, online] = await Promise.all([
            staffUsersOverviewStats(),
            staffListOnlineUsers(16),
            loadUsers(),
        ]);
        setSidebarBadges(stats);
        renderOnlineNow(online);
        if (selectedUserId && modUserDetailPane) {
            await mountUserDetail(selectedUserId, modUserDetailPane, { showStatus });
        }
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
    if (params.get("user")) selectedUserId = params.get("user");

    return { loadAll, pickUser, setFilter };
}
