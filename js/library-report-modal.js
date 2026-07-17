/**
 * Reusable "Report book" modal for read.html and library.html.
 */

import { REPORT_REASONS, submitLibraryReport } from "./library-reports-api.js";

let modalRoot = null;

function ensureModalRoot() {
    if (modalRoot) return modalRoot;

    const wrap = document.createElement("div");
    wrap.id = "libraryReportModalRoot";
    wrap.className = "lr-modal-root hidden";
    wrap.innerHTML = `
        <div class="lr-modal-backdrop" data-lr-close></div>
        <div class="lr-modal" role="dialog" aria-modal="true" aria-labelledby="lrModalTitle">
            <div class="lr-modal-head">
                <h2 id="lrModalTitle">Report this book</h2>
                <button type="button" class="lr-modal-close" data-lr-close aria-label="Close">✕</button>
            </div>
            <p class="lr-modal-intro">
                Help keep the Alysum library safe and accurately rated. Reports are reviewed by Support staff.
                Knowingly false reports may result in account restrictions.
            </p>
            <div class="lr-book-preview hidden" id="lrBookPreview"></div>
            <form id="lrReportForm" class="lr-form">
                <fieldset class="lr-reasons" id="lrReasonFieldset">
                    <legend class="lr-label">Reason for report</legend>
                </fieldset>
                <label class="lr-label" for="lrDetails">Additional details (optional)</label>
                <textarea id="lrDetails" class="lr-textarea" rows="4" maxlength="4000"
                    placeholder="Describe what is wrong with the rating, warnings, tags, or content…"></textarea>
                <p class="lr-error hidden" id="lrError"></p>
                <div class="lr-actions">
                    <button type="button" class="lr-btn" data-lr-close>Cancel</button>
                    <button type="submit" class="lr-btn primary" id="lrSubmitBtn">Submit report</button>
                </div>
            </form>
            <div class="lr-success hidden" id="lrSuccess">
                <p><strong>Report submitted.</strong> Alysum Support will review it manually. Thank you for helping keep the library safe.</p>
                <button type="button" class="lr-btn primary" data-lr-close>Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);

    const fieldset = wrap.querySelector("#lrReasonFieldset");
    REPORT_REASONS.forEach((reason) => {
        const id = `lr-reason-${reason.id}`;
        const label = document.createElement("label");
        label.className = "lr-reason-option" + (reason.priority === "critical" ? " is-critical" : "");
        label.innerHTML = `
            <input type="radio" name="lrReason" value="${reason.id}" id="${id}" required>
            <span class="lr-reason-copy">
                <span class="lr-reason-title">${escapeHtml(reason.label)}</span>
                <span class="lr-reason-desc">${escapeHtml(reason.description)}</span>
            </span>
        `;
        fieldset.appendChild(label);
    });

    wrap.querySelectorAll("[data-lr-close]").forEach((el) => {
        el.addEventListener("click", closeLibraryReportModal);
    });

    wrap.querySelector("#lrReportForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleSubmit(wrap);
    });

    modalRoot = wrap;
    return wrap;
}

function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

let activeBook = null;

/**
 * Open the report modal.
 * @param {{ bookId: string, title?: string, author?: string, onSuccess?: () => void }} opts
 */
export function openLibraryReportModal(opts) {
    const root = ensureModalRoot();
    activeBook = opts;

    const preview = root.querySelector("#lrBookPreview");
    const title = opts.title || "This book";
    const author = opts.author ? `@${opts.author}` : "";
    preview.innerHTML = `<strong>${escapeHtml(title)}</strong>${author ? ` <span class="lr-muted">${escapeHtml(author)}</span>` : ""}`;
    preview.classList.remove("hidden");

    root.querySelector("#lrReportForm").classList.remove("hidden");
    root.querySelector("#lrSuccess").classList.add("hidden");
    root.querySelector("#lrError").classList.add("hidden");
    root.querySelector("#lrDetails").value = "";
    root.querySelectorAll('input[name="lrReason"]').forEach((r) => { r.checked = false; });

    root.classList.remove("hidden");
    document.body.classList.add("lr-modal-open");

    const first = root.querySelector('input[name="lrReason"]');
    first?.focus();
}

export function closeLibraryReportModal() {
    if (!modalRoot) return;
    modalRoot.classList.add("hidden");
    document.body.classList.remove("lr-modal-open");
    activeBook = null;
}

async function handleSubmit(root) {
    const errEl = root.querySelector("#lrError");
    const submitBtn = root.querySelector("#lrSubmitBtn");
    errEl.classList.add("hidden");

    if (!activeBook?.bookId) {
        errEl.textContent = "No book selected.";
        errEl.classList.remove("hidden");
        return;
    }

    const reason = root.querySelector('input[name="lrReason"]:checked')?.value;
    if (!reason) {
        errEl.textContent = "Select a reason for your report.";
        errEl.classList.remove("hidden");
        return;
    }

    const details = root.querySelector("#lrDetails").value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
        await submitLibraryReport(activeBook.bookId, reason, details);
        root.querySelector("#lrReportForm").classList.add("hidden");
        root.querySelector("#lrSuccess").classList.remove("hidden");
        activeBook.onSuccess?.();
    } catch (err) {
        console.error(err);
        const msg = err?.message || "Could not submit report. Try again or contact Alysum Support.";
        if (msg.includes("logged in")) {
            window.location.href = "login.html?next=" + encodeURIComponent(window.location.href);
            return;
        }
        errEl.textContent = msg;
        errEl.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit report";
    }
}
