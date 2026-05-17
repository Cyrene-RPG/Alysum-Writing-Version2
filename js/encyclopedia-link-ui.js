/** Floating “Make link?” prompt for codex contenteditable fields. */

let promptEl = null;
let hideTimer = null;

function ensurePrompt() {
    if (promptEl) return promptEl;
    promptEl = document.createElement("div");
    promptEl.className = "mc-link-prompt hidden";
    promptEl.setAttribute("role", "dialog");
    promptEl.innerHTML =
        '<p class="mc-link-prompt-text">Make link?</p>' +
        '<div class="mc-link-prompt-actions">' +
        '<button type="button" class="mc-link-prompt-no">No</button>' +
        '<button type="button" class="mc-link-prompt-yes">Yes</button>' +
        "</div>";
    document.body.appendChild(promptEl);
    return promptEl;
}

export function hideEncyclopediaLinkPrompt() {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    if (promptEl) promptEl.classList.add("hidden");
}

/**
 * @param {{ rect: DOMRect, phrase: string, onYes: () => void, onNo?: () => void }} opts
 */
export function showEncyclopediaLinkPrompt({ rect, phrase, onYes, onNo }) {
    const el = ensurePrompt();
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    const text = el.querySelector(".mc-link-prompt-text");
    if (text) text.textContent = `Make link for “${phrase.slice(0, 48)}${phrase.length > 48 ? "…" : ""}”?`;

    const yesBtn = el.querySelector(".mc-link-prompt-yes");
    const noBtn = el.querySelector(".mc-link-prompt-no");

    const close = () => hideEncyclopediaLinkPrompt();

    const onYesClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        onYes();
    };
    const onNoClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        if (typeof onNo === "function") onNo();
    };

    yesBtn.replaceWith(yesBtn.cloneNode(true));
    noBtn.replaceWith(noBtn.cloneNode(true));
    const yes = el.querySelector(".mc-link-prompt-yes");
    const no = el.querySelector(".mc-link-prompt-no");
    yes.addEventListener("click", onYesClick);
    no.addEventListener("click", onNoClick);

    const pad = 8;
    let left = rect.left + rect.width / 2 - 120;
    let top = rect.bottom + pad;
    left = Math.max(12, Math.min(left, window.innerWidth - 248));
    if (top + 56 > window.innerHeight - 12) top = rect.top - 56 - pad;
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.classList.remove("hidden");

    hideTimer = setTimeout(() => {
        document.addEventListener(
            "mousedown",
            function dismiss(ev) {
                if (!el.contains(ev.target)) {
                    close();
                    document.removeEventListener("mousedown", dismiss);
                }
            },
            { once: true }
        );
    }, 0);
}
