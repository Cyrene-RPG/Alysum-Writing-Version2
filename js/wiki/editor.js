/**
 * Lore article editor — writing-first layout with sidebar metadata.
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
    const isCharacter = draft.kind === "character";

    container.innerHTML = `
        <form class="wiki-edit-form" id="wikiEditForm">
            <header class="wiki-edit-topbar">
                <a class="wiki-edit-back" href="wiki.html?book=${encodeURIComponent(bookId)}">← Articles</a>
                <div class="wiki-edit-topbar-actions">
                    ${isPublished ? '<span class="wiki-badge wiki-badge-live">On Lore Wiki</span>' : ""}
                    <button type="button" class="cdx-button" id="wikiEditCancel">Cancel</button>
                    <button type="submit" class="cdx-button cdx-button--action-progressive">${isNew ? "Create article" : "Save"}</button>
                </div>
            </header>

            <div class="wiki-edit-layout">
                <div class="wiki-edit-main">
                    <label class="wiki-edit-title-label" for="wikiEditTitle">Article title</label>
                    <input type="text" id="wikiEditTitle" class="wiki-edit-title-input" value="${escapeHtml(draft.name)}" placeholder="Character, place, or concept name" required ${isNew ? "" : "readonly"} />

                    <label class="wiki-edit-body-label" for="wikiEditBody">Lore</label>
                    <textarea id="wikiEditBody" class="wiki-edit-body-input" spellcheck="true" placeholder="Write the article here… Use [[Article Title]] for links and == Section == for headings.">${escapeHtml(draft.body)}</textarea>
                    <p class="wiki-edit-hint"><code>[[Article Title]]</code> links · <code>== Heading ==</code> sections</p>
                </div>

                <aside class="wiki-edit-sidebar">
                    <section class="wiki-edit-card">
                        <h3>Details</h3>
                        <div class="wiki-edit-field">
                            <label for="wikiEditKind">Type</label>
                            <select id="wikiEditKind">
                                <option value="character" ${draft.kind === "character" ? "selected" : ""}>Character</option>
                                <option value="place" ${draft.kind === "place" ? "selected" : ""}>Place</option>
                                <option value="object" ${draft.kind === "object" ? "selected" : ""}>Object</option>
                            </select>
                        </div>
                        <div class="wiki-edit-field">
                            <label for="wikiEditAliases">Also known as</label>
                            <input type="text" id="wikiEditAliases" value="${escapeHtml((draft.aliases || []).join(", "))}" placeholder="Comma-separated" />
                        </div>
                        <div class="wiki-edit-field wiki-edit-character-only" ${isCharacter ? "" : "hidden"}>
                            <label for="wikiEditPronouns">Pronouns</label>
                            <input type="text" id="wikiEditPronouns" value="${escapeHtml(draft.pronouns)}" />
                        </div>
                        <div class="wiki-edit-field wiki-edit-character-only" ${isCharacter ? "" : "hidden"}>
                            <label for="wikiEditStatus">Status</label>
                            <select id="wikiEditStatus">
                                <option value="alive" ${draft.status === "alive" ? "selected" : ""}>Alive</option>
                                <option value="deceased" ${draft.status === "deceased" ? "selected" : ""}>Deceased</option>
                                <option value="unknown" ${draft.status === "unknown" ? "selected" : ""}>Unknown</option>
                            </select>
                        </div>
                    </section>

                    <section class="wiki-edit-card wiki-edit-appearance-card wiki-edit-character-only" ${isCharacter ? "" : "hidden"}>
                        <h3>Appearance</h3>
                        <div class="wiki-edit-field"><label for="wikiEditAge">Age</label><input type="text" id="wikiEditAge" value="${escapeHtml(draft.appearance?.age || "")}" /></div>
                        <div class="wiki-edit-field"><label for="wikiEditEyes">Eyes</label><input type="text" id="wikiEditEyes" value="${escapeHtml(draft.appearance?.eyes || "")}" /></div>
                        <div class="wiki-edit-field"><label for="wikiEditHair">Hair</label><input type="text" id="wikiEditHair" value="${escapeHtml(draft.appearance?.hair || "")}" /></div>
                        <div class="wiki-edit-field"><label for="wikiEditHeight">Height</label><input type="text" id="wikiEditHeight" value="${escapeHtml(draft.appearance?.height || "")}" /></div>
                        <div class="wiki-edit-field"><label for="wikiEditSkin">Skin</label><input type="text" id="wikiEditSkin" value="${escapeHtml(draft.appearance?.skin || "")}" /></div>
                        <div class="wiki-edit-field"><label for="wikiEditBuild">Build</label><input type="text" id="wikiEditBuild" value="${escapeHtml(draft.appearance?.build || "")}" /></div>
                        <div class="wiki-edit-field"><label for="wikiEditDistinctive">Distinctive</label><input type="text" id="wikiEditDistinctive" value="${escapeHtml(draft.appearance?.distinctive || "")}" /></div>
                    </section>

                    <section class="wiki-edit-card wiki-edit-publish-card">
                        <h3>Lore Wiki</h3>
                        ${
                            canPublish
                                ? isPublished
                                    ? `<p class="wiki-publish-copy">Readers can view this article on Lore Wiki. Saving updates the public version.</p>
                                       <button type="button" class="cdx-button wiki-edit-unpublish" id="wikiUnpublishBtn">Unpublish</button>`
                                    : `<label class="wiki-publish-check"><input type="checkbox" id="wikiPublishCheck" /> Publish when I save</label>
                                       <p class="wiki-publish-copy">Optional — share this article publicly. Drafts stay private until you publish.</p>`
                                : `<p class="wiki-publish-copy">Sign in with a cloud account to publish to Lore Wiki.</p>`
                        }
                    </section>
                </aside>
            </div>
        </form>
    `;

    const form = container.querySelector("#wikiEditForm");
    const kindSelect = form.querySelector("#wikiEditKind");

    kindSelect?.addEventListener("change", () => {
        const isChar = kindSelect.value === "character";
        form.querySelectorAll(".wiki-edit-character-only").forEach((el) => {
            el.hidden = !isChar;
        });
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const publishAfterSave = !!form.querySelector("#wikiPublishCheck")?.checked;
        void submitEditor(form, draft, isNew, bookId, (saved) => onSave(saved, publishAfterSave));
    });

    form.querySelector("#wikiEditCancel")?.addEventListener("click", onCancel);

    form.querySelector("#wikiUnpublishBtn")?.addEventListener("click", () => {
        void buildFromForm(form, draft, isNew, bookId).then((saved) => onUnpublish(saved));
    });
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

    const isCharacter = kind === "character";

    return normalizeEntry(
        {
            name: title,
            aliases,
            pronouns: isCharacter ? form.querySelector("#wikiEditPronouns")?.value || "" : "",
            status: isCharacter ? form.querySelector("#wikiEditStatus")?.value || "alive" : "unknown",
            notes: form.querySelector("#wikiEditBody")?.value || "",
            appearance: isCharacter
                ? {
                      age: form.querySelector("#wikiEditAge")?.value || "",
                      eyes: form.querySelector("#wikiEditEyes")?.value || "",
                      hair: form.querySelector("#wikiEditHair")?.value || "",
                      height: form.querySelector("#wikiEditHeight")?.value || "",
                      skin: form.querySelector("#wikiEditSkin")?.value || "",
                      build: form.querySelector("#wikiEditBuild")?.value || "",
                      distinctive: form.querySelector("#wikiEditDistinctive")?.value || "",
                  }
                : {},
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
