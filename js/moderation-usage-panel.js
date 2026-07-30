import { staffFeatureUsageStats, staffFeatureUsageForUser } from "./feature-usage-api.js";
import { FEATURE_LABELS } from "./feature-usage-track.js";

function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function featureLabel(feature) {
    return FEATURE_LABELS[feature] || feature.replace(/-/g, " ");
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * @param {HTMLElement} root
 * @param {Array<{ feature?: string, events?: number, unique_users?: number }>} rows
 */
function renderFeatureBars(root, rows) {
    if (!root) return;
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
        root.innerHTML = '<p class="mod-empty mod-empty-inline">No feature visits recorded yet.</p>';
        return;
    }
    const max = Math.max(1, ...list.map((row) => Number(row.events || 0)));
    root.innerHTML = `
        <div class="mod-usage-bars" role="img" aria-label="Feature usage">
            ${list.map((row) => {
                const count = Number(row.events || 0);
                const users = Number(row.unique_users || 0);
                const width = Math.max(count > 0 ? 4 : 1, Math.round((count / max) * 100));
                const label = featureLabel(String(row.feature || ""));
                return `
                    <div class="mod-usage-row" title="${escapeHtml(label)}: ${count} visits · ${users} users">
                        <div class="mod-usage-label">${escapeHtml(label)}</div>
                        <div class="mod-usage-track-wrap">
                            <div class="mod-usage-track">
                                <div class="mod-usage-bar" style="width:${width}%"></div>
                            </div>
                            <span class="mod-usage-count">${count.toLocaleString()}</span>
                        </div>
                        <div class="mod-usage-meta">${users.toLocaleString()} user${users === 1 ? "" : "s"}</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

/**
 * @param {HTMLElement} root
 * @param {Array<{ day?: string, count?: number }>} rows
 * @param {{ ariaLabel?: string, barClass?: string }} [opts]
 */
function renderDailyChart(root, rows, opts = {}) {
    if (!root) return;
    const list = Array.isArray(rows) ? rows : [];
    const ariaLabel = opts.ariaLabel || "Daily totals";
    const barClass = opts.barClass ? ` ${opts.barClass}` : "";
    if (!list.length) {
        root.innerHTML = '<p class="mod-empty mod-empty-inline">No daily data yet.</p>';
        return;
    }
    const max = Math.max(1, ...list.map((row) => Number(row.count || 0)));
    const trackHeight = 72;
    root.innerHTML = `
        <div class="mod-joins-bars mod-joins-bars-compact mod-joins-bars-static" role="img" aria-label="${escapeHtml(ariaLabel)}">
            ${list.map((row) => {
                const count = Number(row.count || 0);
                const barHeight = count > 0
                    ? Math.max(4, Math.round((count / max) * trackHeight))
                    : 2;
                const day = String(row.day || "").slice(5, 10) || "—";
                return `
                    <div class="mod-joins-bar-wrap" title="${escapeHtml(String(row.day || ""))}: ${count}">
                        <div class="mod-joins-bar-track">
                            <div class="mod-joins-bar${barClass}" style="height:${barHeight}px"></div>
                        </div>
                        <span class="mod-joins-day">${escapeHtml(day)}</span>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

/**
 * @param {HTMLElement} root
 * @param {Array<{ user_id?: string, username?: string, display_name?: string, events?: number }>} rows
 * @param {{ onPickUser?: (userId: string) => void, selectedUserId?: string | null }} [opts]
 */
function renderUsersByVisitsChart(root, rows, opts = {}) {
    if (!root) return;
    const list = Array.isArray(rows) ? rows.slice(0, 20) : [];
    if (!list.length) {
        root.innerHTML = '<p class="mod-empty mod-empty-inline">No user visit data yet.</p>';
        return;
    }
    const max = Math.max(1, ...list.map((row) => Number(row.events || 0)));
    root.innerHTML = `
        <div class="mod-usage-bars" role="img" aria-label="Users by visit count">
            ${list.map((row) => {
                const count = Number(row.events || 0);
                const width = Math.max(count > 0 ? 4 : 1, Math.round((count / max) * 100));
                const label = `@${row.username || "unknown"}`;
                const selected = row.user_id === opts.selectedUserId ? " is-selected" : "";
                return `
                    <div class="mod-usage-row mod-usage-row-user${selected}">
                        <button type="button" class="mod-usage-label mod-link-btn" data-pick-user="${escapeHtml(row.user_id || "")}" title="${escapeHtml(row.display_name || label)}">
                            ${escapeHtml(label)}
                        </button>
                        <div class="mod-usage-track-wrap">
                            <div class="mod-usage-track">
                                <div class="mod-usage-bar mod-usage-bar-users" style="width:${width}%"></div>
                            </div>
                            <span class="mod-usage-count">${count.toLocaleString()}</span>
                        </div>
                        <div class="mod-usage-meta">${Number(row.features_used || 0).toLocaleString()} features</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
    root.querySelectorAll("[data-pick-user]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const userId = btn.getAttribute("data-pick-user");
            if (userId) opts.onPickUser?.(userId);
        });
    });
}

/**
 * @param {{
 *   showStatus: (msg: string, type?: string) => void,
 * }} opts
 */
export function initUsagePanel(opts) {
    const { showStatus } = opts;
    const metricsEl = document.getElementById("modUsageMetrics");
    const featureChartEl = document.getElementById("modUsageFeatureChart");
    const dailyChartEl = document.getElementById("modUsageDailyChart");
    const dailyActiveChartEl = document.getElementById("modUsageDailyActiveChart");
    const dailyNewUsersChartEl = document.getElementById("modUsageDailyNewUsersChart");
    const usersByVisitsChartEl = document.getElementById("modUsageUsersByVisitsChart");
    const topUsersEl = document.getElementById("modUsageTopUsers");
    const userFeaturesEl = document.getElementById("modUsageUserFeatures");
    const daysSelect = document.getElementById("modUsageDays");
    const refreshBtn = document.getElementById("modUsageRefreshBtn");

    let days = Number(daysSelect?.value || 14) || 14;
    let stats = null;
    let selectedUserId = null;
    let hasLoaded = false;
    let lastStatsJson = "";
    /** @type {Promise<unknown> | null} */
    let loadInFlight = null;

    function updateSelectedUser(userId) {
        selectedUserId = userId || null;
        topUsersEl?.querySelectorAll(".mod-usage-user-row").forEach((row) => {
            row.classList.toggle("is-selected", row.dataset.userId === selectedUserId);
        });
        usersByVisitsChartEl?.querySelectorAll(".mod-usage-row-user").forEach((row) => {
            const btn = row.querySelector("[data-pick-user]");
            row.classList.toggle("is-selected", btn?.getAttribute("data-pick-user") === selectedUserId);
        });
    }

    function renderAll() {
        if (!stats) return;
        renderMetrics(stats);
        renderFeatureBars(featureChartEl, stats.byFeature);
        renderDailyChart(dailyChartEl, stats.dailyTotals, { ariaLabel: "Daily feature visits" });
        renderDailyChart(dailyActiveChartEl, stats.dailyActiveUsers, {
            ariaLabel: "Daily active users",
            barClass: "mod-joins-bar-active",
        });
        renderDailyChart(dailyNewUsersChartEl, stats.dailyNewUsers, {
            ariaLabel: "Daily new users",
            barClass: "mod-joins-bar-signups",
        });
        renderUsersByVisitsChart(usersByVisitsChartEl, stats.topUsers, {
            selectedUserId,
            onPickUser: pickUser,
        });
        renderTopUsers(stats.topUsers);
        renderUserFeatures(stats.topUserFeatures);
    }

    function renderMetrics(data) {
        if (!metricsEl) return;
        const totals = data?.totals || {};
        const cards = [
            { label: "Visits", value: Number(totals.events || 0).toLocaleString() },
            { label: "Unique users", value: Number(totals.uniqueUsers || 0).toLocaleString() },
            { label: "New users", value: Number(totals.newUsers || 0).toLocaleString() },
            { label: "Features used", value: Number(totals.uniqueFeatures || 0).toLocaleString() },
            { label: "Window", value: `${data?.days || days}d` },
        ];
        metricsEl.innerHTML = cards.map((card) => `
            <div class="mod-metric">
                <span class="mod-metric-value">${escapeHtml(String(card.value))}</span>
                <span class="mod-metric-label">${escapeHtml(card.label)}</span>
            </div>
        `).join("");
    }

    function pickUser(userId) {
        if (!userId) return;
        updateSelectedUser(userId);
        void loadUserBreakdown(userId, true);
    }

    function renderTopUsers(rows) {
        if (!topUsersEl) return;
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            topUsersEl.innerHTML = '<p class="mod-empty">No user activity yet.</p>';
            return;
        }
        topUsersEl.innerHTML = `
            <table class="mod-usage-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Visits</th>
                        <th>Features</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map((row) => `
                        <tr class="mod-usage-user-row${row.user_id === selectedUserId ? " is-selected" : ""}" data-user-id="${escapeHtml(row.user_id)}">
                            <td>
                                <button type="button" class="mod-link-btn" data-pick-user="${escapeHtml(row.user_id)}">
                                    @${escapeHtml(row.username || "unknown")}
                                </button>
                                ${row.display_name ? `<div class="mod-usage-sub">${escapeHtml(row.display_name)}</div>` : ""}
                            </td>
                            <td>${Number(row.events || 0).toLocaleString()}</td>
                            <td>${Number(row.features_used || 0).toLocaleString()}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
        topUsersEl.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => {
                pickUser(btn.getAttribute("data-pick-user"));
            });
        });
    }

    function renderUserFeatures(rows) {
        if (!userFeaturesEl) return;
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            userFeaturesEl.innerHTML = '<p class="mod-empty">No per-user feature breakdown yet.</p>';
            return;
        }
        userFeaturesEl.innerHTML = `
            <table class="mod-usage-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Feature</th>
                        <th>Visits</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map((row) => `
                        <tr>
                            <td>
                                <button type="button" class="mod-link-btn" data-pick-user="${escapeHtml(row.user_id)}">
                                    @${escapeHtml(row.username || "unknown")}
                                </button>
                            </td>
                            <td>${escapeHtml(featureLabel(String(row.feature || "")))}</td>
                            <td>${Number(row.events || 0).toLocaleString()}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
        userFeaturesEl.querySelectorAll("[data-pick-user]").forEach((btn) => {
            btn.addEventListener("click", () => {
                pickUser(btn.getAttribute("data-pick-user"));
            });
        });
    }

    async function loadUserBreakdown(userId, silent = false) {
        const detailEl = document.getElementById("modUsageUserDetail");
        if (!detailEl || !userId) return;
        if (!silent || !detailEl.querySelector(".mod-usage-user-detail")) {
            detailEl.innerHTML = '<p class="mod-empty">Loading user feature breakdown…</p>';
        }
        try {
            const detail = await staffFeatureUsageForUser(userId, days);
            const rows = Array.isArray(detail.byFeature) ? detail.byFeature : [];
            if (!rows.length) {
                detailEl.innerHTML = `<p class="mod-empty">No tracked visits for this user in the last ${days} days.</p>`;
                return;
            }
            detailEl.innerHTML = `
                <div class="mod-usage-user-detail">
                    <div class="mod-kicker">Selected user</div>
                    <h3 class="mod-detail-title"><code>${escapeHtml(userId)}</code></h3>
                    <p class="mod-detail-meta-line">${Number(detail.totalEvents || 0).toLocaleString()} visits in ${days} days</p>
                    <div class="mod-usage-bars mod-usage-bars-compact">
                        ${rows.map((row) => {
                            const count = Number(row.events || 0);
                            const max = Math.max(1, ...rows.map((r) => Number(r.events || 0)));
                            const width = Math.max(count > 0 ? 4 : 1, Math.round((count / max) * 100));
                            return `
                                <div class="mod-usage-row">
                                    <div class="mod-usage-label">${escapeHtml(featureLabel(String(row.feature || "")))}</div>
                                    <div class="mod-usage-track-wrap">
                                        <div class="mod-usage-track">
                                            <div class="mod-usage-bar" style="width:${width}%"></div>
                                        </div>
                                        <span class="mod-usage-count">${count.toLocaleString()}</span>
                                    </div>
                                    <div class="mod-usage-meta">${escapeHtml(formatDate(row.last_seen))}</div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        } catch (error) {
            detailEl.innerHTML = `<p class="mod-empty">Could not load user breakdown: ${escapeHtml(error.message || String(error))}</p>`;
        }
    }

    async function loadAll(options = {}) {
        if (loadInFlight) return loadInFlight;

        const force = !!options.force;
        const silent = !!options.silent || (hasLoaded && !force);

        loadInFlight = (async () => {
            try {
                if (!silent && !hasLoaded && featureChartEl) {
                    featureChartEl.innerHTML = '<p class="mod-empty mod-empty-inline">Loading…</p>';
                }

                const fresh = await staffFeatureUsageStats(days);
                const freshJson = JSON.stringify(fresh);
                if (!force && hasLoaded && freshJson === lastStatsJson) {
                    return stats;
                }

                stats = fresh;
                lastStatsJson = freshJson;
                hasLoaded = true;
                renderAll();
                if (selectedUserId) await loadUserBreakdown(selectedUserId, true);
                return stats;
            } finally {
                loadInFlight = null;
            }
        })();

        return loadInFlight;
    }

    async function ensureLoaded() {
        if (hasLoaded) return stats;
        return loadAll({ force: true });
    }

    async function refresh() {
        return loadAll({ force: true, silent: true });
    }

    daysSelect?.addEventListener("change", () => {
        days = Number(daysSelect.value || 14) || 14;
        lastStatsJson = "";
        loadAll({ force: true }).catch((err) => showStatus(err.message, "error"));
    });

    refreshBtn?.addEventListener("click", () => {
        refresh().catch((err) => showStatus(err.message, "error"));
    });

    return { loadAll, ensureLoaded, refresh };
}
