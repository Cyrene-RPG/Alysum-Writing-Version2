/**
 * Did this editor change come from the writer's own typing?
 *
 * Only typed words count toward the daily goal and can earn sentence XP. Paste,
 * drop, spellcheck-replace, and undo/redo do not.
 *
 * Consumers get the raw `InputEvent` from document.js's `emit(event)` → `onInput`.
 * Programmatic emits (setHtml, command(), applyFont(), the Tab handler) pass no
 * event or a non-InputEvent — those must count as "not typed".
 */

const TYPED_INPUT_TYPES = new Set([
    "insertText",
    "insertParagraph",
    "insertLineBreak",
    "insertCompositionText",
    "insertFromComposition",
    "deleteContentBackward",
    "deleteContentForward",
    "deleteContent",
    "deleteWordBackward",
    "deleteWordForward",
    "deleteByCut",
    "deleteSoftLineBackward",
    "deleteHardLineBackward",
    "deleteByDrag",
]);

/** @param {InputEvent|Event|null|undefined} event */
export function isTypedInput(event) {
    if (!event || typeof event !== "object") return false;
    if (event.isTrusted === false) return false;
    const type = typeof event.inputType === "string" ? event.inputType : "";
    if (!type) return false; // KeyboardEvent / synthetic — not a real InputEvent
    return TYPED_INPUT_TYPES.has(type);
}

/**
 * Word-count delta to credit as typed. Zero when the change was a paste / undo /
 * redo / drop / format / programmatic edit, or when it removed words.
 */
export function typedWordDelta(prevWordCount, nextWordCount, event) {
    if (!isTypedInput(event)) return 0;
    const delta = Number(nextWordCount) - Number(prevWordCount);
    return Number.isFinite(delta) && delta > 0 ? Math.round(delta) : 0;
}

/** inputTypes that drop non-typed content into the page — used to wrap paste regions. */
export function isPasteLikeInput(event) {
    const type = event && typeof event.inputType === "string" ? event.inputType : "";
    return type === "insertFromPaste" || type === "insertFromDrop" || type === "insertReplacementText";
}
