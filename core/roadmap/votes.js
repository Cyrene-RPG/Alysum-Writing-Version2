function voteKey(kind, stub) {
    return `${kind}:${Number(stub)}`;
}

export async function fetchVoteState(supabase, userId) {
    const voteMap = new Map();
    const myVotes = new Set();
    const { data, error } = await supabase
        .from("roadmap_votes")
        .select("user_id, target_kind, target_stub");
    if (error) throw error;
    for (const row of data || []) {
        const key = voteKey(row.target_kind, row.target_stub);
        voteMap.set(key, (voteMap.get(key) || 0) + 1);
        if (userId && row.user_id === userId) myVotes.add(key);
    }
    const downMap = new Map();
    const myDowns = new Set();
    const down = await supabase
        .from("roadmap_downvotes")
        .select("user_id, target_kind, target_stub");
    if (!down.error) {
        for (const row of down.data || []) {
            const key = voteKey(row.target_kind, row.target_stub);
            downMap.set(key, (downMap.get(key) || 0) + 1);
            if (userId && row.user_id === userId) myDowns.add(key);
        }
    }
    return { voteMap, myVotes, downMap, myDowns };
}

export async function toggleVote(supabase, userId, kind, stub, currentlyVoted) {
    if (!userId) throw new Error("Sign in to vote.");
    const targetStub = Number(stub);
    if (currentlyVoted) {
        const { error } = await supabase
            .from("roadmap_votes")
            .delete()
            .eq("user_id", userId)
            .eq("target_kind", kind)
            .eq("target_stub", targetStub);
        if (error) throw error;
        return false;
    }
    const [{ error }] = await Promise.all([
        supabase.from("roadmap_votes").insert({
            user_id: userId,
            target_kind: kind,
            target_stub: targetStub,
        }),
        supabase
            .from("roadmap_downvotes")
            .delete()
            .eq("user_id", userId)
            .eq("target_kind", kind)
            .eq("target_stub", targetStub),
    ]);
    if (error && error.code !== "23505") throw error;
    return true;
}

export async function toggleDownvote(supabase, userId, kind, stub, currentlyVoted) {
    if (!userId) throw new Error("Sign in to vote.");
    const targetStub = Number(stub);
    if (currentlyVoted) {
        const { error } = await supabase
            .from("roadmap_downvotes")
            .delete()
            .eq("user_id", userId)
            .eq("target_kind", kind)
            .eq("target_stub", targetStub);
        if (error) throw error;
        return false;
    }
    const [{ error }] = await Promise.all([
        supabase.from("roadmap_downvotes").insert({
            user_id: userId,
            target_kind: kind,
            target_stub: targetStub,
        }),
        supabase
            .from("roadmap_votes")
            .delete()
            .eq("user_id", userId)
            .eq("target_kind", kind)
            .eq("target_stub", targetStub),
    ]);
    if (error && error.code !== "23505") throw error;
    return true;
}
