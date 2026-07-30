import {
    moderationListPublishApprovals,
    moderationReviewPublishApproval,
} from "./publish-cooldown.js";
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

/**
 * @param {{ showStatus: (msg: string, type?: string) => void }} opts
 */
export function initPublishApprovalsPanel(opts) {
    const { showStatus } = opts;
    const queueEl = document.getElementById("modPublishApprovalsQueue");
    const detailEl = document.getElementById("modPublishApprovalDetail");

    let requests = [];
    let selectedId = null;

    function renderQueue() {
        if (!queueEl) return;
        if (!requests.length) {
            queueEl.innerHTML = `<p class="mod-empty">No publish approval requests.</p>`;
            return;
        }
        queueEl.innerHTML = requests
            .map((row) => {
                const active = row.id === selectedId ? " is-active" : "";
                return `<button type="button" class="mod-queue-item${active}" data-request-id="${escapeHtml(row.id)}">
                    <span class="mod-queue-title">${escapeHtml(row.book_id)}</span>
                    <span class="mod-queue-meta">${escapeHtml(row.status)} · ${escapeHtml(formatDate(row.created_at))}</span>
                </button>`;
            })
            .join("");

        queueEl.querySelectorAll("[data-request-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                selectedId = btn.getAttribute("data-request-id");
                renderQueue();
                renderDetail();
            });
        });
    }

    function renderDetail() {
        if (!detailEl) return;
        const row = requests.find((r) => r.id === selectedId);
        if (!row) {
            detailEl.innerHTML = `<p class="mod-detail-empty">Select a request to review.</p>`;
            return;
        }

        detailEl.innerHTML = `
            <div class="mod-detail-card">
                <div class="mod-kicker">Publish approval</div>
                <h2 class="mod-detail-title">${escapeHtml(row.book_id)}</h2>
                <dl class="mod-detail-meta">
                    <div><dt>Status</dt><dd>${escapeHtml(row.status)}</dd></div>
                    <div><dt>Author</dt><dd><code>${escapeHtml(row.user_id)}</code></dd></div>
                    <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(row.created_at))}</dd></div>
                </dl>
                <div class="mod-detail-block">
                    <h3>Author message</h3>
                    <p>${escapeHtml(row.message || "—")}</p>
                </div>
                ${
                    row.status === "pending"
                        ? `<label class="mod-field">
                            <span>Staff note (optional)</span>
                            <textarea class="mod-input" id="modPublishApprovalNote" rows="3" maxlength="2000" placeholder="Reason for approval or denial…"></textarea>
                           </label>
                           <div class="mod-detail-actions">
                            <button type="button" class="mod-btn primary" id="modPublishApprovalApprove">Approve</button>
                            <button type="button" class="mod-btn" id="modPublishApprovalDeny">Deny</button>
                           </div>`
                        : `<div class="mod-detail-block">
                            <h3>Review</h3>
                            <p>${escapeHtml(row.staff_note || "—")}</p>
                            <p class="mod-detail-meta-line">Reviewed ${escapeHtml(formatDate(row.reviewed_at))}</p>
                           </div>`
                }
            </div>`;

        if (row.status !== "pending") return;

        detailEl.querySelector("#modPublishApprovalApprove")?.addEventListener("click", () => {
            void reviewSelected(true);
        });
        detailEl.querySelector("#modPublishApprovalDeny")?.addEventListener("click", () => {
            void reviewSelected(false);
        });
    }

    async function reviewSelected(approve) {
        const row = requests.find((r) => r.id === selectedId);
        if (!row || row.status !== "pending") return;
        const note = detailEl?.querySelector("#modPublishApprovalNote")?.value?.trim() || "";
        const ok = await confirmModAction(
            approve ? "Approve publish request?" : "Deny publish request?",
            approve
                ? "The author can publish this new book before the 30-day interval ends."
                : "The author will remain blocked until the cooldown expires or submits a new request.",
            approve ? "success" : "danger"
        );
        if (!ok) return;

        try {
            await moderationReviewPublishApproval(row.id, approve, note);
            showStatus(approve ? "Publish request approved." : "Publish request denied.");
            await loadAll();
        } catch (err) {
            showStatus(err?.message || "Could not review request.", "error");
        }
    }

    async function loadAll() {
        requests = await moderationListPublishApprovals("pending");
        if (selectedId && !requests.some((r) => r.id === selectedId)) {
            selectedId = requests[0]?.id || null;
        } else if (!selectedId && requests.length) {
            selectedId = requests[0].id;
        }
        renderQueue();
        renderDetail();
        return requests;
    }

    return { loadAll };
}
