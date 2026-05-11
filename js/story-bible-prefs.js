/**
 * Story Bible UI visibility — per browser (localStorage).
 * Data in Firestore is unchanged when links are hidden.
 */

export const STORY_BIBLE_PREF_KEY = "alysum-story-bible-ui";

/** Fired on this tab when the preference changes (same-tab updates). */
export const STORY_BIBLE_PREF_EVENT = "alysum-story-bible-ui-change";

/** @returns {boolean} true = show links and full Story Bible page (default). */
export function isStoryBibleUiEnabled() {
    try {
        const v = localStorage.getItem(STORY_BIBLE_PREF_KEY);
        if (v == null || v === "") return true;
        return v !== "0";
    } catch (_) {
        return true;
    }
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
