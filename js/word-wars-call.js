/**
 * Word Wars participant dock — Discord-style writer strip (avatars only, no cameras).
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

function renderAvatarFallback(name, imageUrl, className = "") {
    const initial = escapeHtml(avatarInitial(name));
    const url = String(imageUrl || "").trim();
    if (!url) {
        return `<span class="ww-call-avatar-fallback ${className}">${initial}</span>`;
    }
    return `<img class="ww-call-avatar-img ${className}" src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ww-call-avatar-fallback ${className}',textContent:'${initial}'}))" />`;
}

/**
 * @param {HTMLElement | null} container
 * @param {{
 *   participants: Array<{ userId: string, displayName?: string, sprintWords?: number, isTyping?: boolean, isHost?: boolean, profileImageUrl?: string }>,
 *   userId: string,
 * }} opts
 */
export function renderParticipantDock(container, opts) {
    if (!container) return;
    const { participants = [], userId } = opts;

    container.innerHTML = participants
        .map((participant) => {
            const isYou = participant.userId === userId;
            const hostBadge = participant.isHost ? '<span class="ww-call-host">Host</span>' : "";
            const typing = participant.isTyping ? '<span class="ww-call-typing">Typing</span>' : "";
            const words = Math.max(0, Number(participant.sprintWords) || 0);

            return `
                <article
                    class="ww-call-tile${isYou ? " is-you" : ""}${participant.isTyping ? " is-typing" : ""}"
                    data-call-tile="${escapeHtml(participant.userId)}"
                    title="${escapeHtml(participant.displayName || "Writer")}"
                >
                    <div class="ww-call-tile-media">
                        <div class="ww-call-avatar">${renderAvatarFallback(participant.displayName, participant.profileImageUrl)}</div>
                    </div>
                    <div class="ww-call-tile-meta">
                        <span class="ww-call-name">${escapeHtml(isYou ? "You" : participant.displayName || "Writer")}${hostBadge}</span>
                        <span class="ww-call-words">${words} word${words === 1 ? "" : "s"}${typing}</span>
                    </div>
                </article>
            `;
        })
        .join("");

    container.classList.toggle("is-many", participants.length > 6);
    container.classList.toggle("is-crowded", participants.length > 10);
}
