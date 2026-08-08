/** Discord-style custom reaction renders for Writer's Lounge. */

export const LOUNGE_SPARKLES = "✨";

const SPARKLES_ALIASES = new Set([LOUNGE_SPARKLES, "⭐", "🌟", "💫"]);

const SPARKLES_SVG = `<svg class="lounge-reaction-icon lounge-reaction-icon--sparkles" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="#71EAFF" stroke="#101318" stroke-width="0.65" stroke-linejoin="round" d="M12 2.2l.95 2.85 2.85.95-2.85.95L12 9.8l-.95-2.85-2.85-.95 2.85-.95z"/>
  <path fill="#71EAFF" stroke="#101318" stroke-width="0.55" stroke-linejoin="round" d="M6.2 11.4l.65 1.95 1.95.65-1.95.65-.65 1.95-.65-1.95-1.95-.65 1.95-.65z"/>
  <path fill="#71EAFF" stroke="#101318" stroke-width="0.5" stroke-linejoin="round" d="M16.8 13.8l.55 1.65 1.65.55-1.65.55-.55 1.65-.55-1.65-1.65-.55 1.65-.55z"/>
</svg>`;

export function isLoungeSparkles(emoji) {
    return SPARKLES_ALIASES.has(String(emoji || "").trim());
}

export function loungeReactionLabel(emoji) {
    return isLoungeSparkles(emoji) ? "Sparkles" : String(emoji || "");
}

/** Canonical emoji stored in the database when user picks sparkles variants. */
export function normalizeLoungeReactionEmoji(emoji) {
    return isLoungeSparkles(emoji) ? LOUNGE_SPARKLES : String(emoji || "").trim();
}

/**
 * @param {string} emoji
 * @param {{ className?: string }} [options]
 */
export function renderLoungeReactionEmoji(emoji, options = {}) {
    const value = String(emoji || "");
    const extra = options.className ? ` ${options.className}` : "";

    if (isLoungeSparkles(value)) {
        return `<span class="lounge-reaction-emoji lounge-reaction-emoji--custom${extra}" data-emoji="${LOUNGE_SPARKLES}">${SPARKLES_SVG}</span>`;
    }

    return `<span class="lounge-reaction-emoji${extra}" data-emoji="${value}" aria-hidden="true">${value}</span>`;
}
