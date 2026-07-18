/**
 * Lore article editor with optional Lore Wiki publishing.
 */
import { newCharacterId, newPlaceId, saveEntry, normalizeEntry } from "./api.js";

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement} container
 * @param {object|null} entry
 * @param {string} bookId
 * @param {string} [defaultTitle]
 * @param {boolean} isPublished
 * @param {boolean} canPublish
 * @param {(saved: object, publishAfterSave: boolean) => void | Promise<void>} onSave
 * @param {(saved: object) => void | Promise<void>} onUnpublish
 * @param {() => void} onCancel
 */
export function mountEditor(
    container,
    entry,
    bookId,
    defaultTitle,
    isPublished,
    canPublish,
    onSave,
    onUnpublish,
    onCancel
) {
    const isNew = !entry;
    const draft = entry || normalizeEntry({ name: defaultTitle || "" }, newCharacterId(), "character");

    container.innerHTML = `
        <form class="wiki-edit-form" id="wikiEditForm">
            <div class="mw-message-box">Write lore for your story. Use <code>[[Article Title]]</code> for links and <code>== Section ==</code> for headings. Publish to <strong>Lore Wiki</strong> when you want readers to see an article.</div>
            <div class="wiki-edit-meta">
                <div>
                    <label for="wikiEditTitle">Article title</label>
                    <input type="text" id="wikiEditTitle" value="${escapeHtml(draft.name)}" required ${isNew ? "" : "readonly"} />
                </div>
                <div>
                    <label for="wikiEditKind">Type</label>
                    <select id="wikiEditKind">
                        <option value="character" ${draft.kind === "character" ? "selected" : ""}>Character</option>
                        <option value="place" ${draft.kind === "place" ? "selected" : ""}>Place</option>
                        <option value="object" ${draft.kind === "object" ? "selected" : ""}>Object</option>
                    </select>
                </div>
                <div>
                    <label for="wikiEditAliases">Also known as (comma-separated)</label>
                    <input type="text" id="wikiEditAliases" value="${escapeHtml((draft.aliases || []).join(", "))}" />
                </div>
                <div>
                    <label for="wikiEditPronouns">Pronouns</label>
                    <input type="text" id="wikiEditPronouns" value="${escapeHtml(draft.pronouns)}" />
                </div>
                <div>
                    <label for="wikiEditStatus">Status</label>
                    <select id="wikiEditStatus">
                        <option value="alive" ${draft.status === "alive" ? "selected" : ""}>Alive</option>
                        <option value="deceased" ${draft.status === "deceased" ? "selected" : ""}>Deceased</option>
                        <option value="unknown" ${draft.status === "unknown" ? "selected" : ""}>Unknown</option>
                    </select>
                </div>
            </div>
            <h2>Appearance</h2>
            <div class="wiki-edit-meta">
                ${appearanceField("Age", "wikiEditAge", draft.appearance?.age)}
                ${appearanceField("Eyes", "wikiEditEyes", draft.appearance?.eyes)}
                ${appearanceField("Hair", "wikiEditHair", draft.appearance?.hair)}
                ${appearanceField("Height", "wikiEditHeight", draft.appearance?.height)}
                ${appearanceField("Skin", "wikiEditSkin", draft.appearance?.skin)}
                ${appearanceField("Build", "wikiEditBuild", draft.appearance?.build)}
                ${appearanceField("Distinctive", "wikiEditDistinctive", draft.appearance?.distinctive)}
            </div>
            <h2>Article body</h2>
            <textarea id="wikiEditBody" spellcheck="true">${escapeHtml(draft.body)}</textarea>
            ${
                canPublish
                    ? `<div class="wiki-publish-panel">
                <h2>Lore Wiki</h2>
                ${
                    isPublished
                        ? `<p class="wiki-publish-status"><span class="wiki-badge wiki-badge-live">Published</span> Readers can view this on Lore Wiki.</p>
                <div class="wiki-edit-actions">
                    <button type="submit" class="cdx-button cdx-button--action-progressive">Save changes</button>
                    <button type="button" class="cdx-button" id="wikiUnpublishBtn">Unpublish from Lore Wiki</button>
                    <button type="button" class="cdx-button" id="wikiEditCancel">Cancel</button>
                </div>`
                        : `<label class="wiki-publish-check"><input type="checkbox" id="wikiPublishCheck" /> Publish to Lore Wiki when I save</label>
                <div class="wiki-edit-actions">
                    <button type="submit" class="cdx-button cdx-button--action-progressive">Save article</button>
                    <button type="button" class="cdx-button" id="wikiEditCancel">Cancel</button>
                </div>`
                }
            </div>`
                    : `<div class="mw-message-box mw-message-box-warning">Publishing requires a cloud Alysum account.</div>
            <div class="wiki-edit-actions">
                <button type="submit" class="cdx-button cdx-button--action-progressive">Save article</button>
                <button type="button" class="cdx-button" id="wikiEditCancel">Cancel</button>
            </div>`
            }
        </form>
    `;

    const form = container.querySelector("#wikiEditForm");
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const publishAfterSave = !!form.querySelector("#wikiPublishCheck")?.checked;
        void submitEditor(form, draft, isNew, bookId, (saved) => onSave(saved, publishAfterSave));
    });

    container.querySelector("#wikiEditCancel")?.addEventListener("click", onCancel);

    container.querySelector("#wikiUnpublishBtn")?.addEventListener("click", () => {
        void buildFromForm(form, draft, isNew, bookId).then((saved) => onUnpublish(saved));
    });
}

function appearanceField(label, id, value) {
    return `<div><label for="${id}">${label}</label><input type="text" id="${id}" value="${escapeHtml(value || "")}" /></div>`;
}

async function buildFromForm(form, draft, isNew, bookId) {
    const title = form.querySelector("#wikiEditTitle")?.value?.trim();
    if (!title) throw new Error("Title required");

    const kind = form.querySelector("#wikiEditKind")?.value || "character";
    let id = draft.id;
    if (isNew) {
        id = kind === "character" ? newCharacterId() : newPlaceId();
    }

    const aliases = String(form.querySelector("#wikiEditAliases")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    return normalizeEntry(
        {
            name: title,
            aliases,
            pronouns: form.querySelector("#wikiEditPronouns")?.value || "",
            status: form.querySelector("#wikiEditStatus")?.value || "alive",
            notes: form.querySelector("#wikiEditBody")?.value || "",
            appearance: {
                age: form.querySelector("#wikiEditAge")?.value || "",
                eyes: form.querySelector("#wikiEditEyes")?.value || "",
                hair: form.querySelector("#wikiEditHair")?.value || "",
                height: form.querySelector("#wikiEditHeight")?.value || "",
                skin: form.querySelector("#wikiEditSkin")?.value || "",
                build: form.querySelector("#wikiEditBuild")?.value || "",
                distinctive: form.querySelector("#wikiEditDistinctive")?.value || "",
            },
            tags: draft.tags || [],
            createdAt: draft.createdAt,
        },
        id,
        kind
    );
}

async function submitEditor(form, draft, isNew, bookId, onSave) {
    const updated = await buildFromForm(form, draft, isNew, bookId);
    const uid = window.__wikiUid;
    if (!uid) throw new Error("Not signed in");
    await saveEntry(uid, bookId, updated);
    await onSave(updated);
}

export { saveEntry };
