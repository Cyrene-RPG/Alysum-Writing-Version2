import {
    createBookVersion,
    formatVersionWhen,
    listBookVersions,
    restoreBookVersion,
    sourceLabel,
} from "@alysum/writing-engine/version-api.js";
import { downloadBookZip } from "./export-zip.js";
import { openManuscriptDialog } from "./manuscript-dialog.js";
import { bookEditorsError } from "@alysum/collaboration/book-editors-client.js";

let editorsApiPromise = null;
function editorsModule() {
    if (!editorsApiPromise) {
        editorsApiPromise = import("@alysum/collaboration/book-editors.js").catch(error => { editorsApiPromise = null; throw error; });
    }
    return editorsApiPromise;
}

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
    let collaborators = { owner: null, editors: [], isOwner: false };
    let collaboratorsReady = false;
    let collaboratorsRequest = 0;
    const ownsBook = () => isLocal || String(getBook()?.user_id || "") === String(userId);

    mount.innerHTML = `
        <article class="s-block" id="collabBlock">
            <div class="s-block-head"><h2>Collaborators</h2></div>
            <p class="s-sub">Editors can write in this book with you. There is no viewer-only invite.</p>
            <div id="collabList"></div>
            <p id="collabStatus" class="s-sub" role="status"></p><button type="button" class="v-save-btn" id="collabRetry" hidden>Retry collaborators</button>
            <button type="button" class="invite-btn" id="inviteBtn">+ Invite editor</button>
        </article>
        <article class="s-block" id="versionBlock">
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
            <button type="button" class="export-btn" id="exportManuscriptBtn">Manuscript .docx…</button>
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
    const collabStatus = mount.querySelector("#collabStatus");
    const collabRetry = mount.querySelector("#collabRetry");
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
            displayName: ownsBook() ? "You" : "Book owner",
            role: "owner",
            isYou: ownsBook(),
        };
        const rows = [owner, ...(collaborators.editors || [])];
        collabList.innerHTML = rows.map((row) => {
            const name = row.displayName || "Editor";
            const you = row.isYou ? " (you)" : "";
            const canRevoke = collaborators.isOwner && row.role === "editor" && row.userId;
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
                        ? `<button type="button" class="revoke-btn" data-revoke="${escapeHtml(row.userId)}">Remove</button>`
                        : `<span class="role-tag">${row.role === "owner" ? "Owner" : "Editor"}</span>`}
                </div>`;
        }).join("");
        inviteBtn.hidden = !ownsBook();
        inviteBtn.disabled = !collaboratorsReady || !collaborators.isOwner;
        if (isLocal) {
            inviteBtn.hidden = false;
            inviteBtn.textContent = "Invites need a signed-in account";
            inviteBtn.disabled = true;
        }
    }

    async function refreshCollaborators() {
        const request=++collaboratorsRequest;
        collaboratorsReady=false;inviteBtn.disabled=true;collabRetry.hidden=true;
        if(isLocal){
            collaborators={owner:{displayName:"You",role:"owner",isYou:true},editors:[],isOwner:true};
            paintCollaborators();collabStatus.textContent="";return;
        }
        collabStatus.textContent="Loading collaborator permissions…";
        try{
            const collab=await editorsModule();
            const next=await collab.listBookCollaborators(bookId);
            if(request!==collaboratorsRequest)return;
            collaborators=next;collaboratorsReady=true;paintCollaborators();collabStatus.textContent="";
        }catch(error){
            if(request!==collaboratorsRequest)return;
            collaborators={owner:null,editors:[],isOwner:false};paintCollaborators();
            collabRetry.hidden=false;
            collabStatus.textContent=bookEditorsError(error).message;
        }
    }

    async function refreshVersions() {
        if(!ownsBook()){
            versionCount.textContent="Version history is managed by the book owner.";
            mount.querySelector("#saveVersionBtn").hidden=true;
            versionPills.hidden=true;versionList.replaceChildren();return;
        }
        try {
            versions = await listBookVersions({
                supabase,
                isLocalStudio: isLocal,
                bookId,
            });
        } catch (error) {
            versionCount.textContent=String(error?.message || "Could not load version history.");
            return;
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

    collabRetry.addEventListener("click",()=>void refreshCollaborators());

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

    mount.querySelector("#exportManuscriptBtn")?.addEventListener("click", () => {
        openManuscriptDialog({ getBook, flushSave });
    });

    mount.querySelector("#libraryPreviewBtn")?.addEventListener("click", () => onLibraryPreview?.());

    collabList.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-revoke]");
        if (!btn || btn.disabled || !collaboratorsReady || !collaborators.isOwner) return;
        btn.disabled = true;
        try {
            const collab = await editorsModule();
            if (!collab) throw new Error("Invites are not available yet.");
            await collab.revokeBookEditor(bookId, btn.dataset.revoke);
            await refreshCollaborators();
        } catch (err) {
            window.alert(bookEditorsError(err).message);
        } finally {
            btn.disabled = false;
        }
    });

    inviteBtn?.addEventListener("click", () => {
        if (inviteBtn.disabled) return;
        if(!collaboratorsReady || !collaborators.isOwner)return;
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
            const collab = await editorsModule();
            if (!collab) throw new Error("book_editors");
            if(!collaboratorsReady || !collaborators.isOwner)throw new Error("Reload collaborator permissions before inviting.");
            const created = await collab.createBookEditorInvite(bookId, inviteEmail?.value || "");
            lastInviteUrl = created.url;
            if (inviteLinkText) inviteLinkText.textContent = lastInviteUrl;
            inviteLinkRow?.removeAttribute("hidden");
            inviteCreate.classList.add("hidden");
            inviteCopy?.classList.remove("hidden");
        } catch (err) {
            inviteError.hidden = false;
            inviteError.textContent = bookEditorsError(err).message;
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
            inviteError.hidden=false;
            inviteError.textContent="Could not copy automatically. Select and copy the invite link above.";
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

