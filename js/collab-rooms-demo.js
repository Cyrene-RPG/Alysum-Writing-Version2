/**
 * Collab rooms — demo data for ?preview=1 only.
 */

export const DEMO_ROOM = {
    id: "demo-room-1",
    bookTitle: "The Glass Orchard",
    chapterId: "ch-12",
    chapterTitle: "Chapter 12 — The North Gate",
    chapterMeta: "3,842 words · invite-only collab",
    authorName: "You (author)",
};

export const DEMO_CANON = [
    "Mira reached the north gate before dawn, when the city still belonged to crows and cart wheels.",
    "The guard on duty did not look up from his ledger. She counted three breaths, then knocked twice — the old signal her mother had taught her.",
    "\"State your business,\" he said, without turning the page.",
    "\"Courier,\" Mira replied. \"Letters for the archivist. Urgent, but not for your eyes.\"",
    "He sighed, as if the night had personally offended him, and slid the viewing slot open.",
];

export const DEMO_HUNKS = [
    {
        id: "h1",
        by: "alex",
        byLabel: "@alex",
        type: "replace",
        oldText: "<p>Mira reached the north gate before dawn, when the city still belonged to crows and cart wheels.</p>",
        newText: "<p>Mira reached the north gate before dawn, while the city still belonged to crows, cart wheels, and the last stars.</p>",
        paragraphIndex: 0,
        status: "pending",
    },
    {
        id: "h2",
        by: "alex",
        byLabel: "@alex",
        type: "replace",
        oldText: "<p>The guard on duty did not look up from his ledger. She counted three breaths, then knocked twice — the old signal her mother had taught her.</p>",
        newText: "<p>The guard on duty did not look up from his ledger. She counted three breaths — one for luck — then knocked twice — the old signal her mother had taught her.</p>",
        paragraphIndex: 1,
        status: "pending",
    },
    {
        id: "h3",
        by: "sam",
        byLabel: "@sam",
        type: "replace",
        oldText: "<p>\"State your business,\" he said, without turning the page.</p>",
        newText: "<p>\"State your business,\" he said, still not looking up from the ledger.</p>",
        paragraphIndex: 2,
        status: "pending",
    },
    {
        id: "h4",
        by: "sam",
        byLabel: "@sam",
        type: "insert",
        oldText: "",
        newText: "<p>Mira adjusted the strap on her satchel. The letters inside felt heavier than paper should.</p>",
        paragraphIndex: 3,
        status: "pending",
    },
];

export const DEMO_COMMENTS = [
    {
        id: "c1",
        by: "alex",
        byLabel: "@alex",
        paragraphIndex: 0,
        quote: "north gate before dawn",
        body: "Should this be the east gate to match chapter 9?",
        status: "open",
        parentId: "",
    },
    {
        id: "c2",
        by: "sam",
        byLabel: "@sam",
        paragraphIndex: 2,
        quote: "without turning the page",
        body: "Love this detail — maybe echo it when he finally looks up?",
        status: "open",
        parentId: "",
    },
];

export function collabRoomPreviewUrl(role = "author") {
    const url = new URL("collab-room-preview.html", window.location.href);
    url.searchParams.set("preview", "1");
    url.searchParams.set("role", role);
    return url.pathname + url.search;
}

export function collabRoomDemoInviteUrl(token = "demo-invite-token") {
    const url = new URL("collab-room-preview.html", window.location.href);
    url.searchParams.set("preview", "1");
    url.searchParams.set("invite", token);
    return url.pathname + url.search;
}
