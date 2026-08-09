/**
 * Word Wars writer dock — mini live-draft previews; click to focus in main stage.
 */

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function avatarInitial(name) {
    return String(name || "W").trim().charAt(0).toUpperCase() || "W";
}

function draftPreviewExcerpt(html, maxLen = 120) {
    const text = String(html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return "";
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * @param {{
 *   html?: string,
 *   hidden?: boolean,
 *   empty?: boolean,
 *   live?: boolean,
 *   label?: string,
 *   displayName?: string,
 *   profileImageUrl?: string,
 * }} preview
 */
function renderDockPreview(preview) {
    if (preview.hidden) {
        const initial = escapeHtml(avatarInitial(preview.displayName));
        return `
            <div class="ww-dock-preview is-hidden">
                <span class="ww-dock-preview-avatar">${initial}</span>
                <span class="ww-dock-preview-mask">Draft hidden</span>
            </div>
        `;
    }
    if (preview.empty) {
        const liveBadge = preview.live ? '<span class="ww-dock-live">Live</span>' : "";
        return `
            <div class="ww-dock-preview is-empty${preview.live ? " is-sharing" : ""}">
                ${liveBadge}
                <span class="ww-dock-preview-placeholder">${escapeHtml(preview.label || "Your manuscript")}</span>
            </div>
        `;
    }
    const liveBadge = preview.live ? '<span class="ww-dock-live">Live</span>' : "";
    const excerpt = escapeHtml(draftPreviewExcerpt(preview.html));
    return `
        <div class="ww-dock-preview is-live">
            ${liveBadge}
            <p class="ww-dock-preview-text">${excerpt || "Writing…"}</p>
        </div>
    `;
}

/**
 * @param {HTMLElement | null} container
 * @param {{
 *   participants: Array<{ userId: string, displayName?: string, sprintWords?: number, isTyping?: boolean, isHost?: boolean }>,
 *   userId: string,
 *   focusedUserId: string,
 *   getPreview: (participant: object) => object,
 *   onSelect: (userId: string) => void,
 * }} opts
 */
export function renderWriterDock(container, opts) {
    if (!container) return;
    const { participants = [], userId, focusedUserId, getPreview, onSelect } = opts;

    container.innerHTML = participants
        .map((participant) => {
            const isYou = participant.userId === userId;
            const isFocused = participant.userId === focusedUserId;
            const preview = getPreview(participant) || {};
            const words = Math.max(0, Number(participant.sprintWords) || 0);
            const typing = participant.isTyping ? '<span class="ww-dock-typing">Typing</span>' : "";
            const hostBadge = participant.isHost ? '<span class="ww-dock-host">Host</span>' : "";

            return `
                <button
                    type="button"
                    class="ww-dock-tile${isYou ? " is-you" : ""}${isFocused ? " is-focused" : ""}${participant.isTyping ? " is-typing" : ""}"
                    data-writer-id="${escapeHtml(participant.userId)}"
                    aria-pressed="${isFocused ? "true" : "false"}"
                    title="${escapeHtml(isYou ? "Your manuscript" : participant.displayName || "Writer")}"
                >
                    ${renderDockPreview(preview)}
                    <span class="ww-dock-meta">
                        <span class="ww-dock-name">${escapeHtml(isYou ? "You" : participant.displayName || "Writer")}${hostBadge}</span>
                        <span class="ww-dock-words">${words} word${words === 1 ? "" : "s"}${typing}</span>
                    </span>
                </button>
            `;
        })
        .join("");

    container.classList.toggle("is-many", participants.length > 6);
    container.classList.toggle("is-crowded", participants.length > 10);

    if (!container.dataset.dockBound) {
        container.dataset.dockBound = "1";
        container.addEventListener("click", (event) => {
            const tile = event.target.closest("[data-writer-id]");
            if (!tile) return;
            const nextId = tile.getAttribute("data-writer-id");
            if (nextId) onSelect(nextId);
        });
    }
}
