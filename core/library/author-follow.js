/**
 * Follow an author (not a book). Cloud table with a device fallback if SQL is not applied.
 */
const LOCAL_KEY = "alysum:library:author-follows";

function isMissingTableError(error) {
    const msg = String(error?.message || error || "");
    return /author_follows/i.test(msg) && /does not exist|schema cache/i.test(msg);
}

function readLocalMap() {
    try {
        const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
        return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
}

function writeLocalMap(map) {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
    } catch {
        /* ignore quota */
    }
}

function localKey(viewerId, authorId) {
    return `${viewerId || "anon"}:${authorId}`;
}

export async function fetchFollowState(supabase, { authorId, viewerId }) {
    const author = String(authorId || "").trim();
    const viewer = String(viewerId || "").trim();
    if (!author) return { count: 0, following: false, localOnly: false };
    if (!supabase) {
        const map = readLocalMap();
        const following = Boolean(viewer && map[localKey(viewer, author)]);
        return { count: following ? 1 : 0, following, localOnly: true };
    }
    const { count, error } = await supabase
        .from("author_follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("author_id", author);
    if (error) {
        if (isMissingTableError(error)) {
            const map = readLocalMap();
            const following = Boolean(viewer && map[localKey(viewer, author)]);
            return { count: following ? 1 : 0, following, localOnly: true };
        }
        throw error;
    }
    let following = false;
    if (viewer && viewer !== author) {
        const mine = await supabase
            .from("author_follows")
            .select("follower_id")
            .eq("author_id", author)
            .eq("follower_id", viewer)
            .maybeSingle();
        if (mine.error && isMissingTableError(mine.error)) {
            const map = readLocalMap();
            following = Boolean(map[localKey(viewer, author)]);
            return { count: count || 0, following, localOnly: true };
        }
        if (mine.error) throw mine.error;
        following = Boolean(mine.data);
    }
    return { count: count || 0, following, localOnly: false };
}

export async function setFollowing(supabase, { authorId, viewerId, follow }) {
    const author = String(authorId || "").trim();
    const viewer = String(viewerId || "").trim();
    if (!author || !viewer) throw new Error("Sign in to follow.");
    if (author === viewer) throw new Error("You already have this page.");
    if (!supabase) {
        const map = readLocalMap();
        const key = localKey(viewer, author);
        if (follow) map[key] = true;
        else delete map[key];
        writeLocalMap(map);
        return fetchFollowState(null, { authorId: author, viewerId: viewer });
    }
    if (follow) {
        const { error } = await supabase.from("author_follows").upsert({
            follower_id: viewer,
            author_id: author,
        }, { onConflict: "follower_id,author_id" });
        if (error && isMissingTableError(error)) {
            return setFollowing(null, { authorId: author, viewerId: viewer, follow });
        }
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from("author_follows")
            .delete()
            .eq("follower_id", viewer)
            .eq("author_id", author);
        if (error && isMissingTableError(error)) {
            return setFollowing(null, { authorId: author, viewerId: viewer, follow });
        }
        if (error) throw error;
    }
    return fetchFollowState(supabase, { authorId: author, viewerId: viewer });
}
