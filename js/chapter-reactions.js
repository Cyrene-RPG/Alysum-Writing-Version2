/** Inkitt-style chapter reaction types (reader + author dashboard). */
export const CHAPTER_REACTIONS = [
    { type: "love", emoji: "❤️", label: "Love this", chartColor: "#e84d8a" },
    { type: "funny", emoji: "😂", label: "Funny", chartColor: "#f5b942" },
    { type: "spicy", emoji: "🌶️", label: "Spicy", chartColor: "#e04b4b" },
    { type: "suspenseful", emoji: "😲", label: "Suspenseful", chartColor: "#4a90e2" },
    { type: "emotional", emoji: "😭", label: "Emotional", chartColor: "#5b7cfa" },
    { type: "profound", emoji: "🤔", label: "Profound", chartColor: "#2ec4b6" },
    { type: "heartwarming", emoji: "🥰", label: "Heartwarming", chartColor: "#d946ef" },
    { type: "shocking", emoji: "🤯", label: "Shocking", chartColor: "#84cc16" },
    { type: "good_writing", emoji: "📝", label: "Good Writing", chartColor: "#22c55e" },
    { type: "compelling_plot", emoji: "🤩", label: "Compelling Plot", chartColor: "#a855f7" },
    { type: "great_character", emoji: "😎", label: "Great Character", chartColor: "#06b6d4" },
    { type: "strong_dialog", emoji: "💬", label: "Strong Dialog", chartColor: "#f97316" },
];

export const CHAPTER_REACTION_TYPE_IDS = CHAPTER_REACTIONS.map((r) => r.type);

const REACTION_TYPE_SET = new Set(CHAPTER_REACTION_TYPE_IDS);

export function isValidReactionType(type) {
    return REACTION_TYPE_SET.has(type);
}

export function reactionMeta(type) {
    return CHAPTER_REACTIONS.find((r) => r.type === type) || null;
}

export function chapterReactionId(bookId, chapterId, userId, reactionType) {
    return `${bookId}-${chapterId}-${userId}-${reactionType}`;
}

/** SQL CHECK(...) list for migrations. */
export function chapterReactionTypeSqlList() {
    return CHAPTER_REACTION_TYPE_IDS.map((t) => `'${t}'`).join(", ");
}

/**
 * @param {readonly { chapter_id?: string, reaction_type?: string }[]} rows
 * @returns {{ totalsByType: Map<string, number>, byChapter: Map<string, Map<string, number>> }}
 */
export function aggregateChapterReactions(rows) {
    const totalsByType = new Map();
    const byChapter = new Map();
    for (const row of rows || []) {
        const type = String(row?.reaction_type || "").trim();
        const chapterId = String(row?.chapter_id || "").trim();
        if (!isValidReactionType(type)) continue;
        totalsByType.set(type, (totalsByType.get(type) || 0) + 1);
        if (!chapterId) continue;
        if (!byChapter.has(chapterId)) byChapter.set(chapterId, new Map());
        const chapterMap = byChapter.get(chapterId);
        chapterMap.set(type, (chapterMap.get(type) || 0) + 1);
    }
    return { totalsByType, byChapter };
}
