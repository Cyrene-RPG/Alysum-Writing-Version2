import {
    getDashboardStats,
    listPendingReports,
    reviewReportNoViolation,
    dismissReport,
    confirmViolation,
    setBookVisibility,
    resolveAppeal,
    checkViolationDeadlines,
    fetchPendingAppeals,
    reportReasonLabel,
    priorityLabel,
    reportStatusLabel,
} from "./library-reports-api.js";
import { confirmModAction } from "./moderation-dialog.js";

function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatRelative(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
    return formatDate(iso);
}

function priorityClass(priority) {
    if (priority === "critical") return "critical";
    if (priority === "high") return "high";
    return "normal";
}

function emptyState(message) {
    return `<p class="mod-empty">${escapeHtml(message)}</p>`;
}

function wireCaseTabs(root) {
    root.querySelectorAll("[data-case-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.caseTab;
            root.querySelectorAll("[data-case-tab]").forEach((b) => {
                b.classList.toggle("is-active", b.dataset.caseTab === tab);
                b.setAttribute("aria-selected", b.dataset.caseTab === tab ? "true" : "false");
            });
            root.querySelectorAll("[data-case-panel]").forEach((p) => {
                p.classList.toggle("hidden", p.dataset.casePanel !== tab);
            });
        });
    });
}

/**
 * @param {{ showStatus: (msg: string, type?: string) => void }} opts
 */
export function initReportsPanel(opts) {
    const { showStatus } = opts;
    const modStats = document.getElementById("modReportStats");
    const modQueue = document.getElementById("modQueue");
    const modDetail = document.getElementById("modDetail");
    const modAppeals = document.getElementById("modAppeals");
    const modAppealDetail = document.getElementById("modAppealDetail");
    const modQueueSearch = document.getElementById("modQueueSearch");

    let reports = [];
    let appeals = [];
    let selectedId = null;
    let selectedAppealId = null;
    let queueFilter = "all";
    let queueQuery = "";

    function snapshotTitle(report) {
        return report?.snapshot?.title || report?.book_id || "Unknown book";
    }

    function syncReportUrl(reportId) {
        const url = new URL(window.location.href);
        if (reportId) url.searchParams.set("report", reportId);
        else url.searchParams.delete("report");
        window.history.replaceState({}, "", url.pathname + url.search);
    }

    function filteredReports() {
        let list = reports;
        if (queueFilter === "critical") list = list.filter((r) => r.priority === "critical");
        else if (queueFilter === "high") list = list.filter((r) => r.priority === "high" || r.priority === "critical");
        if (queueQuery) {
            const q = queueQuery.toLowerCase();
            list = list.filter((r) => {
                const snap = r.snapshot || {};
                return (
                    snapshotTitle(r).toLowerCase().includes(q)
                    || String(snap.author || "").toLowerCase().includes(q)
                    || reportReasonLabel(r.reason).toLowerCase().includes(q)
                    || String(r.book_id || "").toLowerCase().includes(q)
                );
            });
        }
        return list;
    }

    function renderStats(stats) {
        if (!modStats) return;
        const items = [
            { label: "Pending", value: stats.pendingReports || 0, alert: Number(stats.pendingReports) > 0 },
            { label: "Critical", value: stats.criticalReports || 0, alert: Number(stats.criticalReports) > 0 },
            { label: "Violations", value: stats.openViolations || 0 },
            { label: "Deadlines", value: stats.missedDeadlines || 0, alert: Number(stats.missedDeadlines) > 0 },
            { label: "Appeals", value: stats.pendingAppeals || 0 },
            { label: "Hidden", value: stats.hiddenBooks || 0 },
            { label: "Removed", value: stats.removedBooks || 0 },
        ];
        modStats.innerHTML = items.map((item) => `
            <div class="mod-metric${item.alert ? " is-alert" : ""}">
                <span class="mod-metric-value">${item.value}</span>
                <span class="mod-metric-label">${escapeHtml(item.label)}</span>
            </div>
        `).join("");
    }

    function renderQueue() {
        if (!modQueue) return;
        const list = filteredReports();
        if (!reports.length) {
            modQueue.innerHTML = emptyState("No pending reports.");
            return;
        }
        if (!list.length) {
            modQueue.innerHTML = emptyState("No reports match this filter.");
            return;
        }

        modQueue.innerHTML = list.map((r) => {
            const snap = r.snapshot || {};
            return `
                <button type="button"
                    class="mod-queue-row${r.id === selectedId ? " is-selected" : ""}"
                    data-report-id="${r.id}">
                    <span class="mod-priority-dot ${priorityClass(r.priority)}" title="${escapeHtml(priorityLabel(r.priority))}"></span>
                    <span class="mod-queue-row-main">
                        <span class="mod-queue-row-title">${escapeHtml(snapshotTitle(r))}</span>
                        <span class="mod-queue-row-sub">${escapeHtml(reportReasonLabel(r.reason))} · @${escapeHtml(snap.author || "unknown")}</span>
                    </span>
                    <span class="mod-queue-row-end">
                        <span class="mod-queue-row-score">${Number(r.weighted_points || 0).toFixed(1)}</span>
                        <span class="mod-queue-row-time">${escapeHtml(formatRelative(r.created_at))}</span>
                    </span>
                </button>
            `;
        }).join("");

        modQueue.querySelectorAll("[data-report-id]").forEach((el) => {
            el.addEventListener("click", () => {
                selectedId = el.dataset.reportId;
                syncReportUrl(selectedId);
                renderQueue();
                renderDetail(reports.find((r) => r.id === selectedId));
            });
        });
    }

    function renderDetail(report) {
        if (!modDetail) return;
        if (!report) {
            modDetail.innerHTML = emptyState("Select a report from the queue.");
            return;
        }

        const snap = report.snapshot || {};
        modDetail.innerHTML = `
            <div class="mod-case" data-case-root>
                <header class="mod-case-header">
                    <div class="mod-case-header-main">
                        <span class="mod-priority-dot ${priorityClass(report.priority)}"></span>
                        <div>
                            <h2 class="mod-case-title">${escapeHtml(snap.title || report.book_id)}</h2>
                            <p class="mod-case-meta">@${escapeHtml(snap.author || "unknown")} · ${escapeHtml(reportReasonLabel(report.reason))} · ${escapeHtml(formatRelative(report.created_at))}</p>
                        </div>
                    </div>
                    <dl class="mod-case-stats">
                        <div><dt>Score</dt><dd>${Number(report.weighted_points || 0).toFixed(1)}</dd></div>
                        <div><dt>Weight</dt><dd>${Number(report.reporter_weight || 1).toFixed(1)}×${report.infraction_score}</dd></div>
                        <div><dt>Status</dt><dd>${escapeHtml(reportStatusLabel(report.status))}</dd></div>
                    </dl>
                </header>

                <div class="mod-case-facts">
                    <dl class="mod-fact-grid">
                        <div><dt>Rating</dt><dd>${escapeHtml(snap.rating || "—")}</dd></div>
                        <div><dt>Type</dt><dd>${escapeHtml(snap.type || "—")}</dd></div>
                        <div><dt>Book ID</dt><dd><code>${escapeHtml(report.book_id)}</code></dd></div>
                        <div><dt>Priority</dt><dd>${escapeHtml(priorityLabel(report.priority))}</dd></div>
                    </dl>
                    ${report.details ? `
                    <div class="mod-case-notes">
                        <span class="mod-kicker">Reporter notes</span>
                        <p>${escapeHtml(report.details)}</p>
                    </div>` : ""}
                </div>

                <div class="mod-case-actions">
                    <div class="mod-segmented" role="tablist">
                        <button type="button" class="mod-segment is-active" data-case-tab="clear" role="tab" aria-selected="true">Clear</button>
                        <button type="button" class="mod-segment" data-case-tab="violation" role="tab" aria-selected="false">Violation</button>
                        <button type="button" class="mod-segment" data-case-tab="visibility" role="tab" aria-selected="false">Visibility</button>
                    </div>

                    <div class="mod-case-panel" data-case-panel="clear">
                        <textarea class="mod-textarea" id="modNoViolationNotes" placeholder="Internal notes" rows="2"></textarea>
                        <label class="mod-check"><input type="checkbox" id="modFalseReport"> False or malicious report</label>
                        <div class="mod-action-row">
                            <button type="button" class="mod-btn" id="modNoViolationBtn">Close — no violation</button>
                            <button type="button" class="mod-btn mod-btn-ghost" id="modDismissBtn">Dismiss</button>
                        </div>
                    </div>

                    <div class="mod-case-panel hidden" data-case-panel="violation">
                        <input class="mod-input" id="modPolicy" placeholder="Policy violated" />
                        <textarea class="mod-textarea" id="modCorrections" placeholder="Correction requirements" rows="3"></textarea>
                        <div class="mod-inline-fields">
                            <label class="mod-field">Deadline (days)
                                <input class="mod-input mod-input-sm" type="number" id="modDeadlineDays" value="7" min="1" max="90" />
                            </label>
                            <label class="mod-check"><input type="checkbox" id="modSevere"> Severe</label>
                        </div>
                        <div class="mod-action-row">
                            <button type="button" class="mod-btn mod-btn-danger" id="modConfirmBtn">Confirm & notify author</button>
                        </div>
                    </div>

                    <div class="mod-case-panel hidden" data-case-panel="visibility">
                        <textarea class="mod-textarea" id="modVisReason" placeholder="Reason (optional)" rows="2"></textarea>
                        <div class="mod-action-row">
                            <button type="button" class="mod-btn" data-vis="public">Public</button>
                            <button type="button" class="mod-btn mod-btn-ghost" data-vis="hidden">Hide</button>
                            <button type="button" class="mod-btn mod-btn-danger" data-vis="removed">Remove</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        wireCaseTabs(modDetail.querySelector("[data-case-root]"));

        modDetail.querySelector("#modNoViolationBtn")?.addEventListener("click", async () => {
            if (!await confirmModAction("Close without violation?", "Marks the report reviewed with no policy breach.", "success")) return;
            try {
                await reviewReportNoViolation(
                    report.id,
                    modDetail.querySelector("#modNoViolationNotes").value.trim(),
                    modDetail.querySelector("#modFalseReport").checked
                );
                showStatus("Report closed.");
                await loadAll();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });

        modDetail.querySelector("#modDismissBtn")?.addEventListener("click", async () => {
            if (!await confirmModAction("Dismiss report?", "Dismisses without a violation finding.")) return;
            try {
                await dismissReport(report.id, modDetail.querySelector("#modNoViolationNotes").value.trim());
                showStatus("Report dismissed.");
                await loadAll();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });

        modDetail.querySelector("#modConfirmBtn")?.addEventListener("click", async () => {
            const policy = modDetail.querySelector("#modPolicy").value.trim();
            if (!policy) {
                showStatus("Policy description is required.", "error");
                modDetail.querySelector("#modPolicy")?.focus();
                return;
            }
            const isSevere = modDetail.querySelector("#modSevere").checked;
            if (!await confirmModAction(
                isSevere ? "Confirm severe violation?" : "Confirm violation?",
                isSevere ? "May suspend account and remove the book." : "Author will be notified; strike applied per policy.",
                "danger"
            )) return;
            try {
                await confirmViolation(report.id, {
                    policyViolated: policy,
                    correctionRequirements: modDetail.querySelector("#modCorrections").value.trim(),
                    deadlineDays: parseInt(modDetail.querySelector("#modDeadlineDays").value, 10) || 7,
                    isSevere,
                });
                showStatus("Violation confirmed.");
                await loadAll();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });

        modDetail.querySelectorAll("[data-vis]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const vis = btn.dataset.vis;
                if (!await confirmModAction(
                    `Set visibility to ${vis}?`,
                    snap.title || report.book_id,
                    vis === "removed" ? "danger" : "default"
                )) return;
                try {
                    await setBookVisibility(report.book_id, vis, modDetail.querySelector("#modVisReason")?.value.trim() || "");
                    showStatus(`Visibility: ${vis}.`);
                } catch (err) {
                    showStatus(err.message || "Action failed.", "error");
                }
            });
        });
    }

    function renderAppealsQueue() {
        if (!modAppeals) return;
        if (!appeals.length) {
            modAppeals.innerHTML = emptyState("No pending appeals.");
            return;
        }

        modAppeals.innerHTML = appeals.map((a) => {
            const v = a.moderation_violations || {};
            return `
                <button type="button"
                    class="mod-queue-row${a.id === selectedAppealId ? " is-selected" : ""}"
                    data-appeal-id="${a.id}">
                    <span class="mod-priority-dot high"></span>
                    <span class="mod-queue-row-main">
                        <span class="mod-queue-row-title">${escapeHtml(v.policy_violated || "Appeal")}</span>
                        <span class="mod-queue-row-sub"><code>${escapeHtml(v.book_id || "—")}</code></span>
                    </span>
                    <span class="mod-queue-row-end">
                        <span class="mod-queue-row-time">${escapeHtml(formatRelative(a.created_at))}</span>
                    </span>
                </button>
            `;
        }).join("");

        modAppeals.querySelectorAll("[data-appeal-id]").forEach((el) => {
            el.addEventListener("click", () => {
                selectedAppealId = el.dataset.appealId;
                renderAppealsQueue();
                renderAppealDetail(appeals.find((a) => a.id === selectedAppealId));
            });
        });
    }

    function renderAppealDetail(appeal) {
        if (!modAppealDetail) return;
        if (!appeal) {
            modAppealDetail.innerHTML = emptyState("Select an appeal from the queue.");
            return;
        }

        const v = appeal.moderation_violations || {};
        modAppealDetail.innerHTML = `
            <div class="mod-case">
                <header class="mod-case-header">
                    <div class="mod-case-header-main">
                        <span class="mod-priority-dot high"></span>
                        <div>
                            <h2 class="mod-case-title">${escapeHtml(v.policy_violated || "Appeal")}</h2>
                            <p class="mod-case-meta"><code>${escapeHtml(v.book_id || "—")}</code> · ${escapeHtml(formatDate(appeal.created_at))}</p>
                        </div>
                    </div>
                </header>

                <div class="mod-case-notes">
                    <span class="mod-kicker">Author appeal</span>
                    <p>${escapeHtml(appeal.appeal_text || "—")}</p>
                </div>
                ${v.correction_requirements ? `
                <div class="mod-case-notes">
                    <span class="mod-kicker">Original requirements</span>
                    <p>${escapeHtml(v.correction_requirements)}</p>
                </div>` : ""}

                <div class="mod-case-actions">
                    <span class="mod-kicker">Resolution</span>
                    <textarea class="mod-textarea" id="modAppealNotes" placeholder="Notes (optional)" rows="2"></textarea>
                    <div class="mod-action-row">
                        <button type="button" class="mod-btn" data-outcome="overturned">Overturn</button>
                        <button type="button" class="mod-btn mod-btn-ghost" data-outcome="partial">Partial</button>
                        <button type="button" class="mod-btn mod-btn-danger" data-outcome="upheld">Uphold</button>
                    </div>
                </div>
            </div>
        `;

        modAppealDetail.querySelectorAll("[data-outcome]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const outcome = btn.dataset.outcome;
                const labels = { overturned: "Overturn?", partial: "Partial resolution?", upheld: "Uphold?" };
                if (!await confirmModAction(labels[outcome], "Author will be notified.", outcome === "upheld" ? "danger" : "default")) return;
                try {
                    await resolveAppeal(appeal.id, outcome, modAppealDetail.querySelector("#modAppealNotes")?.value.trim() || "");
                    showStatus("Appeal resolved.");
                    selectedAppealId = null;
                    await loadAll();
                } catch (err) {
                    showStatus(err.message || "Action failed.", "error");
                }
            });
        });
    }

    async function loadAppeals() {
        appeals = await fetchPendingAppeals();
        if (selectedAppealId && !appeals.find((a) => a.id === selectedAppealId)) selectedAppealId = null;
        renderAppealsQueue();
        renderAppealDetail(appeals.find((a) => a.id === selectedAppealId) || null);
    }

    async function loadAll() {
        const urlReport = new URLSearchParams(window.location.search).get("report");
        const [stats, pending, reviewing] = await Promise.all([
            getDashboardStats(),
            listPendingReports("pending", 100),
            listPendingReports("reviewing", 100),
        ]);
        reports = [...pending, ...reviewing];

        if (urlReport && reports.find((r) => r.id === urlReport)) selectedId = urlReport;
        else if (selectedId && !reports.find((r) => r.id === selectedId)) selectedId = reports[0]?.id || null;
        else if (!selectedId && reports.length) selectedId = reports[0].id;

        renderStats(stats);
        renderQueue();
        renderDetail(reports.find((r) => r.id === selectedId) || null);
        if (selectedId) syncReportUrl(selectedId);
        await loadAppeals();
        return stats;
    }

    document.querySelectorAll("[data-queue-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
            queueFilter = btn.dataset.queueFilter || "all";
            document.querySelectorAll("[data-queue-filter]").forEach((b) => {
                b.classList.toggle("is-active", b.dataset.queueFilter === queueFilter);
            });
            renderQueue();
        });
    });

    modQueueSearch?.addEventListener("input", () => {
        queueQuery = modQueueSearch.value.trim().toLowerCase();
        renderQueue();
    });

    document.getElementById("modRefreshBtn")?.addEventListener("click", () => {
        loadAll().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modCheckDeadlinesBtn")?.addEventListener("click", async () => {
        try {
            const n = await checkViolationDeadlines();
            showStatus(n ? `${n} deadline(s) processed.` : "No missed deadlines.");
            await loadAll();
        } catch (err) {
            showStatus(err.message || "Check failed.", "error");
        }
    });

    return { loadAll };
}
