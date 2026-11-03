import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { createBetaReadApi } from "/applications/editor/page-ui/beta-read-api.js";
import { initWorkspaceShell } from "./shell.js";

const WELCOME = { lead: "Writing ", accent: "Studio", subtitle: "Beta Reads" };
const DOCUMENT_PATH = "/beta-read-document";
const REVIEW_LABEL = { pending: "Pending review", accepted: "Accepted", rejected: "Rejected" };
const REVIEW_ACTIONS = {
    pending: [["accepted", "Accept suggestion"], ["rejected", "Reject suggestion"]],
    accepted: [["pending", "Reopen suggestion"]],
    rejected: [["pending", "Reopen suggestion"]],
};

function el(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
}

function authorName(read) {
    return read.authorUsername || read.author_username || "Unknown author";
}

function showMessage(root, text) {
    root.replaceChildren();
    const message = el("p", text);
    message.className = "beta-reads-empty";
    message.setAttribute("role", "status");
    root.append(message);
}

function paintFeedback(section, chapters, read, api, reload) {
    section.replaceChildren();
    let hasItems = false;
    for (const chapter of chapters) {
        const threads = chapter.threads || [];
        const suggestions = chapter.suggestions || [];
        if (!threads.length && !suggestions.length) continue;
        hasItems = true;
        section.append(el("h3", chapter.title));
        for (const suggestion of suggestions) {
            const quote = el("blockquote", suggestion.quote);
            quote.className = "beta-reads-suggestion";
            section.append(quote);
            const comparison = el("p");
            comparison.className = "beta-reads-diff";
            comparison.append(
                el("del", suggestion.quote),
                document.createTextNode(" → "),
                el("ins", suggestion.replacement || "∅ (delete selection)")
            );
            section.append(comparison);
            if (suggestion.note) section.append(el("p", suggestion.authorLabel + ": " + suggestion.note));
            const state = el("p", (REVIEW_LABEL[suggestion.status] || suggestion.status) + " · Does not modify manuscript");
            state.className = "beta-reads-review-state";
            section.append(state);
            for (const [status, label] of REVIEW_ACTIONS[suggestion.status] || REVIEW_ACTIONS.pending) {
                const button = el("button", label);
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    try {
                        await api.reviewSuggestion(read.id, suggestion.id, status);
                        await reload();
                    } catch (error) {
                        button.disabled = false;
                        alert(error.message);
                    }
                });
                section.append(button);
            }
        }
        for (const thread of threads) {
            section.append(el("blockquote", thread.quote));
            for (const comment of thread.comments) section.append(el("p", comment.authorLabel + ": " + comment.body));
            const toggle = el("button", thread.resolvedAt ? "Reopen" : "Resolve");
            toggle.addEventListener("click", async () => {
                toggle.disabled = true;
                try {
                    await api.moderate(read.id, thread.id, thread.resolvedAt ? "reopen" : "resolve");
                    await reload();
                } catch (error) {
                    toggle.disabled = false;
                    alert(error.message);
                }
            });
            section.append(toggle);
        }
    }
    if (!hasItems) section.append(el("p", "No comments or suggested edits yet."));
}

function paintRead(root, read, api, refreshList) {
    const card = el("article");
    card.className = "beta-reads-card";
    card.append(
        el("h2", read.title || "Untitled book"),
        el("p", read.status === "closed" ? "Archived · Link closed" : "Active · No automatic expiration"),
        el("small", "by " + authorName(read))
    );

    const open = el("a", "Open document");
    open.className = "beta-reads-open";
    open.href = DOCUMENT_PATH + "?id=" + encodeURIComponent(read.id);

    const review = el("button", "Review feedback");
    review.addEventListener("click", async () => {
        const existing = card.querySelector("[data-feedback]");
        if (existing) {
            existing.remove();
            review.textContent = "Review feedback";
            return;
        }
        review.disabled = true;
        try {
            const { chapters } = await api.threads(read.id);
            const section = el("section");
            section.dataset.feedback = "yes";
            const reload = async () => {
                const next = await api.threads(read.id);
                paintFeedback(section, next.chapters || [], read, api, reload);
            };
            paintFeedback(section, chapters || [], read, api, reload);
            card.append(section);
            review.textContent = "Hide feedback";
        } catch (error) {
            const message = el("p", error.message);
            message.setAttribute("role", "alert");
            card.append(message);
        } finally {
            review.disabled = false;
        }
    });

    card.append(open, review);

    if (read.status === "active") {
        const close = el("button", "Close and archive");
        close.addEventListener("click", async () => {
            if (!confirm("Close this link? Feedback will be preserved.")) return;
            close.disabled = true;
            try {
                await api.close(read.id);
                await refreshList();
            } catch (error) {
                alert(error.message);
                close.disabled = false;
            }
        });
        card.append(close);
    }

    const remove = el("button", "Delete permanently");
    remove.className = "beta-reads-delete";
    remove.title = "Delete this beta copy and its feedback permanently";
    remove.addEventListener("click", async () => {
        const confirmed = prompt("Permanently delete this beta copy and all its feedback? This cannot be undone.\n\nType the exact title to confirm:\n" + (read.title || ""));
        if (confirmed === null) return;
        if (confirmed !== read.title) {
            alert("Title did not match. Nothing was deleted.");
            return;
        }
        remove.disabled = true;
        try {
            await api.delete(read.id, confirmed);
            await refreshList();
        } catch (error) {
            alert(error.message);
            remove.disabled = false;
        }
    });
    card.append(remove);
    root.append(card);
}

async function refresh(root, api) {
    root.textContent = "Loading your beta reads…";
    try {
        const { reads } = await api.list();
        root.replaceChildren();
        if (!reads.length) {
            showMessage(root, "No beta reads yet. Create one from the editor's Share → Beta Read tab.");
            return;
        }
        for (const read of reads) paintRead(root, read, api, () => refresh(root, api));
    } catch (error) {
        showMessage(root, error.message);
    }
}

function showLocalGuest(root) {
    root.replaceChildren();
    const message = el("p");
    message.className = "beta-reads-empty";
    message.append("Beta Reads are cloud copies. Sign in to an Alysum account to manage them. ");
    const link = el("a", "Sign in");
    link.href = "/login?next=" + encodeURIComponent("/beta-reads");
    message.append(link);
    root.append(message);
}

async function boot() {
    const root = document.getElementById("beta-reads-list");
    if (location.pathname !== "/beta-reads") {
        history.replaceState({}, "", "/beta-reads" + location.search + location.hash);
    }
    initWorkspaceShell(WELCOME);
    const session = await requireStudioSession(supabase, "/beta-reads" + location.search);
    if (!session) return;
    void loadWorkspaceProfile(supabase, session).then((profile) => {
        initWorkspaceShell({ ...WELCOME, name: profile.name, imageUrl: profile.imageUrl });
    }).catch(() => {});
    if (session.mode !== "cloud") {
        showLocalGuest(root);
        return;
    }
    await refresh(root, createBetaReadApi(supabase));
}

boot().catch((error) => {
    const root = document.getElementById("beta-reads-list");
    if (root) showMessage(root, error.message);
});
