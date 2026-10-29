/** Separate account-owned manuscripts from books returned through editor access. */
export function splitStudioBooks(books, userId) {
    const owned = [], shared = [];
    for (const book of books) {
        const ownerId = String(book.user_id || '');
        (userId && ownerId && ownerId !== String(userId) ? shared : owned).push(book);
    }
    return { owned, shared };
}

/** Resolve creators through the checked collaborator API, never manuscript bylines. */
export async function loadSharedCreators(books, userId, editorsApi) {
    const { shared } = splitStudioBooks(books, userId);
    const owners = new Map(shared.map(book => [String(book.user_id), book]));
    const names = new Map();
    await Promise.allSettled([...owners].map(async ([ownerId, book]) => {
        const details = await editorsApi.listBookCollaborators(book.id);
        if (details.isOwner || details.owner?.userId !== ownerId) return;
        const name = String(details.owner.displayName || '').trim();
        if (name) names.set(ownerId, name);
    }));
    return names;
}
