import {
    staffSearchUsers,
    staffUsersOverviewStats,
    staffListOnlineUsers,
} from "./staff-users-api.js";
import { mountUserDetail, escapeHtml, formatRelative, listUserStandingLabel } from "./moderation-user-detail.js";

/**
 * @param {{
 *   showStatus: (msg: string, type?: string) => void,
 *   syncUserUrl?: (userId: string) => void,
 *   getSelectedUserId?: () => string | null,
 * }} opts
 */
export function initUsersPanel(opts) {
    const { showStatus, syncUserUrl, getSelectedUserId } = opts;
    const modUserList = document.getElementById("modUserList");
    const modUserDetailPane = document.getElementById("modUserDetailPane");
    const modSearch = document.getElementById("modSearch");
    const modPagination = document.getElementById("modPagination");
    const modPageInfo = document.getElementById("modPageInfo");
    const modOnlineList = document.getElementById("modOnlineList");
    const modUserStats = document.getElementById("modUserStats");
    const modJoinsChart = document.getElementById("modJoinsChart");
    const modRecentJoins = document.getElementById("modRecentJoins");

    const PAGE_SIZE = 40;
    let offset = 0;
    let total = 0;
    let query = "";
    let filter = "all";
    let selectedUserId = getSelectedUserId?.() || null;
    let hasLoaded = false;
    let lastStatsJson = "";
    let lastUsersKey = "";
    /** @type {Promise<unknown> | null} */
    let loadInFlight = null;

    function setSidebarBadges(stats) {
        const el = document.getElementById("modPeopleBadge");
        if (el) el.textContent = String(stats.usersNeedingAttention || 0);
    }

    function updateSelectedUser(userId) {
        selectedUserId = userId || null;
        modUserList?.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.classList.toggle("is-selected", btn.dataset.pickUser === selectedUserId);
        });
        modRecentJoins?.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.classList.toggle("is-selected", btn.dataset.pickUser === selectedUserId);
        });
        modOnlineList?.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.classList.toggle("is-selected", btn.dataset.pickUser === selectedUserId);
        });
    }

    function renderUsageStats(stats) {
        if (!modUserStats) return;
        const cards = [
            { label: "Online", value: stats.onlineNow || 0 },
            { label: "Active today", value: stats.activeToday || 0 },
            { label: "Joined today", value: stats.newToday || 0 },
            { label: "This week", value: stats.newThisWeek || 0 },
            { label: "Total", value: stats.totalUsers || 0 },
            { label: "Attention", value: stats.usersNeedingAttention || 0, alert: Number(stats.usersNeedingAttention) > 0 },
        ];
        modUserStats.innerHTML = cards.map((c) => `
            <div class="mod-metric${c.alert ? " is-alert" : ""}">
                <span class="mod-metric-value">${Number(c.value).toLocaleString()}</span>
                <span class="mod-metric-label">${escapeHtml(c.label)}</span>
            </div>
        `).join("");
    }

    function renderJoinsChart(days) {
        if (!modJoinsChart) return;
        const rows = Array.isArray(days) ? days : [];
        if (!rows.length) {
            modJoinsChart.innerHTML = '<p class="mod-empty mod-empty-inline">No signup data.</p>';
            return;
        }
        const max = Math.max(1, ...rows.map((d) => Number(d.count || 0)));
        const trackHeight = 64;
        modJoinsChart.innerHTML = `
            <div class="mod-joins-bars mod-joins-bars-compact mod-joins-bars-static" role="img" aria-label="Daily new accounts">
                ${rows.map((d) => {
                    const count = Number(d.count || 0);
                    const barHeight = count > 0
                        ? Math.max(4, Math.round((count / max) * trackHeight))
                        : 2;
                    const day = String(d.day || "").slice(5, 10) || "—";
                    return `
                        <div class="mod-joins-bar-wrap" title="${escapeHtml(String(d.day || ""))}: ${count}">
                            <div class="mod-joins-bar-track">
                                <div class="mod-joins-bar" style="height:${barHeight}px"></div>
                            </div>
                            <span class="mod-joins-day">${escapeHtml(day)}</span>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderRecentJoins(users) {
        if (!modRecentJoins) return;
        const rows = Array.isArray(users) ? users : [];
        if (!rows.length) {
            modRecentJoins.innerHTML = '<p class="mod-empty mod-empty-inline">No recent signups.</p>';
            return;
        }
        modRecentJoins.innerHTML = rows.map((u) => `
            <button type="button" class="mod-recent-join${u.id === selectedUserId ? " is-selected" : ""}" data-pick-user="${escapeHtml(u.id)}">
                <span class="mod-recent-join-name">@${escapeHtml(u.username || "unknown")}</span>
                <span class="mod-recent-join-meta">${escapeHtml(formatRelative(u.created_at))}</span>
            </button>
        `).join("");
        modRecentJoins.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => pickUser(btn.dataset.pickUser));
        });
    }

    function renderOnlineNow(users) {
        if (!modOnlineList) return;
        if (!users?.length) {
            modOnlineList.innerHTML = '<span class="mod-empty mod-empty-inline">Nobody online</span>';
            return;
        }
        modOnlineList.innerHTML = users.slice(0, 12).map((u) => `
            <button type="button" class="mod-chip mod-chip-link${u.id === selectedUserId ? " is-selected" : ""}" data-pick-user="${escapeHtml(u.id)}">@${escapeHtml(u.username)}</button>
        `).join("");
        modOnlineList.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => pickUser(btn.dataset.pickUser));
        });
    }

    function renderUserList(users) {
        if (!modUserList) return;
        if (!users.length) {
            modUserList.innerHTML = '<p class="mod-empty">No users found.</p>';
            return;
        }

        modUserList.innerHTML = users.map((u) => {
            const standing = listUserStandingLabel(u);
            const pending = Number(u.pending_reports || 0) + Number(u.open_violations || 0) + Number(u.pending_appeals || 0);
            const presence = u.is_online ? "is-online" : u.is_recent ? "is-recent" : "";
            return `
                <button type="button"
                    class="mod-queue-row mod-user-directory-row${u.id === selectedUserId ? " is-selected" : ""}${pending > 0 ? " has-attention" : ""}"
                    data-pick-user="${escapeHtml(u.id)}">
                    <span class="mod-priority-dot ${presence || "normal"}" title="${u.is_online ? "Online" : u.is_recent ? "Recent" : "Offline"}"></span>
                    <span class="mod-queue-row-main">
                        <span class="mod-queue-row-title">@${escapeHtml(u.username)}</span>
                        <span class="mod-queue-row-sub">${escapeHtml(u.display_name || "—")} · ${u.book_count || 0} books</span>
                    </span>
                    <span class="mod-queue-row-end">
                        ${standing.kind !== "ok" ? `<span class="mod-user-standing mod-user-standing-${standing.kind}">${escapeHtml(standing.text)}</span>` : ""}
                        ${pending > 0 ? `<span class="mod-user-pending-count">${pending}</span>` : ""}
                        <span class="mod-queue-row-time">${escapeHtml(formatRelative(u.last_seen_at || u.last_sign_in_at))}</span>
                    </span>
                </button>
            `;
        }).join("");

        modUserList.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => pickUser(btn.dataset.pickUser));
        });
    }

    function syncSearchUrl() {
        const url = new URL(window.location.href);
        if (query) url.searchParams.set("q", query);
        else url.searchParams.delete("q");
        window.history.replaceState({}, "", url.pathname + url.search);
    }

    function scrollSelectedIntoView() {
        if (!selectedUserId || !modUserList) return;
        modUserList.querySelector(`[data-pick-user="${CSS.escape(selectedUserId)}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    async function pickUser(userId) {
        if (!userId) return;
        updateSelectedUser(userId);
        syncUserUrl?.(userId);
        document.getElementById("modPeopleOverview")?.classList.add("hidden");
        document.getElementById("modPeopleOverviewBtn")?.classList.remove("is-active");
        scrollSelectedIntoView();
        if (!modUserDetailPane) return;
        try {
            await mountUserDetail(userId, modUserDetailPane, { showStatus });
        } catch {
            /* mountUserDetail shows inline error */
        }
    }

    function showPickUserHint() {
        if (!modUserDetailPane) return;
        modUserDetailPane.innerHTML = '<p class="mod-empty">Select a user from the directory.</p>';
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

    async function loadUsers(options = {}) {
        const silent = !!options.silent;
        const usersKey = `${query}|${filter}|${offset}`;
        if (!silent && !modUserList?.querySelector("[data-pick-user]")) {
            modUserList.innerHTML = '<p class="mod-empty">Loading…</p>';
        }
        try {
            const onlineOnly = filter === "online";
            const activeToday = filter === "today";
            const needsAttention = filter === "attention";
            const result = await staffSearchUsers(query, PAGE_SIZE, offset, { onlineOnly, activeToday, needsAttention });
            total = Number(result.total || 0);
            const nextKey = `${usersKey}|${total}|${JSON.stringify(result.users || [])}`;
            if (silent && nextKey === lastUsersKey) {
                updatePagination();
                return result;
            }
            lastUsersKey = nextKey;
            renderUserList(result.users || []);
            updatePagination();
            scrollSelectedIntoView();
            return result;
        } catch (err) {
            if (modUserList) {
                modUserList.innerHTML = `<p class="mod-detail-empty mod-load-error">Could not load users: ${escapeHtml(err.message || String(err))}</p>`;
            }
            throw err;
        }
    }

    function renderOverview(stats, online) {
        setSidebarBadges(stats);
        renderUsageStats(stats);
        renderJoinsChart(stats.joinsByDay);
        renderRecentJoins(stats.recentJoins);
        renderOnlineNow(online);
    }

    async function loadAll(options = {}) {
        if (loadInFlight) return loadInFlight;

        const force = !!options.force;
        const silent = !!options.silent || (hasLoaded && !force);
        const remountUser = !!options.remountUser;

        loadInFlight = (async () => {
            try {
                const [stats, online] = await Promise.all([
                    staffUsersOverviewStats(),
                    staffListOnlineUsers(16),
                ]);
                const statsJson = JSON.stringify({ stats, online });
                if (!force && hasLoaded && statsJson === lastStatsJson) {
                    await loadUsers({ silent: true });
                } else {
                    lastStatsJson = statsJson;
                    renderOverview(stats, online);
                    await loadUsers({ silent: hasLoaded && !force });
                }
                hasLoaded = true;
                if (remountUser && selectedUserId && modUserDetailPane) {
                    await mountUserDetail(selectedUserId, modUserDetailPane, { showStatus });
                }
                return stats;
            } finally {
                loadInFlight = null;
            }
        })();

        return loadInFlight;
    }

    async function ensureLoaded() {
        if (hasLoaded) return null;
        return loadAll({ force: true });
    }

    async function refresh() {
        lastStatsJson = "";
        lastUsersKey = "";
        return loadAll({ force: true, silent: true, remountUser: !!selectedUserId });
    }

    document.getElementById("modSearchBtn")?.addEventListener("click", () => {
        query = modSearch?.value.trim() || "";
        offset = 0;
        lastUsersKey = "";
        syncSearchUrl();
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modClearBtn")?.addEventListener("click", () => {
        if (modSearch) modSearch.value = "";
        query = "";
        offset = 0;
        lastUsersKey = "";
        syncSearchUrl();
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    modSearch?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            query = modSearch.value.trim();
            offset = 0;
            lastUsersKey = "";
            syncSearchUrl();
            loadUsers().catch((err) => showStatus(err.message, "error"));
        }
    });

    document.getElementById("modPrevBtn")?.addEventListener("click", () => {
        offset = Math.max(0, offset - PAGE_SIZE);
        lastUsersKey = "";
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modNextBtn")?.addEventListener("click", () => {
        offset += PAGE_SIZE;
        lastUsersKey = "";
        loadUsers().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modRefreshUsersBtn")?.addEventListener("click", () => {
        refresh().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modPeopleOverviewBtn")?.addEventListener("click", () => {
        const panel = document.getElementById("modPeopleOverview");
        const btn = document.getElementById("modPeopleOverviewBtn");
        if (!panel || !btn) return;
        panel.classList.toggle("hidden");
        const visible = !panel.classList.contains("hidden");
        btn.classList.toggle("is-active", visible);
        btn.setAttribute("aria-expanded", visible ? "true" : "false");
    });

    document.querySelectorAll("[data-user-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
            setFilter(btn.dataset.userFilter || "all");
            lastUsersKey = "";
            loadUsers().catch((e) => showStatus(e.message, "error"));
        });
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("q") && modSearch) {
        modSearch.value = params.get("q");
        query = modSearch.value.trim();
    }
    if (params.get("user")) {
        selectedUserId = params.get("user");
    } else {
        showPickUserHint();
    }

    return { loadAll, ensureLoaded, refresh, pickUser, setFilter, showPickUserHint };
}
