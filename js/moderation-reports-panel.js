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

function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
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

    let reports = [];
    let selectedId = null;

    function snapshotTitle(report) {
        return report?.snapshot?.title || report?.book_id || "Unknown book";
    }

    function renderStats(stats) {
        if (!modStats) return;
        const items = [
            { label: "Pending", value: stats.pendingReports || 0 },
            { label: "Critical", value: stats.criticalReports || 0, critical: true },
            { label: "Open violations", value: stats.openViolations || 0 },
            { label: "Missed deadlines", value: stats.missedDeadlines || 0 },
            { label: "Pending appeals", value: stats.pendingAppeals || 0 },
            { label: "Hidden books", value: stats.hiddenBooks || 0 },
            { label: "Removed books", value: stats.removedBooks || 0 },
        ];
        modStats.innerHTML = items.map((item) => `
            <div class="mod-stat${item.critical ? " is-critical" : ""}">
                <div class="mod-stat-label">${escapeHtml(item.label)}</div>
                <div class="mod-stat-value">${item.value}</div>
            </div>
        `).join("");
    }

    function renderQueue() {
        if (!modQueue) return;
        if (!reports.length) {
            modQueue.innerHTML = '<div class="mod-detail-empty">No pending reports in the queue.</div>';
            return;
        }

        modQueue.innerHTML = reports.map((r) => {
            const critical = r.priority === "critical";
            return `
                <div class="mod-queue-item${critical ? " is-critical" : ""}${r.id === selectedId ? " is-selected" : ""}"
                     data-report-id="${r.id}">
                    <div class="mod-queue-title">${escapeHtml(snapshotTitle(r))}</div>
                    <div class="mod-queue-meta">
                        <span class="mod-badge ${critical ? "critical" : r.priority === "high" ? "high" : ""}">${escapeHtml(priorityLabel(r.priority))}</span>
                        <span>${escapeHtml(reportReasonLabel(r.reason))}</span>
                        <span>Score: ${Number(r.weighted_points || 0).toFixed(1)}</span>
                        <span>${escapeHtml(formatDate(r.created_at))}</span>
                    </div>
                </div>
            `;
        }).join("");

        modQueue.querySelectorAll("[data-report-id]").forEach((el) => {
            el.addEventListener("click", () => {
                selectedId = el.dataset.reportId;
                renderQueue();
                renderDetail(reports.find((r) => r.id === selectedId));
            });
        });
    }

    function renderDetail(report) {
        if (!modDetail) return;
        if (!report) {
            modDetail.innerHTML = '<p class="mod-detail-empty">Select a report from the queue.</p>';
            return;
        }

        const snap = report.snapshot || {};
        modDetail.innerHTML = `
            <div class="mod-detail-block">
                <h3>Book</h3>
                <p><strong>${escapeHtml(snap.title || report.book_id)}</strong> · @${escapeHtml(snap.author || "unknown")}</p>
                <p>Rating: ${escapeHtml(snap.rating || "—")} · Type: ${escapeHtml(snap.type || "—")}</p>
                <p>Book ID: <code>${escapeHtml(report.book_id)}</code></p>
            </div>
            <div class="mod-detail-block">
                <h3>Report</h3>
                <p><span class="mod-badge ${report.priority === "critical" ? "critical" : ""}">${escapeHtml(priorityLabel(report.priority))}</span>
                   ${escapeHtml(reportReasonLabel(report.reason))}</p>
                <p>Weighted points: <strong>${Number(report.weighted_points || 0).toFixed(1)}</strong>
                   (reporter ${Number(report.reporter_weight || 1).toFixed(1)} × severity ${report.infraction_score})</p>
                <p>Status: ${escapeHtml(reportStatusLabel(report.status))}</p>
                ${report.details ? `<pre>${escapeHtml(report.details)}</pre>` : "<p><em>No additional details.</em></p>"}
            </div>
            <div class="mod-detail-block">
                <h3>Resolve — no violation</h3>
                <div class="mod-form">
                    <textarea class="mod-textarea" id="modNoViolationNotes" placeholder="Internal notes (optional)"></textarea>
                    <label><input type="checkbox" id="modFalseReport"> Mark as false / malicious report (reporter strike)</label>
                    <div class="mod-actions">
                        <button type="button" class="mod-btn success" id="modNoViolationBtn">Close — no violation</button>
                        <button type="button" class="mod-btn" id="modDismissBtn">Dismiss</button>
                    </div>
                </div>
            </div>
            <div class="mod-detail-block">
                <h3>Confirm violation</h3>
                <p class="mod-detail-empty" style="margin-bottom:8px">Notifies the author with policy, corrections required, and a deadline. Applies strike tier.</p>
                <div class="mod-form">
                    <input class="mod-input" id="modPolicy" placeholder="Policy violated (required)" />
                    <textarea class="mod-textarea" id="modCorrections" placeholder="Correction requirements — tags, rating, warnings to update…"></textarea>
                    <label>Deadline (days)
                        <input class="mod-input" type="number" id="modDeadlineDays" value="7" min="1" max="90" />
                    </label>
                    <label><input type="checkbox" id="modSevere"> Severe violation (bypass strikes — suspend / remove)</label>
                    <div class="mod-actions">
                        <button type="button" class="mod-btn danger" id="modConfirmBtn">Confirm violation & notify author</button>
                    </div>
                </div>
            </div>
            <div class="mod-detail-block">
                <h3>Book visibility</h3>
                <div class="mod-actions">
                    <button type="button" class="mod-btn" data-vis="public">Restore public</button>
                    <button type="button" class="mod-btn" data-vis="hidden">Temporarily hide</button>
                    <button type="button" class="mod-btn danger" data-vis="removed">Remove from library</button>
                </div>
            </div>
        `;

        modDetail.querySelector("#modNoViolationBtn")?.addEventListener("click", async () => {
            try {
                await reviewReportNoViolation(
                    report.id,
                    modDetail.querySelector("#modNoViolationNotes").value.trim(),
                    modDetail.querySelector("#modFalseReport").checked
                );
                showStatus("Report closed — no violation.");
                await loadAll();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });

        modDetail.querySelector("#modDismissBtn")?.addEventListener("click", async () => {
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
                showStatus("Policy violated description is required.", "error");
                return;
            }
            try {
                await confirmViolation(report.id, {
                    policyViolated: policy,
                    correctionRequirements: modDetail.querySelector("#modCorrections").value.trim(),
                    deadlineDays: parseInt(modDetail.querySelector("#modDeadlineDays").value, 10) || 7,
                    isSevere: modDetail.querySelector("#modSevere").checked,
                });
                showStatus("Violation confirmed. Author notified.");
                await loadAll();
            } catch (err) {
                showStatus(err.message || "Action failed.", "error");
            }
        });

        modDetail.querySelectorAll("[data-vis]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const vis = btn.dataset.vis;
                const reason = window.prompt(`Reason for setting visibility to "${vis}":`) || "";
                try {
                    await setBookVisibility(report.book_id, vis, reason);
                    showStatus(`Book visibility set to ${vis}.`);
                } catch (err) {
                    showStatus(err.message || "Action failed.", "error");
                }
            });
        });
    }

    async function renderAppeals() {
        if (!modAppeals) return;
        try {
            const appeals = await fetchPendingAppeals();
            if (!appeals.length) {
                modAppeals.innerHTML = '<div class="mod-detail-empty">No pending appeals.</div>';
                return;
            }
            modAppeals.innerHTML = appeals.map((a) => {
                const v = a.moderation_violations || {};
                return `
                    <div class="mod-queue-item" data-appeal-id="${a.id}">
                        <div class="mod-queue-title">Appeal · book ${escapeHtml(v.book_id || "")}</div>
                        <div class="mod-queue-meta">
                            <span>${escapeHtml(formatDate(a.created_at))}</span>
                        </div>
                        <pre style="margin-top:8px;font-size:13px">${escapeHtml(a.appeal_text)}</pre>
                        <div class="mod-actions" style="margin-top:10px">
                            <button type="button" class="mod-btn success" data-outcome="overturned" data-appeal="${a.id}">Overturn</button>
                            <button type="button" class="mod-btn" data-outcome="partial" data-appeal="${a.id}">Partial</button>
                            <button type="button" class="mod-btn danger" data-outcome="upheld" data-appeal="${a.id}">Uphold</button>
                        </div>
                    </div>
                `;
            }).join("");

            modAppeals.querySelectorAll("[data-outcome]").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const notes = window.prompt("Resolution notes (optional):") || "";
                    try {
                        await resolveAppeal(btn.dataset.appeal, btn.dataset.outcome, notes);
                        showStatus("Appeal resolved.");
                        await loadAll();
                    } catch (err) {
                        showStatus(err.message || "Action failed.", "error");
                    }
                });
            });
        } catch (err) {
            modAppeals.innerHTML = `<div class="mod-detail-empty">Could not load appeals: ${escapeHtml(err.message)}</div>`;
        }
    }

    async function loadAll() {
        selectedId = null;
        const [stats, pending, reviewing] = await Promise.all([
            getDashboardStats(),
            listPendingReports("pending", 100),
            listPendingReports("reviewing", 100),
        ]);
        reports = [...pending, ...reviewing];
        renderStats(stats);
        renderQueue();
        renderDetail(null);
        await renderAppeals();
        return stats;
    }

    document.getElementById("modRefreshBtn")?.addEventListener("click", () => {
        loadAll().catch((e) => showStatus(e.message, "error"));
    });

    document.getElementById("modCheckDeadlinesBtn")?.addEventListener("click", async () => {
        try {
            const n = await checkViolationDeadlines();
            showStatus(n ? `Processed ${n} missed deadline(s).` : "No missed deadlines.");
            await loadAll();
        } catch (err) {
            showStatus(err.message || "Check failed.", "error");
        }
    });

    return { loadAll };
}
