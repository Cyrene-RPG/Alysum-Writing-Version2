/**
 * Compact public author facts for the reader end card. No support links.
 */
import { fetchAuthorById, fetchPublishedWorksForAuthor } from "./author-profile.js";
import { fetchFollowState } from "./author-follow.js";
import { levelFromXp, xpIntoLevel } from "../statistics/xp-levels.js";
import { levelFromRep } from "../statistics/rep-levels.js";

async function fetchAuthorXp(supabase, userId) {
    if (!supabase || !userId) return { xp: 0, rep: 0 };
    try {
        const { data, error } = await supabase
            .from("users")
            .select("xp, reputation")
            .eq("id", userId)
            .maybeSingle();
        if (error) return { xp: 0, rep: 0 };
        return { xp: Number(data?.xp) || 0, rep: Number(data?.reputation) || 0 };
    } catch {
        return { xp: 0, rep: 0 };
    }
}

export async function fetchReaderAuthorCard(supabase, { ownerUserId, viewerId }) {
    const ownerId = String(ownerUserId || "").trim();
    if (!ownerId) return null;
    let profile = null;
    try {
        profile = supabase ? await fetchAuthorById(supabase, ownerId) : null;
    } catch {
        profile = null;
    }
    if (!profile) return null;
    let fictionCount = 0;
    try {
        const works = supabase ? await fetchPublishedWorksForAuthor(supabase, ownerId) : [];
        fictionCount = Math.max(works.length, 1);
    } catch {
        fictionCount = 0;
    }
    const { xp, rep } = await fetchAuthorXp(supabase, ownerId);
    const into = xpIntoLevel(xp);
    const follow = await fetchFollowState(supabase, { authorId: ownerId, viewerId });
    return {
        ownerId,
        username: profile.username,
        displayName: profile.displayName,
        profileImageUrl: profile.profileImageUrl,
        bio: profile.bio,
        fictionCount,
        followers: follow.count,
        following: follow.following,
        localFollow: follow.localOnly,
        level: levelFromXp(xp),
        xpRatio: into.level > 0 ? into.ratio : 0,
        hasXp: into.level > 0,
        repLevel: levelFromRep(rep),
        hasRep: rep > 0,
    };
}
