/**
 * Word Wars demo mode — a full room (and lobby) with bot writers, no Supabase.
 *
 * Trigger with `?demo=1` on word-wars-lobby.html or word-wars.html, or by
 * visiting a room id that starts with `demo-ww-`. Add `?bots=N` (1–15) to
 * change the bot count (default 7). Nothing here touches the network.
 */

export const DEMO_PREFIX = "demo-ww-";
export const DEMO_ROOM_ID = `${DEMO_PREFIX}1`;
export const DEMO_UID = "demo-you";

export function isDemoRoom(id) {
    return String(id || "").startsWith(DEMO_PREFIX);
}

// Kill switch: the bot demo is offline for now. Flip to `true` to bring it back
// (it also needs the `?demo=1` / `demo-ww-` room id like before).
const DEMO_ENABLED = false;

export function demoRequested() {
    if (!DEMO_ENABLED) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("demo") === "1" || isDemoRoom(params.get("room") || "");
}

export function demoBotCount() {
    const raw = Number(new URLSearchParams(window.location.search).get("bots"));
    if (!Number.isFinite(raw)) return 7;
    return Math.min(15, Math.max(1, Math.floor(raw)));
}

/**
 * A fixed banner making it unmistakable that this is the offline demo (bots only,
 * a fake book, changes local) with a one-click way back to the real lobby.
 */
export function mountDemoBanner() {
    if (document.getElementById("wwDemoBanner")) return;
    const bar = document.createElement("div");
    bar.id = "wwDemoBanner";
    bar.setAttribute("role", "status");
    bar.style.cssText = [
        "position:fixed", "left:0", "right:0", "bottom:0", "z-index:2147483647",
        "display:flex", "gap:12px", "align-items:center", "justify-content:center",
        "flex-wrap:wrap", "padding:8px 14px",
        "font:600 12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
        "background:#7c3aed", "color:#fff",
        "box-shadow:0 -6px 20px rgba(0,0,0,.35)",
    ].join(";");
    bar.innerHTML =
        '<span>Word Wars demo — bots only, a sample book, nothing saved to your account.</span>'
        + '<a href="/word-wars-lobby" style="color:#fff;background:rgba(255,255,255,.18);'
        + 'padding:4px 10px;border-radius:6px;text-decoration:none;font-weight:800">Exit demo</a>';
    (document.body || document.documentElement).appendChild(bar);
}

export const demoSession = {
    mode: "cloud",
    user: { id: DEMO_UID, email: "you@demo.local" },
};

export const demoProfile = { name: "You", imageUrl: "" };

const BOT_NAMES = [
    "Margo Quill",
    "Dashiell Vane",
    "Ivy Marsh",
    "Rourke Ellery",
    "Sable Wren",
    "Cassius Poe",
    "Nadia Frost",
    "Bram Holloway",
    "Odile Crane",
    "Jasper Thorne",
    "Wren Calloway",
    "Lux Ferro",
    "Marlowe Ash",
    "Perri Vale",
    "Sorrel Day",
];

const SENTENCES = [
    "The tide came in wrong that morning, and nobody on the pier would say so out loud.",
    "She counted the lighthouse flashes the way other people counted breaths.",
    "By the third cup of coffee the argument had folded itself into something quieter.",
    "He kept the letter in his coat because burning it felt like admitting it mattered.",
    "The map was accurate everywhere except the one place they actually needed it.",
    "Salt had gotten into the piano again; every note came out a half-step apologetic.",
    "They agreed to meet at the wreck, which was less a plan than a shared superstition.",
    "The town clock struck thirteen and everyone politely pretended to have missed it.",
    "Her grandmother's recipe called for a pinch of something the label had worn away.",
    "The dog found the grave first, then sat on it like it had always known.",
    "Rain moved across the harbor in a straight grey wall, unhurried, almost bored.",
    "He wrote the confession in the margins so it could be denied as a doodle.",
];

function botDisplayName(index) {
    return BOT_NAMES[index % BOT_NAMES.length];
}

function demoBook() {
    return {
        id: "demo-book",
        title: "The Salt Verses",
        words: 0,
        media_format: "novel",
        sections: {
            front: [],
            body: [
                {
                    id: "ch_one",
                    title: "Chapter One",
                    content: "<p>The tide came in wrong that morning.</p><p><br></p>",
                },
                { id: "ch_two", title: "Chapter Two", content: "<p><br></p>" },
                { id: "ch_notes", title: "Scratch", content: "<p><br></p>" },
            ],
            back: [],
        },
    };
}

const DEMO_BOOK_KEY = "alysum:word-wars:demo-book";

function loadDemoBook() {
    try {
        const raw = localStorage.getItem(DEMO_BOOK_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved && saved.sections && Array.isArray(saved.sections.body)) return saved;
        }
    } catch {
        /* ignore */
    }
    return demoBook();
}

function saveDemoBook(book) {
    try {
        localStorage.setItem(DEMO_BOOK_KEY, JSON.stringify(book));
    } catch {
        /* ignore */
    }
}

/**
 * A books API stand-in. Autosaves to localStorage so added chapters / typed text
 * survive a reload of the demo (there is no real backend). Clear the
 * `alysum:word-wars:demo-book` key to reset.
 */
export function demoBooksApi() {
    let book = loadDemoBook();
    return {
        async listBooks() {
            return [{ id: book.id, title: book.title }];
        },
        async getBook() {
            return structuredClone(book);
        },
        async updateBook(_id, patch) {
            book = { ...book, ...patch };
            saveDemoBook(book);
            return structuredClone(book);
        },
    };
}

function makeBots(count, { active }) {
    const bots = [];
    for (let i = 0; i < count; i += 1) {
        const shares = i % 2 === 0; // every other bot writes in the open
        bots.push({
            userId: `demo-bot-${i}`,
            displayName: botDisplayName(i),
            isHost: false,
            bookId: "demo-book",
            shareDraft: active && shares,
            _shares: shares,
            isTyping: false,
            sprintWords: 0,
            wordsAtStart: 0,
            liveChapterId: `demo-bot-${i}-ch`,
            liveChapterTitle: shares ? "Chapter One" : "",
            liveChapterHtml: "",
            _lines: 0,
        });
    }
    return bots;
}

function you({ host }) {
    return {
        userId: DEMO_UID,
        displayName: "You",
        isHost: host,
        bookId: "demo-book",
        shareDraft: false,
        isTyping: false,
        sprintWords: 0,
        wordsAtStart: 0,
        liveChapterTitle: "",
        liveChapterHtml: "",
        liveChapterId: "",
    };
}

function advanceBot(bot) {
    if (bot.userId === DEMO_UID) return;
    bot.isTyping = Math.random() > 0.4;
    if (bot.isTyping) {
        bot.sprintWords += Math.round(Math.random() * 24) + 4;
    }
    if (bot._shares) {
        bot.shareDraft = true;
        if (bot._lines < SENTENCES.length && Math.random() > 0.35) {
            const pick = SENTENCES[(bot._lines + bot.userId.length) % SENTENCES.length];
            bot.liveChapterHtml += `<p>${pick}</p>`;
            bot._lines += 1;
        }
        if (!bot.liveChapterHtml) {
            bot.liveChapterHtml = `<p>${SENTENCES[0]}</p>`;
            bot._lines = 1;
        }
    }
}

/**
 * Room-side lobby stand-in. Mirrors the shape returned by
 * core/community/word-wars.js so applications/word-wars/page-ui/room.js
 * can run against it unchanged.
 */
export function createDemoRoomLobby({ bots = 7, roomId = DEMO_ROOM_ID } = {}) {
    const startedAt = new Date().toISOString();
    const participants = [you({ host: true }), ...makeBots(bots, { active: true })];

    function snapshot(status = "active") {
        return {
            roomId,
            code: "DEMOWW",
            status,
            durationMin: 15,
            maxWriters: bots + 1,
            isLocked: false,
            shareRequired: false,
            isPaused: false,
            pausedAt: null,
            pauseMsTotal: 0,
            startedAt,
            createdAt: startedAt,
            participants: participants.map((p) => ({ ...p })),
        };
    }

    return {
        async getWordWarLobby() {
            participants.forEach(advanceBot);
            return snapshot();
        },
        async updateWordWarProgress(_roomId, payload) {
            const me = participants.find((p) => p.userId === DEMO_UID);
            if (me && payload) {
                if (payload.wordsAtStart != null) me.wordsAtStart = payload.wordsAtStart;
                if (payload.sprintWords != null) me.sprintWords = payload.sprintWords;
                if (payload.isTyping != null) me.isTyping = payload.isTyping;
                if (payload.shareDraft != null) me.shareDraft = payload.shareDraft;
                if (payload.liveChapterHtml != null) me.liveChapterHtml = payload.liveChapterHtml;
                if (payload.liveChapterTitle != null) me.liveChapterTitle = payload.liveChapterTitle;
                if (payload.liveChapterId != null) me.liveChapterId = payload.liveChapterId;
            }
            return snapshot();
        },
        async leaveWordWarRoom() {
            return { left: true };
        },
        async finishWordWar() {
            return { finished: true };
        },
        async kickWordWarParticipant(_roomId, targetUserId) {
            const index = participants.findIndex((p) => p.userId === targetUserId);
            if (index > 0) participants.splice(index, 1);
            return snapshot();
        },
    };
}

/**
 * Lobby-side stand-in. Bots trickle in over a few seconds, then the host
 * can hit Begin and land in the demo room.
 */
export function createDemoLobbyApi({ bots = 7, roomId = DEMO_ROOM_ID } = {}) {
    const openedAt = Date.now();
    const roster = [you({ host: true }), ...makeBots(bots, { active: false })];
    const settings = {
        durationMin: 15,
        maxWriters: bots + 1,
        isLocked: false,
        shareRequired: false,
    };

    function present() {
        const elapsed = Date.now() - openedAt;
        const revealed = Math.min(roster.length, 2 + Math.floor(elapsed / 1400));
        return roster.slice(0, revealed);
    }

    function snapshot(status = "lobby") {
        return {
            roomId,
            code: "DEMOWW",
            status,
            durationMin: settings.durationMin,
            maxWriters: settings.maxWriters,
            isLocked: settings.isLocked,
            shareRequired: settings.shareRequired,
            participants: present().map((p) => ({ ...p })),
        };
    }

    return {
        async listOpenWordWarLobbies() {
            return [];
        },
        async createWordWarRoom() {
            return snapshot();
        },
        async updateWordWarLobby(_roomId, patch = {}) {
            if (patch.durationMin != null) settings.durationMin = patch.durationMin;
            if (patch.maxWriters != null) settings.maxWriters = patch.maxWriters;
            if (patch.isLocked != null) settings.isLocked = patch.isLocked;
            if (patch.shareRequired != null) settings.shareRequired = patch.shareRequired;
            return snapshot();
        },
        async getWordWarLobby() {
            return snapshot();
        },
        async startWordWar() {
            return { roomId, status: "active" };
        },
        async leaveWordWarRoom() {
            return { left: true };
        },
        async joinWordWarRoom() {
            return snapshot();
        },
        async joinWordWarRoomById() {
            return snapshot();
        },
    };
}
