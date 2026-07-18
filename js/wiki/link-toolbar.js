/**
 * Insert [[wikilink]] syntax around textarea selection.
 */

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {string} targetTitle
 * @param {string} [label]
 */
export function insertWikilink(textarea, targetTitle, label) {
    const target = String(targetTitle || "").trim();
    if (!target) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedRaw = text.slice(start, end);
    const selected = selectedRaw.trim();
    const displayLabel = String(label ?? selected).trim();
    const hadSelection = start !== end && !!displayLabel;
    const wiki = hadSelection
        ? `[[${target}|${displayLabel}]]`
        : displayLabel && displayLabel.toLowerCase() !== target.toLowerCase()
          ? `[[${target}|${displayLabel}]]`
          : `[[${target}]]`;

    textarea.value = text.slice(0, start) + wiki + text.slice(end);
    const cursor = start + wiki.length;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {Array<{ name: string }>} bookEntries
 * @param {HTMLElement} popover
 */
export function wireLinkToolbar(textarea, bookEntries, popover) {
    const targetInput = popover.querySelector("#wikiLinkTarget");
    const labelInput = popover.querySelector("#wikiLinkLabel");
    const pickList = popover.querySelector("#wikiLinkPickList");
    const applyBtn = popover.querySelector("#wikiLinkApply");
    const cancelBtn = popover.querySelector("#wikiLinkCancel");

    function openPopover() {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end).trim();

        if (targetInput) targetInput.value = selected;
        if (labelInput) labelInput.value = selected;

        if (pickList) {
            const options = (bookEntries || [])
                .map((e) => e.name)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

            pickList.innerHTML = options.length
                ? options
                      .map(
                          (name) =>
                              `<button type="button" class="wiki-link-pick" data-name="${escapeAttr(name)}">${escapeHtml(name)}</button>`
                      )
                      .join("")
                : `<p class="wiki-link-empty">No other articles in this book yet.</p>`;

            pickList.querySelectorAll(".wiki-link-pick").forEach((btn) => {
                btn.addEventListener("click", () => {
                    if (targetInput) targetInput.value = btn.dataset.name || "";
                    if (!labelInput?.value.trim() && selected) labelInput.value = selected;
                });
            });
        }

        popover.hidden = false;
        targetInput?.focus();
    }

    function closePopover() {
        popover.hidden = true;
    }

    applyBtn?.addEventListener("click", () => {
        const target = targetInput?.value?.trim();
        if (!target) {
            targetInput?.focus();
            return;
        }
        insertWikilink(textarea, target, labelInput?.value?.trim() || "");
        closePopover();
    });

    cancelBtn?.addEventListener("click", closePopover);

    popover.querySelectorAll("[data-wiki-link-close]").forEach((el) => {
        el.addEventListener("click", closePopover);
    });

    return { openPopover, closePopover };
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
}
