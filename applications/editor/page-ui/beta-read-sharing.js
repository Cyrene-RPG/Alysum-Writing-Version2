import { createBetaReadApi } from "./beta-read-api.js";
import { supabase as defaultSupabase } from "@alysum/authentication/client.js";
import { listBetaReadChapters, prepareBetaReadSnapshot } from "./beta-read-snapshot.js";

const LINK_KEY = (id) => `alysum:beta-read:url:${id}`;
const DOCUMENT_PATH = "/beta-read-document";
const MANAGE_PATH = "/beta-reads";

function rememberLink(id, url) {
    try { localStorage.setItem(LINK_KEY(id), url); } catch {}
}

function recalledLink(id) {
    try { return localStorage.getItem(LINK_KEY(id)) || ""; } catch { return ""; }
}

function ensureStyles() {
    if (document.getElementById("alysum-beta-sharing-styles")) return;
    const style = document.createElement("style");
    style.id = "alysum-beta-sharing-styles";
    style.textContent = `
.beta-read-dialog{width:min(640px,calc(100% - 24px));max-height:calc(100dvh - 24px)}
.beta-read-dialog[open]{display:flex;flex-direction:column;overflow:hidden}
.beta-read-dialog .beta-read-body{display:flex;flex-direction:column;gap:18px;flex:1;min-height:0;overflow:y:auto;padding-right:2px}
.beta-read-dialog .beta-intro{margin:0;color:var(--muted,#c8c1d1);line-height:1.6;font-size:.95rem}
.beta-read-dialog .beta-section{display:grid;gap:10px;min-width:0}
.beta-read-dialog .beta-section-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.beta-read-dialog .beta-section-head strong{font-size:.94rem}
.beta-read-dialog .beta-count{color:var(--accent,#cbb0f0);font-size:.84rem}
.beta-read-dialog .beta-chapters{display:grid;gap:5px;padding:8px;border:1px solid var(--border,#51475e);border-radius:14px;background:rgba(255,255,255,.035);max-height:220px;overflow-y:auto;min-width:0}
.beta-read-dialog .beta-chapter{display:flex!important;align-items:center;gap:12px;padding:12px;border:1px solid transparent;border-radius:10px;min-width:0;cursor:pointer;color:inherit}
.beta-read-dialog .beta-chapter:has(input:checked){background:color-mix(in srgb,var(--accent,#b087ec) 17%,transparent);border-color:color-mix(in srgb,var(--accent,#be9ef2) 48%,transparent)}
.beta-read-dialog .beta-chapter input{flex:0 0 20px;width:20px;height:20px;margin:0;accent-color:var(--accent,#c3a0f3)}
.beta-read-dialog .beta-chapter span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:.94rem;line-height:1.4}
.beta-read-dialog .beta-create{align-self:flex-start;min-height:46px}
.beta-read-dialog .beta-result{display:grid;gap:12px;padding:15px;border:1px solid rgba(157,206,168,.5);background:rgba(105,165,118,.09);border-radius:14px;min-width:0}
.beta-read-dialog .beta-result strong{color:#bde4c4}
.beta-read-dialog .beta-link-row{display:flex;gap:8px;min-width:0}
.beta-read-dialog .beta-link-row input{flex:1;min-width:0;width:0;padding:10px;border:1px solid var(--border,#6b6275);border-radius:9px;background:color-mix(in srgb,var(--bg,#17151d) 85%,transparent);color:inherit;font:inherit;font-size:.85rem}
.beta-read-dialog .beta-note,.beta-read-dialog .beta-status,.beta-read-dialog .beta-empty{margin:0;color:var(--muted,#bdb5c7);font-size:.84rem;line-height:1.5}
.beta-read-dialog .beta-managed{display:grid;gap:0;border:1px solid var(--border,#51475e);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.03)}
.beta-read-dialog .beta-managed-row{display:grid;gap:10px;padding:14px;border-top:1px solid var(--border,#51475e);min-width:0}
.beta-read-dialog .beta-managed-row:first-child{border-top:0}
.beta-read-dialog .beta-managed-row p{margin:0;font-size:.86rem;line-height:1.5;overflow-wrap:anywhere}
.beta-read-dialog .beta-managed-meta{color:var(--muted,#bdb5c7);font-size:.78rem}
.beta-read-dialog .beta-managed-actions{display:flex;flex-wrap:wrap;gap:8px}
.beta-read-dialog .beta-managed-actions .quote-button{min-height:34px;padding:7px 12px;font-size:11px}
@media(max-width:520px){
  .beta-read-dialog .beta-link-row{flex-direction:column}
  .beta-read-dialog .beta-link-row input{width:100%;box-sizing:border-box;min-height:44px}
  .beta-read-dialog .beta-link-row button,.beta-read-dialog .beta-managed-actions .quote-button{width:100%}
}
`;
    document.head.append(style);
}

function el(tag, text) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
}

function bookIdOf(book) {
    return String(book?.id || "").trim();
}

function matchesBook(read, bookId) {
    const source = String(read.sourceBookId || read.source_book_id || "");
    return Boolean(bookId) && source === bookId;
}

/** Dedicated Beta Read dialog — separate from excerpt Share (link/image). */
export function mountBetaReadSharing({
    button,
    getBook,
    getAuthor = () => "",
    api = null,
    betaReadApi = null,
} = {}) {
    if (!button) return { open() {}, close() {} };
    ensureStyles();
    const client = api || betaReadApi || createBetaReadApi(defaultSupabase);

    const dialog = document.createElement("dialog");
    dialog.className = "quote-dialog beta-read-dialog";
    dialog.setAttribute("aria-labelledby", "beta-read-dialog-title");
    dialog.innerHTML = `
        <div class="quote-dialog-head">
            <div>
                <p class="quote-label">Private feedback copy</p>
                <h2 id="beta-read-dialog-title">Beta Read</h2>
            </div>
            <button type="button" class="quote-close" aria-label="Close Beta Read">×</button>
        </div>
        <div class="beta-read-body">
            <p class="beta-intro">Share selected chapters as a private reading copy. Guests can comment and suggest edits. Your manuscript stays unchanged.</p>
            <section class="beta-section" aria-label="Existing beta reads">
                <div class="beta-section-head"><strong>This book’s beta reads</strong><a class="quote-button" href="${MANAGE_PATH}" target="_blank" rel="noopener noreferrer">Open Studio</a></div>
                <div class="beta-managed" data-beta-list role="status">Loading…</div>
            </section>
            <section class="beta-section" aria-label="Create a beta read">
                <div class="beta-section-head"><strong>Create new</strong><span class="beta-count" data-beta-count>None selected</span></div>
                <div class="beta-chapters" data-beta-chapters role="group" aria-label="Chapters to share"></div>
                <button type="button" class="quote-button quote-primary beta-create" data-beta-create>Create beta read</button>
                <div class="beta-result" data-beta-result hidden>
                    <strong>Your private reading link is ready</strong>
                    <div class="beta-link-row">
                        <input readonly aria-label="Beta Read link" data-beta-url>
                        <button type="button" class="quote-button" data-beta-copy>Copy link</button>
                    </div>
                    <p class="beta-note">Anyone with the link can read the selected chapters after accepting the copyright notice. Closing the link later stops new access; feedback already left is kept until you delete the copy.</p>
                </div>
            </section>
            <p class="beta-status" data-beta-status role="status"></p>
        </div>
    `;
    document.body.append(dialog);

    const listHost = dialog.querySelector("[data-beta-list]");
    const chaptersHost = dialog.querySelector("[data-beta-chapters]");
    const countEl = dialog.querySelector("[data-beta-count]");
    const createBtn = dialog.querySelector("[data-beta-create]");
    const result = dialog.querySelector("[data-beta-result]");
    const urlInput = dialog.querySelector("[data-beta-url]");
    const copyBtn = dialog.querySelector("[data-beta-copy]");
    const status = dialog.querySelector("[data-beta-status]");

    function setStatus(message) {
        status.textContent = message || "";
    }

    function selectedIds() {
        return [...chaptersHost.querySelectorAll("input:checked")].map((input) => input.value);
    }

    function refreshCreateState() {
        const selected = selectedIds().length;
        countEl.textContent = selected ? `${selected} selected` : "None selected";
        createBtn.disabled = !client || !selected;
        if (!client) setStatus("Beta Read storage is not configured.");
    }

    function paintChapters() {
        chaptersHost.replaceChildren();
        for (const chapter of listBetaReadChapters(getBook())) {
            const label = el("label");
            label.className = "beta-chapter";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.value = chapter.id;
            check.addEventListener("change", refreshCreateState);
            const name = el("span", chapter.title);
            label.append(check, name);
            chaptersHost.append(label);
        }
        if (!chaptersHost.childElementCount) {
            chaptersHost.append(el("p", "Save a chapter with text before creating a beta read."));
            chaptersHost.querySelector("p").className = "beta-empty";
        }
        refreshCreateState();
    }

    function paintList(reads) {
        listHost.replaceChildren();
        const bookId = bookIdOf(getBook());
        const mine = (reads || []).filter((read) => matchesBook(read, bookId));
        if (!mine.length) {
            const empty = el("p", "No beta reads for this book yet. Choose chapters below to create one.");
            empty.className = "beta-empty";
            empty.style.padding = "14px";
            listHost.append(empty);
            return;
        }
        for (const read of mine) {
            const row = el("div");
            row.className = "beta-managed-row";
            const title = el("p", read.title || "Untitled book");
            const chapters = Number(read.chapterCount || read.chapter_count || 0);
            const pending = Number(read.pendingFeedbackCount || read.pending_feedback_count || 0);
            const metaBits = [
                read.status === "closed" ? "Closed" : "Active",
                chapters ? `${chapters} chapter${chapters === 1 ? "" : "s"}` : null,
                pending ? `${pending} pending` : null,
            ].filter(Boolean);
            const meta = el("p", metaBits.join(" · "));
            meta.className = "beta-managed-meta";
            const actions = el("div");
            actions.className = "beta-managed-actions";

            const open = el("a", "Review feedback");
            open.className = "quote-button";
            open.href = `${DOCUMENT_PATH}?id=${encodeURIComponent(read.id)}`;
            open.target = "_blank";
            open.rel = "noopener noreferrer";
            actions.append(open);

            const savedUrl = recalledLink(read.id);
            if (savedUrl && read.status === "active") {
                const copy = el("button", "Copy link");
                copy.type = "button";
                copy.className = "quote-button";
                copy.addEventListener("click", async () => {
                    try {
                        await navigator.clipboard.writeText(savedUrl);
                        setStatus("Link copied.");
                    } catch {
                        urlInput.value = savedUrl;
                        result.hidden = false;
                        urlInput.focus();
                        urlInput.select();
                        setStatus("Select and copy the link.");
                    }
                });
                actions.append(copy);
            }

            if (read.status === "active") {
                const close = el("button", "Close link");
                close.type = "button";
                close.className = "quote-button";
                close.addEventListener("click", async () => {
                    if (!confirm("Close this beta read link? Feedback already left will be preserved.")) return;
                    close.disabled = true;
                    try {
                        await client.close(read.id);
                        setStatus("Beta read closed.");
                        await loadList();
                    } catch (error) {
                        close.disabled = false;
                        setStatus(error?.message || "Could not close beta read.");
                    }
                });
                actions.append(close);
            }

            row.append(title, meta, actions);
            listHost.append(row);
        }
    }

    async function loadList() {
        listHost.textContent = "Loading…";
        if (!client) {
            listHost.replaceChildren();
            const empty = el("p", "Sign in online to manage beta reads.");
            empty.className = "beta-empty";
            empty.style.padding = "14px";
            listHost.append(empty);
            return;
        }
        try {
            const { reads } = await client.list();
            paintList(reads);
        } catch (error) {
            listHost.replaceChildren();
            const message = el("p", error?.message || "Could not load beta reads.");
            message.className = "beta-empty";
            message.style.padding = "14px";
            message.setAttribute("role", "alert");
            listHost.append(message);
        }
    }

    async function open() {
        result.hidden = true;
        setStatus("");
        paintChapters();
        if (!dialog.open) dialog.showModal();
        button.setAttribute("aria-expanded", "true");
        await loadList();
    }

    function close() {
        if (dialog.open) dialog.close();
    }

    button.addEventListener("click", () => { void open(); });
    dialog.querySelector(".quote-close").addEventListener("click", close);
    dialog.addEventListener("close", () => button.setAttribute("aria-expanded", "false"));

    createBtn.addEventListener("click", async () => {
        createBtn.disabled = true;
        setStatus("Creating beta read…");
        try {
            if (!client) throw new Error("Beta Read storage is not configured.");
            const snapshot = prepareBetaReadSnapshot(getBook(), selectedIds(), getAuthor());
            const saved = await client.create(snapshot);
            if (!saved?.url) throw new Error("No reading link was returned.");
            if (saved.id) rememberLink(saved.id, saved.url);
            urlInput.value = saved.url;
            result.hidden = false;
            setStatus("Beta Read created.");
            await loadList();
            copyBtn.focus();
        } catch (error) {
            setStatus(error?.message || "Could not create beta read.");
        } finally {
            refreshCreateState();
        }
    });

    copyBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(urlInput.value);
            setStatus("Link copied.");
        } catch {
            urlInput.focus();
            urlInput.select();
            setStatus("Select and copy the link.");
        }
    });

    return { open, close };
}
