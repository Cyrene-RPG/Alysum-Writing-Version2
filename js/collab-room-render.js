/**
 * Collab room rendering — paragraph canon + green suggestion overlays.
 */

/** @typedef {{ id: string, by: string, byLabel: string, type: "replace"|"insert"|"delete", oldText: string, newText: string, paragraphIndex: number, status: "pending"|"accepted"|"rejected" }} CollabHunk */

export function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** @param {string} html */
export function htmlToParagraphTexts(html) {
    if (typeof document === "undefined") return [];
    const root = document.createElement("div");
    root.innerHTML = String(html || "");
    const fromTags = [...root.querySelectorAll("p")].map((p) => p.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (fromTags.length) return fromTags;
    const plain = root.textContent.replace(/\s+/g, " ").trim();
    return plain ? [plain] : [];
}

/** @param {string[]} paragraphs */
export function paragraphsToEditableHtml(paragraphs) {
    if (!paragraphs.length) return "<p><br></p>";
    return paragraphs.map((para) => `<p>${escapeHtml(para)}</p>`).join("");
}

/** Read plain-text paragraphs from a contenteditable manuscript root. */
export function readParagraphTextsFromManuscript(root) {
    if (!root) return [];
    return [...root.querySelectorAll("p")]
        .map((p) => p.textContent.replace(/\s+/g, " ").trim())
        .filter((t, i, arr) => t || arr.length === 1);
}

/**
 * Diff paragraph arrays into suggestion payloads for submit_collab_suggestions.
 * @param {string[]} baseParagraphs
 * @param {string[]} nextParagraphs
 */
export function diffParagraphSuggestions(baseParagraphs, nextParagraphs) {
    /** @type {Array<{ paragraph_index: number, change_type: string, old_text: string, new_text: string }>} */
    const out = [];
    const max = Math.max(baseParagraphs.length, nextParagraphs.length);
    for (let i = 0; i < max; i++) {
        const oldText = baseParagraphs[i] ?? "";
        const newText = nextParagraphs[i] ?? "";
        if (oldText === newText) continue;
        if (!oldText && newText) {
            out.push({ paragraph_index: Math.max(i - 1, 0), change_type: "insert", old_text: "", new_text: newText });
            continue;
        }
        if (oldText && !newText) {
            out.push({ paragraph_index: i, change_type: "delete", old_text: oldText, new_text: "" });
            continue;
        }
        out.push({ paragraph_index: i, change_type: "replace", old_text: oldText, new_text: newText });
    }
    return out;
}

/**
 * @param {string[]} canon
 * @param {CollabHunk[]} hunks
 */
export function renderAuthorManuscript(canon, hunks) {
    return canon.map((para, idx) => {
        const pending = hunks.filter((h) => h.paragraphIndex === idx && h.status === "pending");
        if (!pending.length) {
            return `<p>${escapeHtml(para)}</p>`;
        }
        let html = escapeHtml(para);
        for (const h of pending) {
            if (h.type === "insert" && h.oldText === "") {
                html += `<span class="collab-suggest-add" data-hunk="${h.id}" data-by="${h.by}"> ${escapeHtml(h.newText)}</span>`;
                continue;
            }
            if (h.oldText && html.includes(escapeHtml(h.oldText))) {
                const marked = `<span class="collab-suggest-del" data-hunk="${h.id}" data-by="${h.by}">${escapeHtml(h.oldText)}</span><span class="collab-suggest-add" data-hunk="${h.id}" data-by="${h.by}">${escapeHtml(h.newText)}</span>`;
                html = html.replace(escapeHtml(h.oldText), marked);
            }
        }
        return `<p>${html}</p>`;
    }).join("");
}

/** @param {string[]} canon */
export function renderCollaboratorManuscript(canon) {
    return paragraphsToEditableHtml(canon);
}

/** Diff chapter HTML into suggestion payloads (paragraph-level). */
export function diffChapterHtmlSuggestions(baseHtml, nextHtml) {
    return diffParagraphSuggestions(htmlToParagraphTexts(baseHtml), htmlToParagraphTexts(nextHtml));
}

export function countPending(hunks) {
    return hunks.filter((h) => h.status === "pending").length;
}

/** @param {object} row */
export function suggestionRowToHunk(row) {
    const handle = row.collaborator_username || row.collaborator_display_name || "collaborator";
    return {
        id: row.id,
        by: row.collaborator_id || handle,
        byLabel: handle.startsWith("@") ? handle : `@${handle}`,
        type: row.change_type || "replace",
        oldText: row.old_text || "",
        newText: row.new_text || "",
        paragraphIndex: row.paragraph_index ?? 0,
        status: row.status || "pending",
    };
}
