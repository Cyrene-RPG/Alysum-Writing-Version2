/**
 * Compact public author facts for the reader end card. No support links.
 */
import { fetchAuthorById, fetchPublishedWorksForAuthor } from "./author-profile.js";
import { fetchFollowState } from "./author-follow.js";
import { levelFromXp, xpIntoLevel } from "../statistics/xp-levels.js";

let xpColumnMissing = false;

async function fetchAuthorXp(supabase, userId) {
    if (!supabase || !userId || xpColumnMissing) return 0;
    const { data, error } = await supabase
        .from("users")
        .select("xp")
        .eq("id", userId)
        .maybeSingle();
    if (error) {
        if (/column|does not exist|schema cache/i.test(String(error.message || error))) {
            xpColumnMissing = true;
        }
        return 0;
    }
    return Number(data?.xp) || 0;
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
    const xp = await fetchAuthorXp(supabase, ownerId);
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
    };
}
