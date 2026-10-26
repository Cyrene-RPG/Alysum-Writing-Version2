/** Shared chapter reactions. Identity and counts are enforced by the database. */
export const CHAPTER_REACTIONS = Object.freeze([
    { id: 'love', emoji: '❤️', label: 'Loved it' },
    { id: 'laugh', emoji: '😂', label: 'Made me laugh' },
    { id: 'cry', emoji: '😭', label: 'Made me cry' },
    { id: 'shock', emoji: '😱', label: 'Shocked me' },
    { id: 'anger', emoji: '😤', label: 'Made me angry' },
    { id: 'excited', emoji: '🤩', label: 'Can’t wait for more' },
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
