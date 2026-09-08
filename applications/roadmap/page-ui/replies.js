import { supabase } from "@alysum/authentication/client.js";
import { fetchReplies, postReply } from "@alysum/roadmap/replies.js";
import { relativeLabel, authorLabel } from "/applications/roadmap/catalog.js";
import { loginHref, state } from "./state.js";
import { makeAnonCheck } from "./anon-check.js";
import { playUiSound } from "./ui-sounds.js?v=13";

export function replyLabel(count) {
    const n = Number(count) || 0;
    return n === 1 ? "1 reply" : `${n} replies`;
}

export function setReplyTrigger(el, count) {
    if (!el) return;
    const n = Number(count) || 0;
    const text = replyLabel(n);
    el.dataset.count = String(n);
    el.dataset.label = text;
    el.textContent = text;
}

function paintReply(row) {
    const line = document.createElement("div");
    line.className = "entry-meta";
    const author = document.createElement("span");
    author.className = "author";
    author.textContent = authorLabel(row.authorUsername);
    const body = document.createElement("span");
    body.textContent = row.body || "";
    const when = document.createElement("span");
    when.textContent = relativeLabel(row.createdAt);
    line.append(author, body, when);
    return line;
}

async function fillThread(thread, { kind, stub }) {
    thread.replaceChildren();
    const rows = await fetchReplies(supabase, stub);
    rows.forEach((row) => thread.appendChild(paintReply(row)));
    if (!state.user) {
        const hint = document.createElement("div");
        hint.className = "field-hint";
        const a = document.createElement("a");
        a.href = loginHref(kind === "bug" ? "bugs" : "suggestions");
        a.textContent = "Authenticate to reply";
        a.style.color = "var(--green-bright)";
        hint.appendChild(a);
        thread.appendChild(hint);
        return;
    }
    const field = document.createElement("div");
    field.className = "field";
    const area = document.createElement("textarea");
    area.placeholder = "Add a reply";
    const actions = document.createElement("div");
    actions.className = "reply-actions";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "submit-btn";
    submit.textContent = "submit_reply";
    const anon = makeAnonCheck();
    submit.addEventListener("click", async () => {
        try {
            await postReply(supabase, {
                stub,
                userId: state.user.userId,
                username: anon.input.checked ? "anonymous" : state.user.username,
                body: area.value,
            });
            playUiSound("commentsSucceed");
            area.value = "";
            anon.input.checked = false;
            const entry = thread.closest(".entry");
            const label = entry?.querySelector(".reply-count");
            const next = (Number(label?.dataset.count || 0) + 1);
            setReplyTrigger(label, next);
            await fillThread(thread, { kind, stub });
        } catch (err) {
            playUiSound("commentsFail");
            const error = document.createElement("div");
            error.className = "field-error show";
            error.textContent = err.message || "Could not reply.";
            thread.appendChild(error);
        }
    });
    actions.append(submit, anon.label);
    field.append(area);
    thread.append(field, actions);
}

export function bindReplyThread(entry, row) {
    const thread = document.createElement("div");
    thread.className = "reply-thread";
    entry.appendChild(thread);
    const trigger = entry.querySelector(".reply-count");
    trigger?.addEventListener("click", async () => {
        const open = entry.classList.contains("is-open");
        entry.closest(".ledger")?.querySelectorAll(".entry.is-open").forEach((el) => {
            if (el !== entry) el.classList.remove("is-open");
        });
        entry.classList.toggle("is-open", !open);
        if (!open) {
            playUiSound("commentsOpen");
            await fillThread(thread, { kind: row.kind, stub: row.stub });
        }
    });
}
