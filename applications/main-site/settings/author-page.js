import { els } from "/js/settings/elements.js";
import {
    AUTHOR_SUPPORT_LINK_KINDS,
    AUTHOR_SUPPORT_URL_MAX_LENGTH,
    escapeAttribute,
    normalizeSupportLinks,
} from "@alysum/library/author-profile.js";

export function updateAuthorBioCount() {
    if (!els.authorBioCount || !els.authorBioInput) return;
    els.authorBioCount.textContent = String(els.authorBioInput.value.length);
}

export function renderSupportLinkFields(links = {}) {
    if (!els.supportLinksGrid) return;
    const cleaned = normalizeSupportLinks(links);
    els.supportLinksGrid.innerHTML = AUTHOR_SUPPORT_LINK_KINDS.map((kind) => {
        const value = cleaned[kind.id] || "";
        const inputId = `supportLink_${kind.id}`;
        return `
            <div class="field support-link-field">
                <label for="${inputId}"><span class="support-link-kind">${escapeAttribute(kind.label)}</span></label>
                <input
                    type="url"
                    id="${inputId}"
                    data-support-kind="${escapeAttribute(kind.id)}"
                    maxlength="${AUTHOR_SUPPORT_URL_MAX_LENGTH}"
                    placeholder="${escapeAttribute(kind.placeholder)}"
                    value="${escapeAttribute(value)}"
                    autocomplete="url"
                />
            </div>
        `;
    }).join("");
}

export function readSupportLinkDraft() {
    const draft = {};
    els.supportLinksGrid?.querySelectorAll("input[data-support-kind]").forEach((input) => {
        const kind = input.getAttribute("data-support-kind");
        if (kind) draft[kind] = input.value;
    });
    return draft;
}

export function setSupportLinksDisabled(disabled) {
    els.supportLinksGrid?.querySelectorAll("input[data-support-kind]").forEach((input) => {
        input.disabled = disabled;
    });
    if (els.saveSupportLinksBtn) els.saveSupportLinksBtn.disabled = disabled;
}
