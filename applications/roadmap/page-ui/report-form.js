import { supabase } from "@alysum/authentication/client.js";
import { submitReport } from "@alysum/roadmap/store.js?v=3";
import { isReportQuotaOpen } from "@alysum/roadmap/quotas.js";
import { isAttachmentBucketMissing, uploadStagingAttachment } from "@alysum/roadmap/upload.js";
import { loginHref, state } from "./state.js";
import { showPage } from "./tabs.js";
import { bindDropzone, chosenFiles, clearFiles } from "./attachments.js";

function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("show", Boolean(message));
}

function minutesUntil(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "soon";
    const mins = Math.max(1, Math.round(ms / 60000));
    return `${mins} min`;
}

function paintQuota(quota) {
    const used = Number(quota?.used) || 0;
    const limit = Number(quota?.limit) || 3;
    const text = document.getElementById("quotaText");
    const bar = document.getElementById("quotaBar");
    const frame = document.getElementById("reportFrame");
    const timer = document.getElementById("resetTimer");
    if (isReportQuotaOpen(state.user?.username) || limit >= 9999) {
        if (text) text.textContent = "no cooldown";
        frame?.classList.remove("quota-blocked");
        return;
    }
    if (text) text.textContent = `${used} / 3 used this hour`;
    if (bar) {
        bar.replaceChildren();
        for (let i = 0; i < 3; i += 1) {
            const span = document.createElement("span");
            if (i < used) span.className = "used";
            bar.appendChild(span);
        }
    }
    if (used >= limit && state.user) {
        frame?.classList.add("quota-blocked");
        if (timer) timer.textContent = minutesUntil(quota.resetAt);
    }
}

function lockGuest() {
    const frame = document.getElementById("reportFrame");
    const note = frame?.querySelector(".blocked-note");
    frame?.classList.add("quota-blocked");
    if (note) {
        note.replaceChildren();
        note.append("Authenticate to file a report. ");
        const a = document.createElement("a");
        a.href = loginHref("report");
        a.textContent = "Log in";
        a.style.color = "var(--green-bright)";
        note.appendChild(a);
    }
}

export function bindReportForm({ quota }) {
    const line = document.getElementById("reportAuthLine");
    const hint = document.querySelector("#report .field-hint");
    if (state.user) {
        if (line) {
            line.textContent = isReportQuotaOpen(state.user.username)
                ? `Authenticated as user:${state.user.username}. Report cooldown is off for this account.`
                : `Authenticated as user:${state.user.username}. Submissions are capped at 3 per rolling hour to keep the log readable.`;
        }
        if (hint) hint.textContent = `Filed as user:${state.user.username} · duplicate titles will be flagged before submit`;
        paintQuota(quota || { used: 0, limit: 3 });
    } else {
        if (line) {
            line.replaceChildren();
            line.append("Found a break in the system? ");
            const a = document.createElement("a");
            a.href = loginHref("report");
            a.textContent = "Authenticate to file a report.";
            a.style.color = "var(--green-bright)";
            line.appendChild(a);
            line.append(" Read access is open to all.");
        }
        lockGuest();
    }

    const submit = document.getElementById("reportSubmit");
    if (submit?.dataset.wired === "1") {
        if (state.user) paintQuota(quota || { used: 0, limit: 3 });
        return;
    }
    if (submit) submit.dataset.wired = "1";
    bindDropzone((message) => showError("reportSubmitError", message));

    submit?.addEventListener("click", async () => {
        if (!state.user) {
            location.href = loginHref("report");
            return;
        }
        const title = document.getElementById("reportTitle")?.value.trim() || "";
        const body = document.getElementById("reportBody")?.value.trim() || "";
        const severity = document.getElementById("reportSeverity")?.value || "normal";
        showError("reportTitleError", "");
        showError("reportSubmitError", "");
        if (!title) {
            showError("reportTitleError", "Title is required.");
            return;
        }
        if (!body) {
            showError("reportSubmitError", "Description is required.");
            return;
        }
        const dup = state.catalog.bugs.some(
            (row) => String(row.title || "").toLowerCase() === title.toLowerCase()
        );
        if (dup) {
            showError("reportTitleError", "duplicate title — edit the existing report instead");
            return;
        }
        try {
            const tempId = crypto.randomUUID();
            const uploaded = [];
            for (const file of chosenFiles()) {
                try {
                    uploaded.push(await uploadStagingAttachment(supabase, state.user.userId, tempId, file));
                } catch (err) {
                    if (!isAttachmentBucketMissing(err)) throw err;
                }
            }
            const result = await submitReport(supabase, {
                title,
                body,
                severity,
                files: uploaded,
            });
            document.getElementById("reportTitle").value = "";
            document.getElementById("reportBody").value = "";
            clearFiles();
            state.catalog.bugs.unshift({
                stub: result.stub,
                kind: "bug",
                title,
                body,
                severity,
                status: "open",
                authorUsername: state.user.username,
                author: `user:${state.user.username}`,
                createdAt: new Date().toISOString(),
                relative: "just now",
                votes: 0,
                voted: false,
                replyCount: 0,
                files: uploaded,
            });
            showPage("bugs");
            window.dispatchEvent(new Event("roadmap:refresh-lists"));
        } catch (err) {
            if (String(err.message || "").includes("LIMIT REACHED")) {
                document.getElementById("reportFrame")?.classList.add("quota-blocked");
            }
            showError("reportSubmitError", err.message || "Could not submit.");
        }
    });
}
