const FIND_MARK = "alysum-find-hit";

function skipNode(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest(".scene-break, .scene-spacer, hr.scene-rule"));
}

export function unwrapFindMarks(root) {
    if (!root) return;
    root.querySelectorAll(`mark.${FIND_MARK}`).forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
    });
}

function previewFor(text, start, end) {
    const pad = 32;
    const from = Math.max(0, start - pad);
    const to = Math.min(text.length, end + pad);
    const before = (from > 0 ? "…" : "") + text.slice(from, start);
    const match = text.slice(start, end);
    const after = text.slice(end, to) + (to < text.length ? "…" : "");
    return { before, match, after };
}

function pageKind(item) {
    const kind = String(item?.kind || item?.type || "").trim().toLowerCase();
    if (kind === "note") return "note";
    if (kind === "folder" || (!kind && Array.isArray(item?.children))) return "folder";
    return "chapter";
}

export function listSearchPages(sections) {
    const pages = [];
    function walk(list) {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            const kind = pageKind(item);
            if (kind === "folder") {
                walk(item.children);
                continue;
            }
            if (kind === "chapter" || kind === "note") {
                pages.push({
                    id: String(item.id || ""),
                    title: String(item.title || "").trim() || (kind === "note" ? "Untitled note" : "Untitled"),
                    content: typeof item.content === "string" ? item.content : "",
                    kind
                });
                if (Array.isArray(item.notes)) walk(item.notes);
            }
        }
    }
    const src = sections && typeof sections === "object" ? sections : {};
    walk(src.front);
    walk(src.body);
    walk(src.back);
    return pages.filter((page) => page.id);
}

function collectBookMatches(pages, query) {
    const q = String(query || "");
    if (!q) return [];
    const tmp = document.createElement("div");
    const out = [];
    let index = 0;
    for (const page of pages) {
        tmp.innerHTML = String(page.content || "");
        collectMatches(tmp, q).forEach((hit, occurrenceInChapter) => {
            const text = hit.node?.nodeValue || "";
            out.push({
                index: index++,
                chapterId: page.id,
                chapterTitle: page.title,
                occurrenceInChapter,
                ...previewFor(text, hit.start, hit.end)
            });
        });
        tmp.innerHTML = "";
    }
    return out;
}

function collectMatches(pageEl, query) {
    const q = String(query || "");
    if (!q || !pageEl) return [];
    const needle = q.toLowerCase();
    const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || skipNode(node)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const hits = [];
    let node = walker.nextNode();
    while (node) {
        const text = node.nodeValue;
        const lower = text.toLowerCase();
        let from = 0;
        while (from <= lower.length - needle.length) {
            const at = lower.indexOf(needle, from);
            if (at < 0) break;
            hits.push({ node, start: at, end: at + needle.length, index: hits.length });
            from = at + Math.max(1, needle.length);
        }
        node = walker.nextNode();
    }
    return hits;
}

function wrapHit(hit) {
    if (!hit.node || hit.node.nodeType !== Node.TEXT_NODE) return null;
    if (hit.end > hit.node.nodeValue.length) return null;
    const range = document.createRange();
    range.setStart(hit.node, hit.start);
    range.setEnd(hit.node, hit.end);
    const mark = document.createElement("mark");
    mark.className = FIND_MARK;
    mark.dataset.findIndex = String(hit.index);
    try {
        range.surroundContents(mark);
        return mark;
    } catch {
        const span = range.extractContents();
        mark.appendChild(span);
        range.insertNode(mark);
        return mark;
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function mountFind({ pageEl, host, editor, getPages, getCurrentId, goToPage }) {
    if (!pageEl || !host) return null;

    let panel = host.querySelector(".writer-find");
    if (!panel) {
        panel = document.createElement("div");
        panel.className = "writer-find";
        panel.hidden = true;
        panel.innerHTML = `
            <div class="writer-find-bar">
                <input type="search" class="writer-find-input" placeholder="Find in book" aria-label="Find in book" />
                <span class="writer-find-count" aria-live="polite">0</span>
                <button type="button" class="writer-find-btn" data-find-prev title="Previous match" aria-label="Previous match">↑</button>
                <button type="button" class="writer-find-btn" data-find-next title="Next match" aria-label="Next match">↓</button>
                <button type="button" class="writer-find-btn" data-find-close title="Close" aria-label="Close find">×</button>
            </div>
            <ul class="writer-find-results" hidden></ul>
        `;
        host.appendChild(panel);
    }

    const input = panel.querySelector(".writer-find-input");
    const countEl = panel.querySelector(".writer-find-count");
    const resultsEl = panel.querySelector(".writer-find-results");
    let hits = [];
    let current = -1;
    let searchTimer = 0;
    let jumping = false;

    function paintResults() {
        resultsEl.innerHTML = "";
        if (!hits.length) {
            resultsEl.hidden = !input.value;
            if (input.value) {
                const empty = document.createElement("li");
                empty.className = "writer-find-empty";
                empty.textContent = "No matches";
                resultsEl.appendChild(empty);
            }
            return;
        }
        resultsEl.hidden = false;
        let lastChapter = "";
        hits.forEach((hit) => {
            if (hit.chapterId !== lastChapter) {
                lastChapter = hit.chapterId;
                const head = document.createElement("li");
                head.className = "writer-find-chapter";
                head.textContent = hit.chapterTitle;
                resultsEl.appendChild(head);
            }
            const li = document.createElement("li");
            li.className = "writer-find-hit";
            li.dataset.findJump = String(hit.index);
            li.innerHTML = `<span class="writer-find-preview">${escapeHtml(hit.before)}<strong>${escapeHtml(hit.match)}</strong>${escapeHtml(hit.after)}</span>`;
            resultsEl.appendChild(li);
        });
    }

    function paintCurrentRow() {
        resultsEl.querySelectorAll(".is-current").forEach((el) => el.classList.remove("is-current"));
        if (current < 0) return;
        const row = resultsEl.querySelector(`[data-find-jump="${current}"]`);
        if (!row) return;
        row.classList.add("is-current");
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < resultsEl.scrollTop) resultsEl.scrollTop = top;
        else if (bottom > resultsEl.scrollTop + resultsEl.clientHeight) {
            resultsEl.scrollTop = bottom - resultsEl.clientHeight;
        }
    }

    function wrapCurrentChapter() {
        unwrapFindMarks(pageEl);
        if (pageEl.hidden || !hits.length || current < 0) return;
        const hit = hits[current];
        if (!hit || String(getCurrentId?.() || "") !== String(hit.chapterId)) return;
        collectMatches(pageEl, input.value).slice().reverse().forEach((local) => wrapHit(local));
        const mark = pageEl.querySelector(`mark.${FIND_MARK}[data-find-index="${hit.occurrenceInChapter}"]`);
        if (!mark) return;
        mark.classList.add("is-current");
        mark.scrollIntoView({ block: "center", inline: "nearest" });
        const range = document.createRange();
        range.selectNodeContents(mark);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }

    async function setCurrent(index, { go = false } = {}) {
        if (!hits.length) {
            current = -1;
            unwrapFindMarks(pageEl);
            paintCurrentRow();
            return;
        }
        current = ((index % hits.length) + hits.length) % hits.length;
        paintCurrentRow();
        if (!go) return;
        const hit = hits[current];
        if (hit && String(getCurrentId?.() || "") !== String(hit.chapterId) && typeof goToPage === "function") {
            jumping = true;
            try {
                await goToPage(hit.chapterId);
            } finally {
                jumping = false;
            }
        }
        wrapCurrentChapter();
    }

    function runSearch() {
        unwrapFindMarks(pageEl);
        hits = collectBookMatches(typeof getPages === "function" ? getPages() : [], input.value);
        countEl.textContent = hits.length ? String(hits.length) : "0";
        paintResults();
        if (!hits.length) {
            current = -1;
            return;
        }
        const here = String(getCurrentId?.() || "");
        const local = hits.findIndex((hit) => String(hit.chapterId) === here);
        current = local >= 0 ? local : 0;
        paintCurrentRow();
    }

    function close() {
        panel.hidden = true;
        unwrapFindMarks(pageEl);
        hits = [];
        current = -1;
        countEl.textContent = "0";
        resultsEl.innerHTML = "";
        resultsEl.hidden = true;
    }

    function open(seed) {
        panel.hidden = false;
        if (seed != null && seed !== "") input.value = seed;
        else {
            const sel = window.getSelection();
            const picked = sel && !sel.isCollapsed && pageEl.contains(sel.anchorNode)
                ? String(sel).trim()
                : "";
            if (picked) input.value = picked.slice(0, 180);
        }
        input.focus({ preventScroll: true });
        input.select();
        runSearch();
    }

    input.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 80);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            if (!hits.length) return;
            void setCurrent(current + (event.shiftKey ? -1 : 1));
        }
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            editor?.focus?.();
        }
    });

    panel.addEventListener("click", (event) => {
        if (event.target.closest("[data-find-close]")) {
            close();
            editor?.focus?.();
            return;
        }
        if (event.target.closest("[data-find-next]")) {
            if (hits.length) void setCurrent(current + 1);
            return;
        }
        if (event.target.closest("[data-find-prev]")) {
            if (hits.length) void setCurrent(current - 1);
            return;
        }
        const row = event.target.closest("[data-find-jump]");
        if (row) void setCurrent(Number(row.dataset.findJump), { go: true });
    });

    window.addEventListener("keydown", (event) => {
        const key = String(event.key || "").toLowerCase();
        if ((event.metaKey || event.ctrlKey) && key === "f" && !event.altKey) {
            event.preventDefault();
            if (panel.hidden) open();
            else input.focus({ preventScroll: true });
        }
    });

    return {
        open,
        close,
        toggle() {
            if (panel.hidden) open();
            else close();
        },
        isOpen() {
            return !panel.hidden;
        },
        isJumping() {
            return jumping;
        },
        reveal() {
            wrapCurrentChapter();
        }
    };
}
