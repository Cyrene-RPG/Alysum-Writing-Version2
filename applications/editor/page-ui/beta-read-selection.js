/** Text-range anchors for the rendered, sanitized Beta Read chapter. */
export function chapterSelection(prose) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!prose.contains(range.startContainer) || !prose.contains(range.endContainer)) return null;
    // Use the same text-node coordinate system as the highlight renderer.
    // Range.toString() may insert newlines between block elements on mobile.
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    let node, offset = 0, startOffset = null, endOffset = null;
    while ((node = walker.nextNode())) {
        if (node === range.startContainer) startOffset = offset + range.startOffset;
        if (node === range.endContainer) endOffset = offset + range.endOffset;
        offset += node.textContent.length;
    }
    if (startOffset === null || endOffset === null || endOffset <= startOffset) return null;
    const quote = prose.textContent.slice(startOffset, endOffset);
    if (!quote.trim() || quote.length > 2000) return null;
    return { startOffset, endOffset, quote };
}

function validAnchor(chapterText, item) {
    const start = Number(item.startOffset), end = Number(item.endOffset);
    return Number.isInteger(start) && Number.isInteger(end) &&
        start >= 0 && end > start && end <= chapterText.length &&
        chapterText.slice(start, end) === String(item.quote || "");
}

export function markBetaAnchors(prose, anchors) {
    // Never substitute a different occurrence of a quote after posting.
    // A saved anchor is valid only when its exact text matches at its offsets.
    const chapterText = prose.textContent || "";
    const all = (anchors || []).filter(item => validAnchor(chapterText, item)).map(item => ({
        id: String(item.id),
        startOffset: Number(item.startOffset),
        endOffset: Number(item.endOffset),
        kind: item.kind === "suggestion" ? "suggestion" : "comment",
    }));
    if (!all.length) return;
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let offset = 0, node;
    while ((node = walker.nextNode())) {
        nodes.push({ node, start: offset, end: offset + node.textContent.length });
        offset += node.textContent.length;
    }
    for (const entry of nodes.reverse()) {
        const intervals = all.filter(t => t.startOffset < entry.end && t.endOffset > entry.start)
            .map(t => ({
                start: Math.max(0, t.startOffset - entry.start),
                end: Math.min(entry.end - entry.start, t.endOffset - entry.start),
                id: t.id,
                kind: t.kind,
            }))
            .sort((a, b) => (a.end - a.start) - (b.end - b.start));
        if (!intervals.length) continue;
        const text = entry.node.textContent;
        const cuts = [...new Set([0, text.length, ...intervals.flatMap(i => [i.start, i.end])])].sort((a, b) => a - b);
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < cuts.length - 1; i++) {
            const piece = text.slice(cuts[i], cuts[i + 1]);
            const active = intervals.find(x => x.start <= cuts[i] && x.end >= cuts[i + 1]);
            if (active) {
                const mark = document.createElement("mark");
                mark.className = active.kind === "suggestion" ? "beta-anchored-text beta-suggestion-anchor" : "beta-anchored-text";
                mark.dataset.anchorId = active.id;
                mark.dataset.anchorKind = active.kind;
                if (active.kind === "comment") mark.dataset.threadId = active.id;
                else mark.dataset.suggestionId = active.id;
                mark.textContent = piece;
                fragment.append(mark);
            } else fragment.append(document.createTextNode(piece));
        }
        entry.node.replaceWith(fragment);
    }
}

export function activateBetaAnchor(prose, host, id) {
    const target = String(id || "");
    host.querySelectorAll(".is-active").forEach(el => el.classList.remove("is-active"));
    host.querySelectorAll("[aria-selected='true']").forEach(el => el.removeAttribute("aria-selected"));
    prose.querySelectorAll(".beta-anchored-text.is-active").forEach(el => el.classList.remove("is-active"));
    const card = host.querySelector(`[data-anchor-id="${CSS.escape(target)}"]`);
    if (card) {
        card.classList.add("is-active");
        card.setAttribute("aria-selected", "true");
    }
    prose.querySelectorAll(`.beta-anchored-text[data-anchor-id="${CSS.escape(target)}"]`).forEach(mark => {
        mark.classList.add("is-active");
    });
    return card;
}
