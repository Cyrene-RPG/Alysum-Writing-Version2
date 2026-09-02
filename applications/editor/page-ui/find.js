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
            const snippet = previewFor(hit.text, hit.start, hit.end);
            out.push({
                index: index++,
                chapterId: page.id,
                chapterTitle: page.title,
                occurrenceInChapter,
                before: snippet.before.replace(/\s+/g, " "),
                match: snippet.match,
                after: snippet.after.replace(/\s+/g, " ")
            });
        });
        tmp.innerHTML = "";
    }
    return out;
}

const BLOCK_SELECTOR =
    "p,div,li,blockquote,pre,h1,h2,h3,h4,h5,h6,figure,figcaption,td,th,section,article";

function blockAncestor(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el ? el.closest(BLOCK_SELECTOR) : null;
}

function segmentForOffset(segments, offset) {
    for (const seg of segments) {
        if (offset >= seg.at && offset < seg.at + seg.length) return seg;
    }
    return null;
}

// Scan the concatenated text of `root` so the match list is independent of how
// text is split across nodes (inline tags, review spans, contentEditable churn).
// A "\n" separates text that lives in different block-level elements, so a query
// can span an <em> boundary but not a paragraph break.
function collectMatches(root, query) {
    const q = String(query || "");
    if (!q || !root) return [];
    const needle = q.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || skipNode(node)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const segments = [];
    let full = "";
    let prevBlock = null;
    let first = true;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const block = blockAncestor(node);
        if (!first && block !== prevBlock) full += "\n";
        first = false;
        prevBlock = block;
        segments.push({ node, at: full.length, length: node.nodeValue.length });
        full += node.nodeValue;
    }
    const lower = full.toLowerCase();
    const hits = [];
    let from = 0;
    while (from <= lower.length - needle.length) {
        const at = lower.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        const startSeg = segmentForOffset(segments, at);
        const endSeg = segmentForOffset(segments, end - 1);
        if (startSeg && endSeg) {
            hits.push({
                startNode: startSeg.node,
                startOffset: at - startSeg.at,
                endNode: endSeg.node,
                endOffset: end - endSeg.at,
                index: hits.length,
                text: full,
                start: at,
                end
            });
        }
        from = at + Math.max(1, needle.length);
    }
    return hits;
}

function wrapHit(pos) {
    if (!pos || !pos.startNode || !pos.endNode) return null;
    const range = document.createRange();
    try {
        range.setStart(pos.startNode, pos.startOffset);
        range.setEnd(pos.endNode, pos.endOffset);
    } catch {
        return null;
    }
    const mark = document.createElement("mark");
    mark.className = FIND_MARK;
    mark.dataset.findIndex = String(pos.index);
    try {
        range.surroundContents(mark);
        return mark;
    } catch {
        try {
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
            return mark;
        } catch {
            return null;
        }
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
    let refreshTimer = 0;
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

    // Re-run the search after a manuscript edit while the panel stays open.
    // Deliberately does not touch <mark>s in the page — re-wrapping mid-typing
    // would fight the caret; stale marks are cleared on the next jump/close.
    function runRefresh() {
        if (panel.hidden) return;
        const prev = current >= 0 && current < hits.length ? hits[current] : null;
        hits = collectBookMatches(typeof getPages === "function" ? getPages() : [], input.value);
        countEl.textContent = hits.length ? String(hits.length) : "0";
        paintResults();
        if (!hits.length) {
            current = -1;
            return;
        }
        let next = -1;
        if (prev) {
            next = hits.findIndex((hit) =>
                String(hit.chapterId) === String(prev.chapterId)
                && hit.occurrenceInChapter === prev.occurrenceInChapter);
            if (next < 0) {
                next = hits.findIndex((hit) => String(hit.chapterId) === String(prev.chapterId));
            }
        }
        if (next < 0) {
            const here = String(getCurrentId?.() || "");
            next = hits.findIndex((hit) => String(hit.chapterId) === here);
        }
        current = next >= 0 ? next : 0;
        paintCurrentRow();
    }

    function refresh() {
        if (panel.hidden) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(runRefresh, 150);
    }

    function close() {
        panel.hidden = true;
        clearTimeout(refreshTimer);
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
        refresh,
        toggle() {
            if (panel.hidden) open();
            else close();
        },
        isOpen() {
            return !panel.hidden;
        }
    };
}
