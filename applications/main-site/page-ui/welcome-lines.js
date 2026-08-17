/**
 * Welcome-bar subtitles. Edit this list to change what can appear under the name.
 * One line is picked at random on each page load.
 */
export const WELCOME_LINES = [
    "Browse the shelves, find your next read, and keep your place across Alysum.",
    "Your studio is waiting. Open a chapter and keep going.",
    "Worlds, characters, and chapters — all in one place.",
    "Write a little, or write a lot. The page will still be here.",
    "Pick up the thread. Your next scene is closer than it feels.",
    "Readers are out there. Finish the chapter they are waiting for.",
    "Notes, maps, and manuscripts — keep the whole story together.",
    "A quiet hour is enough. Sit down and make something.",
    "The library grows when writers share. Yours can too.",
    "Come back to the sentence you left. It missed you.",
    "Draft ugly. Polish later. The important part is starting.",
    "Your worlds remember you. Open the encyclopedia and continue.",
    "One scene, one goal, one sitting. That is a writing day.",
    "Somewhere a reader needs the story only you can tell."
];

const LAST_LINE_KEY = "alysum:welcome:last-line";

export function pickWelcomeLine() {
    const lines = WELCOME_LINES.filter((line) => String(line || "").trim());
    if (!lines.length) return "";
    if (lines.length === 1) return lines[0];

    let last = -1;
    try {
        last = Number(sessionStorage.getItem(LAST_LINE_KEY));
    } catch {
        last = -1;
    }

    let index = Math.floor(Math.random() * lines.length);
    if (index === last) index = (index + 1) % lines.length;

    try {
        sessionStorage.setItem(LAST_LINE_KEY, String(index));
    } catch {
        /* ignore */
    }
    return lines[index];
}
