/** Author-controlled hiatus status; timestamps come from server-tracked author saves. */
function normalizeStatus(data) {
    if (!data) throw new Error('This book’s status is not available. Please try again.');
    return {
        isOnHiatus: data.isOnHiatus === true,
        lastAuthorUpdate: data.lastAuthorUpdate || null,
        isComplete: data.isComplete === true,
        canManage: data.canManage === true,
    };
}
export async function getBookHiatus(client, bookId) {
    const { data, error } = await client.rpc('get_book_hiatus', { p_book_id: bookId });
    if (error) throw new Error('Could not check this book’s hiatus status. Please try again.');
    return normalizeStatus(data);
}
export async function setBookHiatus(client, bookId, isOnHiatus) {
    if (typeof isOnHiatus !== 'boolean') throw new Error('Choose a hiatus status.');
    const { data, error } = await client.rpc('set_book_hiatus', { p_book_id: bookId, p_on_hiatus: isOnHiatus });
    if (error) throw new Error(error.message || 'Could not save hiatus status. Please try again.');
    return normalizeStatus(data);
}
export function hiatusNotice(status) {
    const date = new Date(status.lastAuthorUpdate || NaN);
    const lastUpdate = Number.isFinite(date.getTime())
        ? date.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
        : 'Date unavailable';
    return `This book is on hiatus. Last updated by the author: ${lastUpdate}.`;
}
