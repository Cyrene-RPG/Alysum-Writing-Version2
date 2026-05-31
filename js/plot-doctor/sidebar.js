/**
 * Plot Doctor — sidebar UI. Renders a list of plot issues with category filters,
 * triage actions, and a manual rescan. Subscribes to the orchestrator's state.
 */

import { PLOT_CATEGORIES, PLOT_STATUS, PLOT_SEVERITY } from "./types.js?v=1";

const CATEGORY_LABEL = {
    [PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION]: "Attribute",
    [PLOT_CATEGORIES.NAME_DRIFT]: "Name drift",
    [PLOT_CATEGORIES.DEAD_CHARACTER_SPEAKS]: "Death continuity"
};

const SEVERITY_RANK = {
    [PLOT_SEVERITY.CONTRADICTION]: 3,
    [PLOT_SEVERITY.WARN]: 2,
    [PLOT_SEVERITY.INFO]: 1
};

const STATUS_LABEL = {
    [PLOT_STATUS.OPEN]: "Open",
    [PLOT_STATUS.ACKNOWLEDGED]: "Acknowledged",
    [PLOT_STATUS.DISMISSED]: "Dismissed",
    [PLOT_STATUS.FIXED]: "Fixed",
    [PLOT_STATUS.STALE]: "Stale"
};

const STORE_OPEN_KEY = "alysum-plot-doctor-open";
const STORE_FILTER_KEY = "alysum-plot-doctor-filter";

function readBoolPref(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        if (v == null) return fallback;
        return v === "1";
    } catch {
        return fallback;
    }
}
function writeBoolPref(key, value) {
    try {
        localStorage.setItem(key, value ? "1" : "0");
    } catch {}
}

function readFilters() {
    try {
        const v = localStorage.getItem(STORE_FILTER_KEY);
        if (!v) return null;
        return JSON.parse(v);
    } catch {
        return null;
    }
}
function writeFilters(filters) {
    try {
        localStorage.setItem(STORE_FILTER_KEY, JSON.stringify(filters));
    } catch {}
}

function relativeTime(ms) {
    if (!ms) return "never";
    const delta = Math.max(0, Date.now() - ms);
    if (delta < 5000) return "just now";
    if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
    return `${Math.round(delta / 86_400_000)}d ago`;
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl       The element to render the sidebar into.
 * @param {HTMLButtonElement} [opts.toggleBtn]  Optional button that toggles open state and shows a count.
 * @param {ReturnType<typeof import('./orchestrator.js').createOrchestrator>} opts.orchestrator
 * @param {(chapterId: string, section: string, rangeStart: number | null) => void} [opts.onJump]
 * @param {(issue: Record<string, any>, plain: string) => Promise<void>} [opts.onMergeNameDrift]
 */
export function mountPlotDoctorSidebar(opts) {
    const { mountEl, toggleBtn, orchestrator, onJump, onMergeNameDrift } = opts;
    if (!mountEl) return { destroy: () => {} };

    const filters = readFilters() || {
        categories: {
            [PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION]: true,
            [PLOT_CATEGORIES.NAME_DRIFT]: true,
            [PLOT_CATEGORIES.DEAD_CHARACTER_SPEAKS]: true
        },
        status: PLOT_STATUS.OPEN
    };

    let open = readBoolPref(STORE_OPEN_KEY, false);

    mountEl.innerHTML = `
        <aside class="pd-sidebar" role="complementary" aria-label="Plot Doctor" data-open="${open ? "1" : "0"}">
            <header class="pd-head">
                <span class="pd-title">Plot Doctor</span>
                <button type="button" class="pd-icon-btn" data-action="rescan" title="Re-scan now" aria-label="Re-scan">&#x21BB;</button>
                <button type="button" class="pd-icon-btn" data-action="close" title="Close" aria-label="Close">&times;</button>
            </header>
            <div class="pd-bible-health" data-role="bible-health">
                <h4>Bible readiness</h4>
                <div class="pd-health-bar"><span data-role="health-bar" style="width:0%"></span></div>
                <p data-role="health-summary">Scan to check bible readiness.</p>
                <a class="pd-bible-link" data-role="bible-link" href="story-bible.html">Open Story Bible →</a>
            </div>
            <div class="pd-status" data-role="status">Idle</div>
            <p class="pd-storage-warn" data-role="storage-warn" hidden></p>
            <div class="pd-filters" data-role="filters"></div>
            <div class="pd-status-tabs" data-role="status-tabs"></div>
            <div class="pd-body" data-role="body">
                <p class="pd-empty">Loading…</p>
            </div>
            <footer class="pd-footer">
                <span data-role="last-scanned">Not scanned yet.</span>
            </footer>
        </aside>
    `;

    const sidebarEl = mountEl.querySelector(".pd-sidebar");
    const statusEl = mountEl.querySelector('[data-role="status"]');
    const filtersEl = mountEl.querySelector('[data-role="filters"]');
    const statusTabsEl = mountEl.querySelector('[data-role="status-tabs"]');
    const bodyEl = mountEl.querySelector('[data-role="body"]');
    const lastScannedEl = mountEl.querySelector('[data-role="last-scanned"]');
    const healthBarEl = mountEl.querySelector('[data-role="health-bar"]');
    const healthSummaryEl = mountEl.querySelector('[data-role="health-summary"]');
    const bibleLinkEl = mountEl.querySelector('[data-role="bible-link"]');
    const closeBtn = mountEl.querySelector('[data-action="close"]');
    const rescanBtn = mountEl.querySelector('[data-action="rescan"]');

    function setOpen(next) {
        open = !!next;
        sidebarEl.dataset.open = open ? "1" : "0";
        writeBoolPref(STORE_OPEN_KEY, open);
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function updateToggleBadge(openCount) {
        if (!toggleBtn) return;
        toggleBtn.dataset.count = String(openCount);
        toggleBtn.textContent = openCount > 0 ? `Plot Doctor · ${openCount}` : "Plot Doctor";
    }

    function renderFilters(issues) {
        const counts = {
            [PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION]: 0,
            [PLOT_CATEGORIES.NAME_DRIFT]: 0,
            [PLOT_CATEGORIES.DEAD_CHARACTER_SPEAKS]: 0
        };
        for (const row of issues) {
            if (row.status !== PLOT_STATUS.OPEN) continue;
            if (counts[row.category] != null) counts[row.category] += 1;
        }
        filtersEl.innerHTML = Object.entries(CATEGORY_LABEL)
            .map(([category, label]) => {
                const active = filters.categories[category];
                return `<button type="button" class="pd-chip ${active ? "is-active" : ""}" data-category="${category}">${label} <span class="pd-chip-count">${counts[category] || 0}</span></button>`;
            })
            .join("");
    }

    function renderStatusTabs(issues) {
        const counts = {
            [PLOT_STATUS.OPEN]: 0,
            [PLOT_STATUS.ACKNOWLEDGED]: 0,
            [PLOT_STATUS.DISMISSED]: 0,
            [PLOT_STATUS.FIXED]: 0,
            [PLOT_STATUS.STALE]: 0
        };
        for (const row of issues) counts[row.status] = (counts[row.status] || 0) + 1;
        const tabs = [
            PLOT_STATUS.OPEN,
            PLOT_STATUS.ACKNOWLEDGED,
            PLOT_STATUS.FIXED,
            PLOT_STATUS.DISMISSED,
            PLOT_STATUS.STALE
        ];
        statusTabsEl.innerHTML = tabs
            .map(s => {
                const active = filters.status === s;
                return `<button type="button" class="pd-tab ${active ? "is-active" : ""}" data-status="${s}">${STATUS_LABEL[s]} <span class="pd-tab-count">${counts[s] || 0}</span></button>`;
            })
            .join("");
    }

    function renderBody(issues) {
        const filtered = issues
            .filter(row => filters.categories[row.category])
            .filter(row => row.status === filters.status)
            .sort((a, b) => {
                const sevDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
                if (sevDiff) return sevDiff;
                return (b.confidence || 0) - (a.confidence || 0);
            });

        if (!filtered.length) {
            bodyEl.innerHTML = `<p class="pd-empty">${filters.status === PLOT_STATUS.OPEN
                ? "No plot issues detected. Your bible and manuscript look aligned."
                : `No ${STATUS_LABEL[filters.status].toLowerCase()} issues.`}</p>`;
            return;
        }

        bodyEl.innerHTML = filtered
            .map(row => {
                const sevClass = `pd-sev-${row.severity}`;
                const showTriage = row.status === PLOT_STATUS.OPEN;
                const showMergeDrift =
                    showTriage && row.category === PLOT_CATEGORIES.NAME_DRIFT && !!onMergeNameDrift;
                const showBibleLink =
                    showTriage &&
                    !showMergeDrift &&
                    (row.category === PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION ||
                        row.category === PLOT_CATEGORIES.DEAD_CHARACTER_SPEAKS);
                return `
                    <article class="pd-card ${sevClass}" data-id="${row.id}">
                        <div class="pd-card-head">
                            <span class="pd-tag">${CATEGORY_LABEL[row.category] || row.category}</span>
                            <span class="pd-sev">${row.severity}</span>
                            <span class="pd-conf">${Math.round((row.confidence || 0) * 100)}%</span>
                        </div>
                        <div class="pd-claim">"${escapeHtml(row.claim_text || "")}"</div>
                        <div class="pd-evidence">${escapeHtml(row.evidence_summary || "")}</div>
                        ${row.user_note ? `<div class="pd-note">Note: ${escapeHtml(row.user_note)}</div>` : ""}
                        <div class="pd-actions">
                            <button type="button" data-act="jump">Jump</button>
                            ${showMergeDrift ? `<button type="button" data-act="merge-drift">Merge into Bible</button>` : ""}
                            ${showBibleLink ? `<button type="button" data-act="bible">Fix in Bible</button>` : ""}
                            ${showTriage ? `<button type="button" data-act="ack">Acknowledge</button>` : ""}
                            ${showTriage ? `<button type="button" data-act="fix">Mark fixed</button>` : ""}
                            ${showTriage ? `<button type="button" data-act="dismiss">Dismiss</button>` : ""}
                            ${row.status !== PLOT_STATUS.OPEN ? `<button type="button" data-act="reopen">Reopen</button>` : ""}
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    function render() {
        const s = orchestrator.getState();
        const issues = s.issues || [];
        const openCount = issues.filter(r => r.status === PLOT_STATUS.OPEN).length;
        updateToggleBadge(openCount);

        if (healthBarEl && s.bibleHealth) {
            healthBarEl.style.width = `${s.bibleHealth.readinessPct}%`;
        }
        if (healthSummaryEl) {
            healthSummaryEl.textContent = s.bibleHealth?.summary || "Add characters in Story Bible for better checks.";
        }
        if (bibleLinkEl && s.bookId) {
            bibleLinkEl.href = `story-bible.html?book=${encodeURIComponent(s.bookId)}`;
        }

        if (s.scanning) statusEl.textContent = "Scanning manuscript against bible…";
        else if (s.lastError) statusEl.textContent = s.lastError;
        else statusEl.textContent = `${openCount} open issue${openCount === 1 ? "" : "s"}`;

        const warnEl = mountEl.querySelector('[data-role="storage-warn"]');
        if (warnEl) {
            warnEl.textContent = s.storageWarning || "";
            warnEl.hidden = !s.storageWarning;
        }

        lastScannedEl.textContent = s.lastScannedAt
            ? `Last scanned ${relativeTime(s.lastScannedAt)}`
            : "Not scanned yet.";

        renderFilters(issues);
        renderStatusTabs(issues);
        renderBody(issues);
    }

    closeBtn.addEventListener("click", () => setOpen(false));
    rescanBtn.addEventListener("click", () => void orchestrator.runScanNow());

    filtersEl.addEventListener("click", (e) => {
        const btn = (e.target instanceof Element) ? e.target.closest("[data-category]") : null;
        if (!btn) return;
        const category = btn.getAttribute("data-category");
        filters.categories[category] = !filters.categories[category];
        writeFilters(filters);
        render();
    });

    statusTabsEl.addEventListener("click", (e) => {
        const btn = (e.target instanceof Element) ? e.target.closest("[data-status]") : null;
        if (!btn) return;
        filters.status = btn.getAttribute("data-status");
        writeFilters(filters);
        render();
    });

    bodyEl.addEventListener("click", async (e) => {
        const card = (e.target instanceof Element) ? e.target.closest(".pd-card") : null;
        const actBtn = (e.target instanceof Element) ? e.target.closest("[data-act]") : null;
        if (!card || !actBtn) return;
        const issueId = card.getAttribute("data-id");
        const issue = orchestrator.getState().issues.find(r => r.id === issueId);
        if (!issue) return;
        const action = actBtn.getAttribute("data-act");

        if (action === "jump") {
            onJump?.(issue.chapter_id, issue.chapter_section, issue.claim_range_start);
            return;
        }
        if (action === "bible") {
            const bookId = orchestrator.getState().bookId;
            if (bookId) {
                window.open(`story-bible.html?book=${encodeURIComponent(bookId)}`, "_blank");
            }
            return;
        }
        if (action === "merge-drift" && onMergeNameDrift) {
            const summary = issue.evidence_summary || "";
            if (!confirm(`Merge these name variants into Story Bible?\n\n${summary}`)) return;
            actBtn.disabled = true;
            try {
                await onMergeNameDrift(issue, "");
                await orchestrator.applyTriage(issueId, PLOT_STATUS.FIXED, "Merged into Story Bible.");
                await orchestrator.runScanNow();
            } catch (err) {
                console.error("[plot-doctor] drift merge failed:", err);
            } finally {
                actBtn.disabled = false;
            }
            return;
        }
        if (action === "ack") {
            const note = prompt("Why is this OK? (flashback, twist, intentional…)") || "";
            await orchestrator.applyTriage(issueId, PLOT_STATUS.ACKNOWLEDGED, note);
            return;
        }
        if (action === "fix") {
            await orchestrator.applyTriage(issueId, PLOT_STATUS.FIXED, "");
            return;
        }
        if (action === "dismiss") {
            await orchestrator.applyTriage(issueId, PLOT_STATUS.DISMISSED, "");
            return;
        }
        if (action === "reopen") {
            await orchestrator.applyTriage(issueId, PLOT_STATUS.OPEN, issue.user_note || "");
        }
    });

    if (toggleBtn) {
        toggleBtn.setAttribute("aria-controls", "pd-sidebar");
        toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
        toggleBtn.addEventListener("click", () => setOpen(!open));
    }

    document.addEventListener("keydown", (e) => {
        if (!e.altKey || e.key.toLowerCase() !== "p") return;
        e.preventDefault();
        setOpen(!open);
    });

    setOpen(open);
    render();

    return {
        render,
        setOpen,
        destroy: () => {
            mountEl.innerHTML = "";
        }
    };
}
