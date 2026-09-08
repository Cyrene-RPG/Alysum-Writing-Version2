import { submitSuggestion } from "@alysum/roadmap/store.js?v=9";
import { supabase } from "@alysum/authentication/client.js";
import { loginHref, state } from "./state.js";
import { paintSuggestions } from "./render.js";
import { applySuggestFilter } from "./filters.js";
import { playUiSound } from "./ui-sounds.js?v=13";
import { isRoadmapQuotaOpen } from "@alysum/roadmap/quotas.js";
import { bindSuggestBreak, breakSuggestButton, mendSuggestButton } from "./suggest-break.js";

function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("show", Boolean(message));
}

export function bindSuggestForm({ quota }) {
    const toggle = document.getElementById("suggestToggle");
    const panel = document.getElementById("suggestPanel");
    const pill = document.getElementById("suggestQuotaPill");
    const limit = document.getElementById("suggestLimitNote");
    const used = Number(quota?.used) || 0;
    const cap = Number(quota?.limit) || 1;
    const open = isRoadmapQuotaOpen(state.user?.username) || cap >= 9999;
    if (pill) pill.textContent = open ? "no cooldown" : `${used}/1 used today`;
    if (state.user && limit) {
        limit.textContent = `limit reached — 1 suggestion per user per day. Resets at midnight, filed as user:${state.user.username}.`;
    }

    bindSuggestBreak(toggle);
    bindSuggestBreak(document.getElementById("suggestSubmit"));
    if (toggle) {
        toggle.style.opacity = "";
        toggle.style.pointerEvents = "";
        if (open) mendSuggestButton(toggle);
        else if (used >= cap) breakSuggestButton(toggle, { boom: false });
        toggle.onclick = () => {
            if (!state.user) {
                location.href = loginHref("suggestions");
                return;
            }
            if (!open && (used >= cap || toggle.classList.contains("broken"))) {
                limit?.classList.add("show");
                return;
            }
            panel?.classList.toggle("open");
        };
    }
    if (!open && used >= cap) limit?.classList.add("show");
    else limit?.classList.remove("show");

    const submit = document.getElementById("suggestSubmit");
    if (submit?.dataset.wired === "1") return;
    if (submit) submit.dataset.wired = "1";
    submit?.addEventListener("click", async () => {
        const title = document.getElementById("suggestTitle")?.value.trim() || "";
        const body = document.getElementById("suggestBody")?.value.trim() || "";
        showError("suggestTitleError", title ? "" : "Title is required.");
        showError("suggestSubmitError", "");
        if (!title) {
            playUiSound("error");
            return;
        }
        try {
            const result = await submitSuggestion(supabase, { title, body });
            playUiSound("suggest");
            panel?.classList.remove("open");
            if (!isRoadmapQuotaOpen(state.user?.username)) {
                if (pill) pill.textContent = "1/1 used today";
                limit?.classList.add("show");
                breakSuggestButton(toggle, { boom: true });
            }
            document.getElementById("suggestTitle").value = "";
            document.getElementById("suggestBody").value = "";
            state.catalog.suggestions.unshift({
                stub: result.stub,
                kind: "suggestion",
                title,
                body,
                status: "under-review",
                authorUsername: state.user.username,
                author: `user:${state.user.username}`,
                createdAt: new Date().toISOString(),
                relative: "just now",
                votes: 0,
                voted: false,
                downs: 0,
                downVoted: false,
                replyCount: 0,
                files: [],
            });
            paintSuggestions(applySuggestFilter(state.catalog.suggestions, state.suggestFilter));
        } catch (err) {
            playUiSound("error");
            showError("suggestSubmitError", err.message || "Could not submit.");
        }
    });
}
