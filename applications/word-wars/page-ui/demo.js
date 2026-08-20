/**
 * Client-only test lobbies. Not real Supabase rooms.
 */
const STORAGE_KEY = "alysum-ww-demo";
export const DEMO_PREFIX = "demo-ww-";
export const DEMO_HARD_ID = "demo-ww-hard";
export const DEMO_HARD_CODE = "HARD14";

export function isDemoRoom(id) {
    return String(id || "").startsWith(DEMO_PREFIX);
}

export function demoOpenCards() {
    const cards = [{
        roomId: DEMO_HARD_ID,
        code: DEMO_HARD_CODE,
        hostDisplayName: "Hard",
        hostBookTitle: "Hard · 14 bots",
        durationMin: 15,
        maxWriters: 16,
        participantCount: 14,
        isLocked: false,
        shareRequired: false,
        sharingCount: 5,
    }];
    for (let i = 1; i <= 20; i += 1) {
        cards.push({
            roomId: `${DEMO_PREFIX}${i}`,
            code: `TST${String(i).padStart(2, "0")}`,
            hostDisplayName: `Test lobby ${i}`,
            hostBookTitle: `Test lobby ${i}`,
            durationMin: [10, 15, 20, 25][i % 4],
            maxWriters: 16,
            participantCount: (i % 5) + 1,
            isLocked: false,
            shareRequired: i % 3 === 0,
            sharingCount: i % 3 === 0 ? 1 : 0,
        });
    }
    return cards;
}

function demoBots(count) {
    return Array.from({ length: count }, (_, i) => {
        const sharing = i % 3 === 0;
        return {
            userId: `${DEMO_PREFIX}bot-${i + 1}`,
            displayName: `Bot ${i + 1}`,
            isHost: i === 0,
            isReady: true,
            shareDraft: sharing,
            liveChapterTitle: sharing ? "Chapter 1" : "",
            liveChapterHtml: sharing ? `<p>Bot ${i + 1} is already writing.</p>` : "",
            sprintWords: (i + 1) * 12,
        };
    });
}

export function demoLobbySnapshot(roomId, userId, displayName, bookId) {
    const hard = roomId === DEMO_HARD_ID;
    const n = Number(String(roomId).slice(DEMO_PREFIX.length)) || 1;
    return {
        roomId,
        code: hard ? DEMO_HARD_CODE : `TST${String(n).padStart(2, "0")}`,
        status: "active",
        durationMin: 15,
        maxWriters: 16,
        isLocked: false,
        shareRequired: false,
        startedAt: new Date().toISOString(),
        participants: [
            ...demoBots(hard ? 14 : Math.min(5, (n % 5) + 1)),
            {
                userId,
                displayName: displayName || "You",
                isHost: false,
                isReady: true,
                bookId,
                shareDraft: false,
            },
        ],
    };
}

export function storeDemoLobby(lobby) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lobby));
    } catch {
        /* ignore */
    }
}

export function loadDemoLobby(roomId) {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const lobby = raw ? JSON.parse(raw) : null;
        if (lobby?.roomId === roomId) return lobby;
    } catch {
        /* ignore */
    }
    return null;
}
