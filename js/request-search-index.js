/** Fire-and-forget search-engine indexing after publish. */
export async function requestSearchIndexing({ bookId, authorUsername } = {}) {
    if (!bookId && !authorUsername) return;
    try {
        const res = await fetch("/api/submit-index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookId, authorUsername }),
        });
        if (!res.ok) {
            console.warn("Search indexing request failed:", res.status);
        }
    } catch (err) {
        console.warn("Search indexing request error (non-blocking):", err);
    }
}

/** Submit every published story + author page (admin / one-time catch-up). */
export async function requestSearchIndexingAll() {
    try {
        const res = await fetch("/api/submit-index?all=1", { method: "POST" });
        return res.ok;
    } catch (err) {
        console.warn("Bulk search indexing failed:", err);
        return false;
    }
}
