/** Text-range anchors for the rendered, sanitized Beta Read chapter. */
export function chapterSelection(prose) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!prose.contains(range.startContainer) || !prose.contains(range.endContainer)) return null;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(prose);
    prefix.setEnd(range.startContainer, range.startOffset);
    const startOffset = prefix.toString().length;
    const quote = range.toString();
    if (!quote.trim() || quote.length > 2000) return null;
    return { startOffset, endOffset: startOffset + quote.length, quote };
}
export function markBetaAnchors(prose, threads) {
    const all = (threads || []).filter(t => Number.isInteger(t.startOffset) && Number.isInteger(t.endOffset) && t.endOffset > t.startOffset);
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
            .map(t => ({ start: Math.max(0, t.startOffset - entry.start), end: Math.min(entry.end - entry.start, t.endOffset - entry.start), id: t.id }));
        if (!intervals.length) continue;
        const text = entry.node.textContent;
        const cuts = [...new Set([0, text.length, ...intervals.flatMap(i => [i.start, i.end])])].sort((a,b) => a-b);
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < cuts.length - 1; i++) {
            const piece = text.slice(cuts[i], cuts[i+1]);
            const active = intervals.find(x => x.start <= cuts[i] && x.end >= cuts[i+1]);
            if (active) {
                const mark = document.createElement("mark");
                mark.className = "beta-anchored-text";
                mark.dataset.threadId = active.id;
                mark.textContent = piece;
                fragment.append(mark);
            } else fragment.append(document.createTextNode(piece));
        }
        entry.node.replaceWith(fragment);
    }
}
