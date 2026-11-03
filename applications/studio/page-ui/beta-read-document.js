import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "/core/desktop/studio-session.js";
import { createBetaReadApi } from "/applications/editor/page-ui/beta-read-api.js";
import { activateBetaAnchor, markBetaAnchors } from "/applications/editor/page-ui/beta-read-selection.js";

const REVIEW_LABEL = { pending: "Pending review", accepted: "Accepted", rejected: "Rejected" };
const REVIEW_ACTIONS = {
    pending: [["accepted", "Accept suggestion"], ["rejected", "Reject suggestion"]],
    accepted: [["pending", "Reopen suggestion"]],
    rejected: [["pending", "Reopen suggestion"]],
};

function el(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text || "";
    return node;
}

function cleanMarkup(html) {
    const wrapper = document.createDocumentFragment();
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    const allowed = new Set(["P", "BR", "I", "EM", "B", "STRONG", "U", "S", "DEL", "BLOCKQUOTE", "H1", "H2", "H3", "UL", "OL", "LI", "DIV", "SPAN", "HR", "SUP", "SUB"]);
    const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "MATH", "VIDEO", "AUDIO", "IMG", "LINK", "META", "TEMPLATE"]);
    function walk(source, target) {
        for (const child of source.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) { target.append(document.createTextNode(child.textContent)); continue; }
            if (child.nodeType !== Node.ELEMENT_NODE || blocked.has(child.tagName)) continue;
            if (!allowed.has(child.tagName)) { walk(child, target); continue; }
            const node = document.createElement(child.tagName.toLowerCase());
            if (child.classList.contains("alysum-indent")) node.classList.add("alysum-indent");
            walk(child, node);
            target.append(node);
        }
    }
    walk(parsed.body, wrapper);
    return wrapper;
}

function bindAnchors(prose, panel) {
    for (const mark of prose.querySelectorAll(".beta-anchored-text")) {
        mark.tabIndex = 0;
        mark.setAttribute("role", "button");
        mark.setAttribute("aria-label", mark.dataset.anchorKind === "suggestion" ? "View suggested edit" : "View comment on this passage");
        const open = () => {
            const card = activateBetaAnchor(prose, panel, mark.dataset.anchorId);
            card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        };
        mark.addEventListener("click", open);
        mark.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
    }
}

export async function bootBetaReadDocument() {
    const $ = name => document.getElementById(name);
    const nextPath = "/beta-read-document" + location.search;
    if (location.pathname !== "/beta-read-document") {
        history.replaceState({}, "", nextPath + location.hash);
    }
    const session = await requireStudioSession(supabase, nextPath);
    if (!session) return;
    if (session.mode !== "cloud") {
        $("title").textContent = "Sign in online";
        $("chapter-title").textContent = "Beta copies are stored on your Alysum account. Sign in online to review them.";
        return;
    }
    const api = createBetaReadApi(supabase);
    const id = new URL(location.href).searchParams.get("id");
    let snapshot, feedback, current = 0;

    async function show(index) {
        current = index;
        const chapter = snapshot.chapters[index];
        if (!chapter) return;
        $("chapter-title").textContent = chapter.title;
        const prose = $("prose");
        prose.replaceChildren(cleanMarkup(chapter.content));
        const chapterFeedback = feedback.chapters.find(c => c.id === chapter.id) || {};
        const threads = chapterFeedback.threads || [];
        const suggestions = chapterFeedback.suggestions || [];
        $("chapters").querySelectorAll("button").forEach((button, i) => button.setAttribute("aria-current", String(i === index)));
        const panel = $("threads");
        panel.replaceChildren();
        markBetaAnchors(prose, [
            ...threads.map(thread => ({ ...thread, kind: "comment" })),
            ...suggestions.map(suggestion => ({ ...suggestion, kind: "suggestion" })),
        ]);
        if (!threads.length && !suggestions.length) {
            const empty = el("p", "No feedback on this chapter yet.");
            empty.className = "empty";
            panel.append(empty);
            return;
        }
        for (const suggestion of suggestions) {
            const box = el("section");
            box.className = "thread suggestion";
            box.dataset.anchorId = suggestion.id;
            box.dataset.anchorKind = "suggestion";
            box.append(
                el("strong", "✦ Suggested edit · " + suggestion.authorLabel),
                el("blockquote", suggestion.quote)
            );
            const comparison = el("p");
            comparison.className = "suggestion-diff";
            comparison.append(el("del", suggestion.quote), document.createTextNode(" → "), el("ins", suggestion.replacement || "∅ (delete selection)"));
            box.append(comparison);
            if (suggestion.note) box.append(el("p", suggestion.note));
            const state = el("p", (REVIEW_LABEL[suggestion.status] || suggestion.status) + " · Does not modify manuscript");
            state.className = "review-state";
            box.append(state);
            const actions = el("div");
            actions.className = "review-actions";
            for (const [status, label] of REVIEW_ACTIONS[suggestion.status] || REVIEW_ACTIONS.pending) {
                const button = el("button", label);
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    try {
                        await api.reviewSuggestion(id, suggestion.id, status);
                        feedback = await api.threads(id);
                        await show(current);
                    } catch (error) {
                        button.disabled = false;
                        state.textContent = error.message;
                    }
                });
                actions.append(button);
            }
            box.append(actions);
            box.addEventListener("click", event => {
                if (event.target.closest("button")) return;
                activateBetaAnchor(prose, panel, suggestion.id);
                prose.querySelector(`.beta-anchored-text[data-anchor-id="${CSS.escape(String(suggestion.id))}"]`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            panel.append(box);
        }
        for (const thread of threads) {
            const box = el("section");
            box.className = "thread";
            box.dataset.anchorId = thread.id;
            box.dataset.anchorKind = "comment";
            box.dataset.thread = thread.id;
            box.append(el("blockquote", thread.quote));
            for (const comment of thread.comments) box.append(el("p", comment.authorLabel + ": " + comment.body));
            const toggle = el("button", thread.resolvedAt ? "Reopen" : "Resolve");
            toggle.addEventListener("click", async () => {
                toggle.disabled = true;
                try {
                    await api.moderate(id, thread.id, thread.resolvedAt ? "reopen" : "resolve");
                    feedback = await api.threads(id);
                    await show(current);
                } catch (error) {
                    toggle.disabled = false;
                    alert(error.message);
                }
            });
            box.append(toggle);
            box.addEventListener("click", event => {
                if (event.target.closest("button")) return;
                activateBetaAnchor(prose, panel, thread.id);
                prose.querySelector(`.beta-anchored-text[data-anchor-id="${CSS.escape(String(thread.id))}"]`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            panel.append(box);
        }
        bindAnchors(prose, panel);
    }

    async function init() {
        if (!id) { $("title").textContent = "No beta copy selected"; return; }
        try {
            [snapshot, feedback] = await Promise.all([api.snapshot(id), api.threads(id)]);
            $("title").textContent = snapshot.title;
            $("state").textContent = snapshot.status === "closed" ? "Archived · Read only" : "Active · Read only";
            const nav = $("chapters");
            for (const [index, chapter] of snapshot.chapters.entries()) {
                const button = el("button", chapter.title);
                button.addEventListener("click", () => void show(index));
                nav.append(button);
            }
            if (snapshot.chapters.length) await show(0);
            else $("chapter-title").textContent = "No chapters in this copy";
        } catch (error) {
            $("title").textContent = "Could not open beta copy";
            $("chapter-title").textContent = error.message;
        }
    }

    void init();
}
