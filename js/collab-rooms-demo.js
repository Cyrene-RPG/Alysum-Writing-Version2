/**
 * Collab rooms — test branch demo data & helpers.
 * Preview without Supabase: open collab-room.html?preview=1
 */

/** @typedef {{ id: string, by: string, byLabel: string, type: "replace"|"insert"|"delete", oldText: string, newText: string, paragraphIndex: number, status: "pending"|"accepted"|"rejected" }} CollabHunk */

export const DEMO_ROOM = {
    id: "demo-room-1",
    bookTitle: "The Glass Orchard",
    chapterId: "ch-12",
    chapterTitle: "Chapter 12 — The North Gate",
    chapterMeta: "3,842 words · invite-only collab",
    authorName: "You (author)",
};

/** Canonical paragraph texts (index → string). */
export const DEMO_CANON = [
    "Mira reached the north gate before dawn, when the city still belonged to crows and cart wheels.",
    "The guard on duty did not look up from his ledger. She counted three breaths, then knocked twice — the old signal her mother had taught her.",
    "\"State your business,\" he said, without turning the page.",
    "\"Courier,\" Mira replied. \"Letters for the archivist. Urgent, but not for your eyes.\"",
    "He sighed, as if the night had personally offended him, and slid the viewing slot open.",
];

/** Pre-loaded suggestion hunks for the author review demo. */
export const DEMO_HUNKS = /** @type {CollabHunk[]} */ ([
    {
        id: "h1",
        by: "alex",
        byLabel: "@alex",
        type: "replace",
        oldText: "when the city still belonged to crows and cart wheels.",
        newText: "while the city still belonged to crows, cart wheels, and the last stars.",
        paragraphIndex: 0,
        status: "pending",
    },
    {
        id: "h2",
        by: "alex",
        byLabel: "@alex",
        type: "replace",
        oldText: "She counted three breaths, then knocked twice",
        newText: "She counted three breaths — one for luck — then knocked twice",
        paragraphIndex: 1,
        status: "pending",
    },
    {
        id: "h3",
        by: "sam",
        byLabel: "@sam",
        type: "replace",
        oldText: "\"State your business,\" he said, without turning the page.",
        newText: "\"State your business,\" he said, still not looking up from the ledger.",
        paragraphIndex: 2,
        status: "pending",
    },
    {
        id: "h4",
        by: "sam",
        byLabel: "@sam",
        type: "insert",
        oldText: "",
        newText: "Mira adjusted the strap on her satchel. The letters inside felt heavier than paper should.",
        paragraphIndex: 3,
        status: "pending",
    },
]);

/**
 * Build HTML for author view — canon with green suggestion overlays.
 * @param {CollabHunk[]} hunks
 */
export function renderAuthorManuscript(hunks) {
    return DEMO_CANON.map((para, idx) => {
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

/**
 * Build HTML for collaborator view — editable canon without other people's pending marks.
 * @param {string} collaboratorId
 */
export function renderCollaboratorManuscript(collaboratorId) {
    return DEMO_CANON.map((para) => `<p>${escapeHtml(para)}</p>`).join("");
}

/**
 * Apply accepted hunk to canon (demo only, mutates in-memory copy).
 * @param {string[]} canon
 * @param {CollabHunk} hunk
 */
export function applyHunkToCanon(canon, hunk) {
    const idx = hunk.paragraphIndex;
    if (idx < 0 || idx >= canon.length) return canon;

    if (hunk.type === "insert" && !hunk.oldText) {
        const next = [...canon];
        next.splice(idx + 1, 0, hunk.newText);
        return next;
    }

    const next = [...canon];
    if (hunk.oldText && next[idx].includes(hunk.oldText)) {
        next[idx] = next[idx].replace(hunk.oldText, hunk.newText);
    }
    return next;
}

export function collabRoomPreviewUrl(role = "author") {
    const url = new URL("collab-room.html", window.location.href);
    url.searchParams.set("preview", "1");
    url.searchParams.set("role", role);
    return url.pathname + url.search;
}

export function collabRoomInviteUrl(token = "demo-invite-token") {
    const url = new URL("collab-room.html", window.location.href);
    url.searchParams.set("preview", "1");
    url.searchParams.set("invite", token);
    return url.pathname + url.search;
}

export function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function countPending(hunks) {
    return hunks.filter((h) => h.status === "pending").length;
}
