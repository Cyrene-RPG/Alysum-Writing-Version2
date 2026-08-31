/**
 * Single file for XP (and tiny rep-on-level) amounts.
 * Change numbers here. RPCs and UI must import this — do not hardcode 20 / 3 / 15.
 * null means the reason exists but grants 0 until you put a number in.
 * Past grants reverse using the amount stored on xp_events, not today's table.
 *
 * Keep in sync with supabase/live-site/supabase-statistics.sql (public.xp_config
 * is seeded from these keys). SQL can't import JS — the migration transcribes them.
 */

export const AWARDS = Object.freeze({
    daily_login: 20,
    give_reputation: 3,

    chapter_comment: 3,
    chapter_comment_daily_cap: 24,
    comment_upvote: 3,
    comment_upvote_window_hours: 24,

    review_upvote_full: 15,
    review_upvote_aged: 5,
    review_upvote_full_days: 7,
    review_upvote_max_paying: 100,
    review_create: null,
    review_vote: null,

    referral_signup: null,

    writing_sentence: 2,
    writing_milestone_2k: 10,
    writing_milestone_10k: 100,
    writing_milestone_2k_words: 2000,
    writing_milestone_10k_words: 10000,

    rep_level_lump_per_level: 10,
    xp_level_grant_rep: 1
});

export const XP_REASONS = Object.freeze({
    daily_login: "daily_login",
    give_reputation: "give_reputation",
    chapter_comment: "chapter_comment",
    comment_upvote: "comment_upvote",
    review_upvote: "review_upvote",
    review_create: "review_create",
    review_vote: "review_vote",
    referral_signup: "referral_signup",
    writing_sentence: "writing_sentence",
    writing_milestone_2k: "writing_milestone_2k",
    writing_milestone_10k: "writing_milestone_10k",
    rep_level_lump: "rep_level_lump"
});

export function xpAmount(key) {
    const n = AWARDS[key];
    if (n == null) return 0;
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
}

export function repLevelLumpXp(repLevel) {
    const n = Math.floor(Number(repLevel) || 0);
    if (n < 1) return 0;
    return n * xpAmount("rep_level_lump_per_level");
}
