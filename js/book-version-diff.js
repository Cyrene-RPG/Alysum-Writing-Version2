/**
 * Manuscript compare helpers for book version history.
 */

const SECTION_KEYS = ["front", "body", "back"];

/**
 * @param {object} sections
 */
export function flattenChapters(sections) {
    /** @type {Array<{ section: string, index: number, id: string, title: string, content: string, imageUrls: string[] }>} */
    const out = [];
    for (const section of SECTION_KEYS) {
        (sections?.[section] || []).forEach((ch, index) => {
            if (!ch || typeof ch !== "object") return;
            out.push({
                section,
                index,
                id: String(ch.id || ""),
                title: String(ch.title || "Untitled"),
                content: String(ch.content || ""),
                imageUrls: Array.isArray(ch.imageUrls)
                    ? ch.imageUrls
                    : Array.isArray(ch.image_urls)
                      ? ch.image_urls
                      : ch.imageUrl || ch.image_url
                        ? [String(ch.imageUrl || ch.image_url)]
                        : [],
            });
        });
    }
    return out;
}

function chapterPlacementMap(chapters) {
    /** @type {Map<string, { section: string, index: number }>} */
    const map = new Map();
    for (const ch of chapters) {
        map.set(ch.id, { section: ch.section, index: ch.index });
    }
    return map;
}

function contentEqual(a, b) {
    if (a.title !== b.title) return false;
    if (a.content !== b.content) return false;
    return (a.imageUrls || []).join("\n") === (b.imageUrls || []).join("\n");
}

/**
 * @param {object} leftSections
 * @param {object} rightSections
 */
export function summarizeChapterChanges(leftSections, rightSections) {
    const left = flattenChapters(leftSections);
    const right = flattenChapters(rightSections);
    const leftById = new Map(left.map(ch => [ch.id, ch]));
    const rightById = new Map(right.map(ch => [ch.id, ch]));
    const leftPlace = chapterPlacementMap(left);
    const rightPlace = chapterPlacementMap(right);
    /** @type {Array<{ id: string, title: string, section: string, status: string, moveDetail?: string, left?: object, right?: object }>} */
    const rows = [];

    for (const ch of left) {
        const other = rightById.get(ch.id);
        if (!other) {
            rows.push({ id: ch.id, title: ch.title, section: ch.section, status: "removed", left: ch });
            continue;
        }
        const lp = leftPlace.get(ch.id);
        const rp = rightPlace.get(ch.id);
        const moved =
            lp &&
            rp &&
            (lp.section !== rp.section || lp.index !== rp.index) &&
            contentEqual(ch, other);

        if (moved) {
            rows.push({
                id: ch.id,
                title: ch.title,
                section: ch.section,
                status: "moved",
                moveDetail: `${lp.section} #${lp.index + 1} → ${rp.section} #${rp.index + 1}`,
                left: ch,
                right: other,
            });
        } else {
            const status = contentEqual(ch, other) ? "unchanged" : "modified";
            rows.push({ id: ch.id, title: ch.title, section: ch.section, status, left: ch, right: other });
        }
    }

    for (const ch of right) {
        if (!leftById.has(ch.id)) {
            rows.push({ id: ch.id, title: ch.title, section: ch.section, status: "added", right: ch });
        }
    }

    return rows;
}

/**
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{ type: 'same'|'add'|'remove', text: string }>}
 */
export function diffLines(oldText, newText) {
    const a = String(oldText || "").split("\n");
    const b = String(newText || "").split("\n");
    const n = a.length;
    const m = b.length;
    const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    /** @type {Array<{ type: 'same'|'add'|'remove', text: string }>} */
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            out.push({ type: "same", text: a[i] });
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            out.push({ type: "remove", text: a[i] });
            i++;
        } else {
            out.push({ type: "add", text: b[j] });
            j++;
        }
    }
    while (i < n) out.push({ type: "remove", text: a[i++] });
    while (j < m) out.push({ type: "add", text: b[j++] });
    return out;
}

/**
 * @param {string} html
 * @param {(html: string) => string} stripHtml
 */
export function htmlToDiffPlain(html, stripHtml) {
    const text = stripHtml(String(html || ""));
    return text.replace(/([.!?])\s+/g, "$1\n").replace(/\n+/g, "\n").trim();
}

/**
 * @param {object} leftChapter
 * @param {object} rightChapter
 * @param {object} opts
 */
export function compareChapters(leftChapter, rightChapter, { stripHtml, comic = false }) {
    if (comic) {
        const leftUrls = leftChapter?.imageUrls || [];
        const rightUrls = rightChapter?.imageUrls || [];
        const leftSet = new Set(leftUrls);
        const rightSet = new Set(rightUrls);
        return {
            kind: "comic",
            titleChanged: (leftChapter?.title || "") !== (rightChapter?.title || ""),
            leftTitle: leftChapter?.title || "",
            rightTitle: rightChapter?.title || "",
            addedUrls: rightUrls.filter(u => !leftSet.has(u)),
            removedUrls: leftUrls.filter(u => !rightSet.has(u)),
            leftCount: leftUrls.length,
            rightCount: rightUrls.length,
            captionDiff: diffLines(String(leftChapter?.content || ""), String(rightChapter?.content || "")),
        };
    }

    const leftPlain = htmlToDiffPlain(leftChapter?.content || "", stripHtml);
    const rightPlain = htmlToDiffPlain(rightChapter?.content || "", stripHtml);
    return {
        kind: "prose",
        titleChanged: (leftChapter?.title || "") !== (rightChapter?.title || ""),
        leftTitle: leftChapter?.title || "",
        rightTitle: rightChapter?.title || "",
        leftPlain,
        rightPlain,
        lines: diffLines(leftPlain, rightPlain),
    };
}

/**
 * @param {Array<{ type: string, text: string }>} lines
 */
export function countDiffStats(lines) {
    let added = 0;
    let removed = 0;
    for (const line of lines || []) {
        if (line.type === "add") added++;
        else if (line.type === "remove") removed++;
    }
    return { added, removed };
}

export function statusLabel(status) {
    switch (status) {
        case "added":
            return "Added";
        case "removed":
            return "Removed";
        case "modified":
            return "Changed";
        case "moved":
            return "Moved";
        case "unchanged":
            return "Same";
        default:
            return status;
    }
}

export function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * @param {Array<{ type: string, text: string }>} lines
 * @param {(s: string) => string} esc
 */
export function renderUnifiedDiffHtml(lines, esc = escapeHtml) {
    return (lines || [])
        .map(line => {
            if (line.type === "same") return `<div class="bv-diff-line same">${esc(line.text || " ")}</div>`;
            if (line.type === "add") return `<div class="bv-diff-line add">+ ${esc(line.text || " ")}</div>`;
            return `<div class="bv-diff-line remove">− ${esc(line.text || " ")}</div>`;
        })
        .join("");
}

/**
 * @param {Array<{ type: string, text: string }>} lines
 * @param {(s: string) => string} esc
 */
export function renderSideBySideDiffHtml(lines, esc = escapeHtml) {
    const left = [];
    const right = [];
    for (const line of lines || []) {
        if (line.type === "same") {
            left.push(`<div class="bv-diff-line same">${esc(line.text || " ")}</div>`);
            right.push(`<div class="bv-diff-line same">${esc(line.text || " ")}</div>`);
        } else if (line.type === "remove") {
            left.push(`<div class="bv-diff-line remove">${esc(line.text || " ")}</div>`);
            right.push(`<div class="bv-diff-line empty"></div>`);
        } else {
            left.push(`<div class="bv-diff-line empty"></div>`);
            right.push(`<div class="bv-diff-line add">${esc(line.text || " ")}</div>`);
        }
    }
    return `<div class="bv-diff-split"><div class="bv-diff-col">${left.join("")}</div><div class="bv-diff-col">${right.join("")}</div></div>`;
}
