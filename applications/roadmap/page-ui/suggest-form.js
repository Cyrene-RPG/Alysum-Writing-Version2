import { submitSuggestion } from "@alysum/roadmap/store.js?v=3";
import { supabase } from "@alysum/authentication/client.js";
import { loginHref, state } from "./state.js";
import { paintSuggestions } from "./render.js";
import { applySuggestFilter } from "./filters.js";

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
    if (pill) pill.textContent = `${used}/1 used today`;
    if (state.user && limit) {
        limit.textContent = `limit reached — 1 suggestion per user per day. Resets at midnight, filed as user:${state.user.username}.`;
    }

    const lock = !state.user || used >= 1;
    if (toggle) {
        toggle.style.opacity = lock ? "0.4" : "";
        toggle.style.pointerEvents = lock ? "none" : "";
        toggle.onclick = () => {
            if (!state.user) {
                location.href = loginHref("suggestions");
                return;
            }
            if (used >= 1) {
                limit?.classList.add("show");
                return;
            }
            panel?.classList.toggle("open");
        };
        if (lock && !state.user) toggle.style.pointerEvents = "";
    }
    if (used >= 1) limit?.classList.add("show");
    else limit?.classList.remove("show");

    const submit = document.getElementById("suggestSubmit");
    if (submit?.dataset.wired === "1") return;
    if (submit) submit.dataset.wired = "1";
    submit?.addEventListener("click", async () => {
        const title = document.getElementById("suggestTitle")?.value.trim() || "";
        const body = document.getElementById("suggestBody")?.value.trim() || "";
        showError("suggestTitleError", title ? "" : "Title is required.");
        showError("suggestSubmitError", "");
        if (!title) return;
        try {
            const result = await submitSuggestion(supabase, { title, body });
            panel?.classList.remove("open");
            if (pill) pill.textContent = "1/1 used today";
            limit?.classList.add("show");
            if (toggle) {
                toggle.style.opacity = "0.4";
                toggle.style.pointerEvents = "none";
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
                replyCount: 0,
                files: [],
            });
            paintSuggestions(applySuggestFilter(state.catalog.suggestions, state.suggestFilter));
        } catch (err) {
            showError("suggestSubmitError", err.message || "Could not submit.");
        }
    });
}
