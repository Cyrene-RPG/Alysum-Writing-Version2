/**
 * Account-backed author follows. Never report a browser-only follow as saved.
 */
function throwFollowError(error) {
    const message = String(error?.message || error || "");
    if (/author_follows|get_author_follower_count/i.test(message) && /does not exist|schema cache/i.test(message)) {
        throw new Error("Author following is temporarily unavailable. Please try again later.");
    }
    throw error;
}

export async function fetchFollowState(supabase, { authorId, viewerId }) {
    const author = String(authorId || "").trim();
    const viewer = String(viewerId || "").trim();
    if (!author) return { count: 0, following: false, localOnly: false };
    if (!supabase) throw new Error("Could not connect to author following. Please try again.");
    const { data: count, error } = await supabase.rpc("get_author_follower_count", { p_author_id: author });
    if (error) throwFollowError(error);
    if (count == null || !Number.isFinite(Number(count))) throw new Error("Could not load follower count. Please try again.");
    let following = false;
    if (viewer && viewer !== author) {
        const mine = await supabase
            .from("author_follows")
            .select("follower_id")
            .eq("author_id", author)
            .eq("follower_id", viewer)
            .maybeSingle();
        if (mine.error) throwFollowError(mine.error);
        following = Boolean(mine.data);
    }
    return { count: Math.max(0,Number(count)), following, localOnly: false };
}

export async function setFollowing(supabase, { authorId, viewerId, follow }) {
    const author = String(authorId || "").trim();
    const viewer = String(viewerId || "").trim();
    if (!author || !viewer) throw new Error("Sign in to follow.");
    if (author === viewer) throw new Error("You cannot follow yourself.");
    if (!supabase) throw new Error("Could not connect to author following. Please try again.");
    if (follow) {
        // ON CONFLICT DO NOTHING needs no UPDATE policy and makes retries safe.
        const { error } = await supabase.from("author_follows").upsert({
            follower_id: viewer,
            author_id: author,
        }, { onConflict: "follower_id,author_id", ignoreDuplicates: true });
        if (error) throwFollowError(error);
    } else {
        const { error } = await supabase
            .from("author_follows")
            .delete()
            .eq("follower_id", viewer)
            .eq("author_id", author);
        if (error) throwFollowError(error);
    }
    const state = await fetchFollowState(supabase, { authorId: author, viewerId: viewer });
    if (state.following !== Boolean(follow)) {
        throw new Error("Could not confirm your follow change. Please try again.");
    }
    return state;
}

