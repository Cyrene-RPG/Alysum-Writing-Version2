/** Shared chapter reactions. Identity and counts are enforced by the database. */
export const CHAPTER_REACTIONS = Object.freeze([
    { id: 'love', emoji: '❤️', label: 'Loved it' },
    { id: 'laugh', emoji: '😂', label: 'Made me laugh' },
    { id: 'cry', emoji: '😭', label: 'Made me cry' },
    { id: 'shock', emoji: '😱', label: 'Shocked me' },
    { id: 'anger', emoji: '😤', label: 'Made me angry' },
    { id: 'excited', emoji: '🤩', label: 'Can’t wait for more' },
    { id: 'swoon', emoji: '🥰', label: 'Swooning', category: 'Hearts & feelings' },
    { id: 'heartbreak', emoji: '💔', label: 'Heartbroken', category: 'Hearts & feelings' },
    { id: 'blush', emoji: '😳', label: 'Blushing', category: 'Hearts & feelings' },
    { id: 'hot', emoji: '🥵', label: 'Feeling the heat', category: 'Hearts & feelings' },
    { id: 'happy', emoji: '😊', label: 'Made me smile', category: 'Hearts & feelings' },
    { id: 'proud', emoji: '🥹', label: 'So proud', category: 'Hearts & feelings' },
    { id: 'scared', emoji: '😨', label: 'Scared', category: 'Suspense & surprises' },
    { id: 'tense', emoji: '😬', label: 'On edge', category: 'Suspense & surprises' },
    { id: 'confused', emoji: '🤔', label: 'Confused', category: 'Suspense & surprises' },
    { id: 'mindblown', emoji: '🤯', label: 'Mind blown', category: 'Suspense & surprises' },
    { id: 'curious', emoji: '👀', label: 'Need answers', category: 'Suspense & surprises' },
    { id: 'suspicious', emoji: '🧐', label: 'Suspicious', category: 'Suspense & surprises' },
    { id: 'inspired', emoji: '✨', label: 'Inspired', category: 'More feelings' },
    { id: 'hopeful', emoji: '🤞', label: 'Fingers crossed', category: 'More feelings' },
    { id: 'relieved', emoji: '😌', label: 'Relieved', category: 'More feelings' },
    { id: 'impressed', emoji: '👏', label: 'Impressed', category: 'More feelings' },
    { id: 'speechless', emoji: '🫢', label: 'Speechless', category: 'More feelings' },
    { id: 'melting', emoji: '🫠', label: 'I’m melting', category: 'More feelings' },
]);
const ids = new Set(CHAPTER_REACTIONS.map(item => item.id));
export function normalizeChapterReactions(value) {
    const counts = Object.fromEntries(CHAPTER_REACTIONS.map(({ id }) => {
        const count = Number(value?.counts?.[id]);
        return [id, Number.isSafeInteger(count) && count >= 0 ? count : 0];
    }));
    return { counts, mine: ids.has(value?.mine) ? value.mine : null };
}
export async function chapterReactions(client, bookId, chapterId, options = {}) {
    if (!client || !String(bookId || '').trim() || !String(chapterId || '').trim()) throw Error('This chapter is unavailable.');
    const write = Object.hasOwn(options, 'reaction');
    if (write && options.reaction !== null && !ids.has(options.reaction)) throw Error('Choose a chapter reaction.');
    const { data, error } = await client.rpc('chapter_reactions', {
        p_book: String(bookId).trim(), p_chapter: String(chapterId).trim(),
        p_write: write, p_reaction: write ? options.reaction : null,
    });
    if (error) {
        const failure = Error(['PGRST202', '42P01', '42883'].includes(error.code)
            ? 'Chapter reactions are temporarily unavailable.' : error.message || 'Could not load chapter reactions.');
        failure.code = error.code;
        throw failure;
    }
    return normalizeChapterReactions(data);
}
