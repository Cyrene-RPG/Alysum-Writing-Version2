import { supabase } from "@alysum/authentication/client.js";
import { submitReport } from "@alysum/roadmap/store.js?v=9";
import { isReportQuotaOpen } from "@alysum/roadmap/quotas.js";
import { isAttachmentBucketMissing, uploadStagingAttachment } from "@alysum/roadmap/upload.js";
import { loginHref, state } from "./state.js";
import { showPage } from "./tabs.js";
import { bindDropzone, chosenFiles, clearFiles } from "./attachments.js";
import { playUiSound } from "./ui-sounds.js?v=13";
import { healReportSubmit, resetReportHeal } from "./report-effects.js";

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

function restoreLimitNote() {
    const note = document.querySelector("#reportFrame .blocked-note");
    if (!note || note.querySelector("#resetTimer")) return;
    note.replaceChildren();
    note.append("LIMIT REACHED — 3/3 reports filed this hour. Resets in ");
    const timer = document.createElement("span");
    timer.id = "resetTimer";
    note.append(timer);
    note.append(". Try again then, or edit an existing report instead.");
}

function paintQuota(quota) {
    const used = Number(quota?.used) || 0;
    const limit = Number(quota?.limit) || 3;
    const text = document.getElementById("quotaText");
    const bar = document.getElementById("quotaBar");
    const frame = document.getElementById("reportFrame");
    const timer = document.getElementById("resetTimer");
    frame?.classList.remove("quota-blocked");
    if (isReportQuotaOpen(state.user?.username) || limit >= 9999) {
        if (text) text.textContent = "no cooldown";
        restoreLimitNote();
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

function paintReportHint() {
    const hint = document.querySelector("#report .field-hint");
    if (!hint || !state.user) return;
    const asAnon = document.getElementById("reportAnonymous")?.checked;
    hint.textContent = asAnon
        ? "Filed as anonymous · duplicate titles will be flagged before submit"
        : `Filed as user:${state.user.username} · duplicate titles will be flagged before submit`;
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
    if (state.user) {
        restoreLimitNote();
        if (line) {
            line.textContent = isReportQuotaOpen(state.user.username)
                ? `Authenticated as user:${state.user.username}. Report cooldown is off for this account.`
                : `Authenticated as user:${state.user.username}. Submissions are capped at 3 per rolling hour to keep the log readable.`;
        }
        paintReportHint();
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
    document.getElementById("reportAnonymous")?.addEventListener("change", paintReportHint);
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
            resetReportHeal(submit);
            showError("reportTitleError", "Title is required.");
            playUiSound("error");
            return;
        }
        if (!body) {
            resetReportHeal(submit);
            showError("reportSubmitError", "Description is required.");
            playUiSound("error");
            return;
        }
        const dup = state.catalog.bugs.some(
            (row) => String(row.title || "").toLowerCase() === title.toLowerCase()
        );
        if (dup) {
            resetReportHeal(submit);
            showError("reportTitleError", "duplicate title — edit the existing report instead");
            playUiSound("error");
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
            const asAnon = Boolean(document.getElementById("reportAnonymous")?.checked);
            const result = await submitReport(supabase, {
                title,
                body,
                severity,
                files: uploaded,
                anonymous: asAnon,
            });
            playUiSound("report");
            document.getElementById("reportTitle").value = "";
            document.getElementById("reportBody").value = "";
            const anonBox = document.getElementById("reportAnonymous");
            if (anonBox) anonBox.checked = false;
            paintReportHint();
            clearFiles();
            state.catalog.bugs.unshift({
                stub: result.stub,
                kind: "bug",
                title,
                body,
                severity,
                status: "open",
                authorUsername: asAnon ? "anonymous" : state.user.username,
                author: asAnon ? "anonymous" : `user:${state.user.username}`,
                createdAt: new Date().toISOString(),
                relative: "just now",
                votes: 0,
                voted: false,
                downs: 0,
                downVoted: false,
                replyCount: 0,
                files: uploaded,
            });
            await healReportSubmit(submit);
            showPage("bugs");
            window.dispatchEvent(new Event("roadmap:refresh-lists"));
        } catch (err) {
            if (String(err.message || "").includes("LIMIT REACHED")) {
                document.getElementById("reportFrame")?.classList.add("quota-blocked");
            }
            resetReportHeal(submit);
            playUiSound("error");
            showError("reportSubmitError", err.message || "Could not submit.");
        }
    });
}
