/**
 * Story Wiki UI visibility — per browser (localStorage).
 * Data in Supabase is unchanged when links are hidden.
 */

export const STORY_BIBLE_PREF_KEY = "alysum-story-bible-ui";
export const STORY_WIKI_PREF_KEY = STORY_BIBLE_PREF_KEY;

/** Fired on this tab when the preference changes (same-tab updates). */
export const STORY_BIBLE_PREF_EVENT = "alysum-story-bible-ui-change";
export const STORY_WIKI_PREF_EVENT = STORY_BIBLE_PREF_EVENT;

/** @returns {boolean} true = show links and full Story Wiki page (default). */
export function isStoryBibleUiEnabled() {
    try {
        const v = localStorage.getItem(STORY_BIBLE_PREF_KEY);
        if (v == null || v === "") return true;
        return v !== "0";
    } catch (_) {
        return true;
    }
}

/** @returns {boolean} true = show links and full Story Wiki page (default). */
export function isStoryWikiUiEnabled() {
    return isStoryBibleUiEnabled();
}

/** @param {boolean} enabled */
export function setStoryWikiUiEnabled(enabled) {
    setStoryBibleUiEnabled(enabled);
}

/** @param {boolean} enabled */
export function setStoryBibleUiEnabled(enabled) {
    const next = enabled ? "1" : "0";
    try {
        const prev = localStorage.getItem(STORY_BIBLE_PREF_KEY);
        localStorage.setItem(STORY_BIBLE_PREF_KEY, next);
        if (prev !== next) {
            window.dispatchEvent(new CustomEvent(STORY_BIBLE_PREF_EVENT, { detail: { enabled } }));
        }
    } catch (_) {}
}
