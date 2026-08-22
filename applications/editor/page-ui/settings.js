import {
    createBookVersion,
    formatVersionWhen,
    listBookVersions,
    restoreBookVersion,
    sourceLabel,
} from "@alysum/writing-engine/version-api.js";
import {
    createBookEditorInvite,
    isBookEditorsSchemaMissing,
    listBookCollaborators,
    revokeBookEditor,
} from "@alysum/collaboration/book-editors.js";
import { downloadBookZip } from "./export-zip.js";

const PILLS = [
    { id: "all", label: "All" },
    { id: "manual", label: "Manual" },
    { id: "auto", label: "Auto" },
    { id: "checkpoint", label: "Checkpoints" },
    { id: "structural", label: "Structure" },
];

function initial(name) {
    const letter = String(name || "?").trim().charAt(0).toUpperCase();
    return letter || "?";
}

export function mountBookSettings({
    mount,
    bookId,
    session,
    supabase,
    getBook,
    confirmRestore,
    onRestored,
    updateBook,
    flushSave,
    onLibraryPreview,
}) {
    if (!mount) return { refresh() {} };
    const isLocal = session?.mode !== "cloud";
    const userId = session?.user?.id || "";
    let filter = "all";
    let versions = [];
    let collaborators = { owner: null, editors: [], isOwner: true };

    mount.innerHTML = `
        <article class="s-block" id="collabBlock">
            <div class="s-block-head"><h2>Collaborators</h2></div>
            <p class="s-sub">Editors can write in this book with you. There is no viewer-only invite.</p>
            <div id="collabList"></div>
            <button type="button" class="invite-btn" id="inviteBtn">+ Invite editor</button>
        </article>
        <article class="s-block">
            <div class="s-block-head"><h2>Version history</h2></div>
            <p class="s-sub">Save a snapshot, then restore if you need an earlier draft.</p>
            <button type="button" class="v-save-btn" id="saveVersionBtn">Save version…</button>
            <div class="v-pills" id="versionPills"></div>
            <p class="v-count" id="versionCount"></p>
            <div id="versionList"></div>
        </article>
        <article class="s-block">
            <div class="s-block-head"><h2>Export</h2></div>
            <p class="s-sub">One .doc file per chapter, packed into a zip.</p>
            <button type="button" class="export-btn" id="exportZipBtn">Download as .zip</button>
            <p class="export-note" id="exportNote"></p>
        </article>
        <article class="s-block">
            <button type="button" class="lib-link" id="libraryPreviewBtn">
                <span>
                    <h2>Library preview</h2>
                    <p class="s-sub" style="margin:6px 0 0">How this book will look when readers find it.</p>
                </span>
                <span aria-hidden="true">›</span>
            </button>
        </article>
    `;

    const collabList = mount.querySelector("#collabList");
    const inviteBtn = mount.querySelector("#inviteBtn");
    const versionPills = mount.querySelector("#versionPills");
    const versionList = mount.querySelector("#versionList");
    const versionCount = mount.querySelector("#versionCount");
    const exportNote = mount.querySelector("#exportNote");
    const overlay = document.getElementById("inviteOverlay");
    const inviteEmail = document.getElementById("inviteEmail");
    const inviteError = document.getElementById("inviteError");
    const inviteLinkRow = document.getElementById("inviteLinkRow");
    const inviteLinkText = document.getElementById("inviteLinkText");
    const inviteCreate = document.getElementById("inviteCreate");
    const inviteCopy = document.getElementById("inviteCopy");
    const inviteClose = document.getElementById("inviteClose");
    let lastInviteUrl = "";

    function paintPills() {
        versionPills.innerHTML = PILLS.map((pill) => (
            `<button type="button" class="v-pill${filter === pill.id ? " is-on" : ""}" data-filter="${pill.id}">${pill.label}</button>`
        )).join("");
    }

    function paintVersions() {
        const rows = filter === "all" ? versions : versions.filter((row) => row.source === filter);
        versionCount.textContent = rows.length ? `${rows.length} version${rows.length === 1 ? "" : "s"}` : "No versions yet";
        versionList.innerHTML = rows.map((row) => `
            <div class="v-row">
                <div>
                    <div class="v-label">${escapeHtml(row.label || sourceLabel(row.source))}</div>
                    <div class="v-time">${escapeHtml(sourceLabel(row.source))} · ${escapeHtml(formatVersionWhen(row.created_at))} · ${Number(row.word_count) || 0} words</div>
                </div>
                <button type="button" class="restore-btn" data-restore="${escapeHtml(row.id)}">Restore</button>
            </div>
        `).join("");
    }

    function paintCollaborators() {
        const owner = collaborators.owner || {
            display_name: session?.user?.email || "You",
            role: "owner",
            is_you: true,
        };
        const rows = [owner, ...(collaborators.editors || [])];
        collabList.innerHTML = rows.map((row) => {
            const name = row.display_name || row.email || "Editor";
            const you = row.is_you ? " (you)" : "";
            const canRevoke = collaborators.isOwner && row.role === "editor" && row.user_id;
            return `
                <div class="collab-row">
                    <div class="collab-who">
                        <span class="collab-avatar">${escapeHtml(initial(name))}</span>
                        <div>
                            <div class="collab-name">${escapeHtml(name)}${you}</div>
                            <div class="collab-role">${row.role === "owner" ? "Owner" : "Editor"}</div>
                        </div>
                    </div>
                    ${canRevoke
                        ? `<button type="button" class="revoke-btn" data-revoke="${escapeHtml(row.user_id)}">Remove</button>`
                        : `<span class="role-tag">${row.role === "owner" ? "Owner" : "Editor"}</span>`}
                </div>`;
        }).join("");
        inviteBtn.hidden = isLocal || !collaborators.isOwner;
        if (isLocal) {
            inviteBtn.hidden = false;
            inviteBtn.textContent = "Invites need a signed-in account";
            inviteBtn.disabled = true;
        }
    }

    async function refreshCollaborators() {
        if (isLocal) {
            collaborators = {
                owner: { display_name: "You", role: "owner", is_you: true },
                editors: [],
                isOwner: true,
            };
            paintCollaborators();
            return;
        }
        try {
            collaborators = await listBookCollaborators(bookId);
        } catch (err) {
            collaborators = {
                owner: { display_name: session?.user?.email || "You", role: "owner", is_you: true },
                editors: [],
                isOwner: true,
            };
            if (!isBookEditorsSchemaMissing(err)) {
                inviteBtn.disabled = false;
            }
        }
        paintCollaborators();
    }

    async function refreshVersions() {
        try {
            versions = await listBookVersions({
                supabase,
                isLocalStudio: isLocal,
                bookId,
            });
        } catch {
            versions = [];
        }
        paintPills();
        paintVersions();
    }

    function openInvite() {
        lastInviteUrl = "";
        if (inviteEmail) inviteEmail.value = "";
        if (inviteError) {
            inviteError.hidden = true;
            inviteError.textContent = "";
        }
        inviteLinkRow?.setAttribute("hidden", "");
        inviteCreate?.classList.remove("hidden");
        inviteCopy?.classList.add("hidden");
        if (overlay) overlay.hidden = false;
        inviteEmail?.focus();
    }

    function closeInvite() {
        if (overlay) overlay.hidden = true;
    }

    versionPills.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-filter]");
        if (!btn) return;
        filter = btn.dataset.filter;
        paintPills();
        paintVersions();
    });

    versionList.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-restore]");
        if (!btn) return;
        const ok = confirmRestore ? await confirmRestore() : window.confirm("Restore this version?");
        if (!ok) return;
        btn.disabled = true;
        try {
            await flushSave?.();
            const book = getBook();
            await restoreBookVersion({
                supabase,
                isLocalStudio: isLocal,
                userId,
                bookId,
                book,
                versionId: btn.dataset.restore,
                updateBook,
            });
            await onRestored?.();
            await refreshVersions();
        } catch (err) {
            window.alert(String(err?.message || err || "Couldn't restore."));
        } finally {
            btn.disabled = false;
        }
    });

    mount.querySelector("#saveVersionBtn")?.addEventListener("click", async () => {
        try {
            await flushSave?.();
            const book = getBook();
            await createBookVersion({
                supabase,
                isLocalStudio: isLocal,
                userId,
                bookId,
                book,
                label: `Manual save · ${formatVersionWhen(new Date().toISOString())}`,
                source: "manual",
            });
            await refreshVersions();
        } catch (err) {
            window.alert(String(err?.message || err || "Couldn't save a version."));
        }
    });

    mount.querySelector("#exportZipBtn")?.addEventListener("click", async () => {
        exportNote.textContent = "";
        try {
            await flushSave?.();
            await downloadBookZip(getBook());
            exportNote.textContent = "Download started.";
        } catch (err) {
            exportNote.textContent = String(err?.message || err || "Couldn't export.");
        }
    });

    mount.querySelector("#libraryPreviewBtn")?.addEventListener("click", () => onLibraryPreview?.());

    collabList.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-revoke]");
        if (!btn) return;
        try {
            await revokeBookEditor(bookId, btn.dataset.revoke);
            await refreshCollaborators();
        } catch (err) {
            window.alert(String(err?.message || err || "Couldn't remove editor."));
        }
    });

    inviteBtn?.addEventListener("click", () => {
        if (inviteBtn.disabled) return;
        openInvite();
    });
    inviteClose?.addEventListener("click", closeInvite);
    overlay?.addEventListener("click", (event) => {
        if (event.target === overlay) closeInvite();
    });
    inviteCreate?.addEventListener("click", async () => {
        inviteError.hidden = true;
        inviteCreate.disabled = true;
        try {
            const created = await createBookEditorInvite(bookId, inviteEmail?.value || "");
            lastInviteUrl = created.url;
            if (inviteLinkText) inviteLinkText.textContent = lastInviteUrl;
            inviteLinkRow?.removeAttribute("hidden");
            inviteCreate.classList.add("hidden");
            inviteCopy?.classList.remove("hidden");
        } catch (err) {
            inviteError.hidden = false;
            inviteError.textContent = isBookEditorsSchemaMissing(err)
                ? "Run supabase-book-editors.sql on the live database first."
                : String(err?.message || err || "Couldn't create invite.");
        } finally {
            inviteCreate.disabled = false;
        }
    });
    inviteCopy?.addEventListener("click", async () => {
        if (!lastInviteUrl) return;
        try {
            await navigator.clipboard.writeText(lastInviteUrl);
            inviteCopy.textContent = "Copied";
            setTimeout(() => { inviteCopy.textContent = "Copy link"; }, 1400);
        } catch {
            /* ignore */
        }
    });

    paintPills();
    paintCollaborators();
    void refreshCollaborators();
    void refreshVersions();

    return {
        refresh() {
            void refreshCollaborators();
            void refreshVersions();
        },
    };
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
