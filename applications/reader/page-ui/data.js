import { supabase } from "/core/authentication/client.js";
import { openReadingState } from "@alysum/library/reading-state.js";
import { createLibraryHub } from "@alysum/library/hub.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";

export async function openReaderData() {
    const session = await resolveStudioSession(supabase);
    const reading = await openReadingState(supabase, {
        local: session.mode === "local",
    });
    const viewerId =
        session.mode === "cloud" ? String(session.user?.id || "").trim() : null;
    const hub = createLibraryHub(supabase, {
        readingState: reading.state,
        viewerId,
    });
    return { supabase, session, reading, hub, viewerId };
}

export function continueCandidates(state, booksById) {
    const positions = state.read("read-position") || {};
    const shelves = state.read("shelves") || {};
    const rows = [];
    for (const [bookId, pos] of Object.entries(positions)) {
        if (!pos || typeof pos !== "object") continue;
        if (["want", "finished", "dnf", "removed"].includes(shelves[bookId])) continue;
        const book = booksById.get(bookId);
        if (!book) continue;
        rows.push({
            book,
            chapterId: String(pos.chapterId || ""),
            progress: Math.max(0, Math.min(100, Number(pos.progress) || 0)),
            updatedAt: pos.updatedAt || pos.at || null,
        });
    }
    rows.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return rows;
}

export function bookMap(items) {
    const map = new Map();
    for (const book of items || []) {
        if (book?.id) map.set(book.id, book);
    }
    return map;
}

export function readHref(bookId, chapterId) {
    const url = `/read?id=${encodeURIComponent(bookId)}`;
    return chapterId ? `${url}&chapter=${encodeURIComponent(chapterId)}` : url;
}

export function bookHref(bookId) {
    return `/book?id=${encodeURIComponent(bookId)}`;
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function coverStyle(book) {
    const url = String(book?.coverUrl || "").trim();
    if (!url || url.startsWith("/applications/library/design/hub-covers/")) {
        return "";
    }
    return ` style="background-image:url('${escapeHtml(url)}')"`;
}
