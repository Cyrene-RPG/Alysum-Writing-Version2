export const state = {
    user: null,
    catalog: { items: [], bugs: [], suggestions: [] },
    voteMap: new Map(),
    myVotes: new Set(),
    downMap: new Map(),
    myDowns: new Set(),
    bugFilter: "all",
    suggestFilter: "top",
};

export function loginHref(hash) {
    return `/login?next=${encodeURIComponent(`/roadmap#${hash}`)}`;
}
