import { supabase } from "/core/authentication/client.js";
import { resolveStudioSession } from "/core/desktop/studio-session.js";
import {
    getAnnouncementAccess, listOwnAnnouncements, listAnnouncementBooks, saveAnnouncement,
    validateAnnouncement, announcementUrl, UPDATE_PAGE_SIZE,
} from "/core/publishing/announcements.js";
import { renderAnnouncement } from "./render.js";

const element = id => document.getElementById(id);
const form = element("update-form");
const status = element("save-status");
const fields = {
    scope: element("update-scope"), category: element("update-category"),
    title: element("update-title"), body: element("update-body"), bookId: element("update-book"),
};
let userId = "";
let isActive = true;
let isSaving = false;
let isDirty = false;
let current = { id: "", updatedAt: null, status: "draft" };
let ownOffset = 0;
let listGeneration = 0;
let isLoadingList = false;

function updateControls() {
    for (const control of form.elements) control.disabled = isSaving || !isActive;
    fields.scope.disabled = isSaving || !isActive || Boolean(current.updatedAt);
    element("new-update").disabled = isSaving;
    element("publish-update").hidden = current.status === "published";
    element("save-update").textContent = current.status === "published" ? "Save changes" : "Save draft";
    element("publication-note").textContent = current.status === "published"
        ? "This update is public. Saving changes edits the same post."
        : "Drafts are visible only to you. Published posts are public.";
    element("audience-note").textContent = fields.scope.value === "site"
        ? "A public Alysum changelog entry, published by admin staff."
        : "A public author announcement for readers to discover.";
    element("book-field").hidden = fields.scope.value !== "author";
}

function readInput() {
    return {
        id: current.id, updatedAt: current.updatedAt,
        scope: fields.scope.value, category: fields.category.value,
        title: fields.title.value, body: fields.body.value,
        bookId: fields.scope.value === "author" ? fields.bookId.value : "",
    };
}

function canLeave() {
    return !isDirty || window.confirm("Discard the unsaved changes in this update?");
}

function openPost(post = null) {
    if (isSaving || !canLeave()) return;
    if (post && ![...fields.scope.options].some(option => option.value === post.scope)) {
        status.textContent = "Your account no longer has permission to edit this update.";
        return;
    }
    current = post || { id: "", updatedAt: null, status: "draft" };
    fields.scope.value = post?.scope || fields.scope.options[0]?.value || "";
    fields.category.value = post?.category || "announcement";
    fields.title.value = post?.title || "";
    fields.body.value = post?.body || "";
    // Keep an old book selection editable even if it is no longer listed.
    if (post?.bookId && ![...fields.bookId.options].some(option => option.value === post.bookId)) {
        const option = document.createElement("option");
        option.value = post.bookId;
        option.textContent = "Previously linked book (remove if unavailable)";
        fields.bookId.append(option);
    }
    fields.bookId.value = post?.bookId || "";
    isDirty = false;
    element("composer-heading").textContent = post ? "Edit update" : "New update";
    element("preview-panel").hidden = true;
    element("published-link").hidden = post?.status !== "published";
    if (post?.status === "published") element("published-link").href = announcementUrl(post.id);
    status.textContent = "";
    updateControls();
    fields.title.focus();
}

function renderSaved(post) {
    const item = document.createElement("div");
    item.className = "saved-item";
    const title = document.createElement("h3");
    title.textContent = post.title;
    const note = document.createElement("p");
    note.textContent = (post.scope === "site" ? "Alysum update" : "Author update")
        + " · " + (post.status === "published" ? "Published" : "Private draft");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openPost(post));
    item.append(title, note, edit);
    if (post.status === "published") {
        const view = document.createElement("a");
        view.href = announcementUrl(post.id);
        view.textContent = " View";
        item.append(" ", view);
    }
    return item;
}

async function loadOwn(reset = false) {
    if (isLoadingList && !reset) return;
    const request = ++listGeneration;
    if (reset) { ownOffset = 0; element("saved-updates").replaceChildren(); }
    const start = ownOffset;
    isLoadingList = true;
    element("more-saved").disabled = true;
    element("saved-status").textContent = "Loading your saved updates…";
    try {
        const posts = await listOwnAnnouncements(supabase, userId, start);
        if (!isActive || request !== listGeneration) return;
        element("saved-updates").append(...posts.map(renderSaved));
        ownOffset = start + posts.length;
        element("more-saved").hidden = posts.length < UPDATE_PAGE_SIZE;
        element("saved-status").textContent = ownOffset ? "" : "No saved updates yet.";
    } catch (error) {
        if (!isActive || request !== listGeneration) return;
        element("saved-status").textContent = error.message || "Could not load saved updates. Refresh the list to try again.";
        element("more-saved").hidden = true;
    } finally {
        if (request === listGeneration) {
            isLoadingList = false;
            element("more-saved").disabled = false;
        }
    }
}

form.addEventListener("input", () => {
    isDirty = true;
    element("preview-panel").hidden = true;
});
fields.scope.addEventListener("change", () => {
    isDirty = true;
    if (fields.scope.value === "site") fields.bookId.value = "";
    updateControls();
});

element("preview-update").addEventListener("click", () => {
    try {
        const input = validateAnnouncement(readInput());
        element("preview-content").replaceChildren(renderAnnouncement({
            ...input, id: current.id, authorId: userId, publishedAt: null,
        }, { detail: true, authorName: "You" }));
        element("preview-panel").hidden = false;
        status.textContent = "Preview ready. Your changes have not been published.";
    } catch (error) { status.textContent = error.message; }
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (isSaving || !isActive) return;
    const publish = event.submitter?.value === "publish";
    try { validateAnnouncement(readInput()); }
    catch (error) { status.textContent = error.message; return; }
    isSaving = true;
    updateControls();
    status.textContent = publish ? "Publishing your update…" : "Saving your update…";
    try {
        const { data, error } = await supabase.auth.getUser();
        if (!isActive) return;
        if (error || data?.user?.id !== userId) throw new Error("Your sign-in changed. Reload before saving.");
        // Reuse this id after an uncertain response so retrying cannot create a second post.
        if (!current.id) current.id = crypto.randomUUID();
        const saved = await saveAnnouncement(supabase, readInput(), { publish });
        if (!isActive) return;
        current = saved;
        isDirty = false;
        element("composer-heading").textContent = "Edit update";
        element("published-link").hidden = saved.status !== "published";
        if (saved.status === "published") element("published-link").href = announcementUrl(saved.id);
        element("preview-panel").hidden = true;
        status.textContent = saved.status === "published" ? "Your update is published." : "Draft saved. Only you can see it.";
        void loadOwn(true);
    } catch (error) {
        if (isActive) status.textContent = error.message || "Could not save. Your text is still here; please try again.";
    } finally {
        isSaving = false;
        if (isActive) updateControls();
    }
});

element("new-update").addEventListener("click", () => openPost());
element("refresh-saved").addEventListener("click", () => void loadOwn(true));
element("more-saved").addEventListener("click", () => void loadOwn());
window.addEventListener("beforeunload", event => {
    if (!isDirty && !isSaving) return;
    event.preventDefault();
    event.returnValue = "";
});
window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });

async function boot() {
    try {
        const session = await resolveStudioSession(supabase);
        if (session.mode !== "cloud") {
            element("access-status").textContent = "Sign in with your Alysum account to write updates.";
            element("sign-in-note").hidden = false;
            return;
        }
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data?.user?.id) {
            element("access-status").textContent = "Sign in to write updates.";
            element("sign-in-note").hidden = false;
            return;
        }
        userId = data.user.id;
        supabase.auth.onAuthStateChange((event, next) => {
            if (next?.user?.id === userId) return;
            isActive = false;
            isDirty = false;
            form.reset();
            element("preview-content").replaceChildren();
            element("saved-updates").replaceChildren();
            element("publisher").hidden = true;
            window.location.reload();
        });
        const access = await getAnnouncementAccess(supabase);
        if (!isActive) return;
        if (!access.canPublishAuthor && !access.canPublishSite) {
            element("access-status").textContent = "Publishing updates is available to eligible author accounts and admin staff.";
            element("sign-in-note").replaceChildren();
            const settings = document.createElement("a");
            settings.href = "/settings#profilePanel";
            settings.textContent = "Review your account settings";
            element("sign-in-note").append(settings);
            element("sign-in-note").hidden = false;
            return;
        }
        for (const [allowed, value, text] of [
            [access.canPublishAuthor, "author", "Author update"],
            [access.canPublishSite, "site", "Alysum update"],
        ]) {
            if (!allowed) continue;
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            fields.scope.append(option);
        }
        element("access-status").textContent = "";
        element("publisher").hidden = false;
        updateControls();
        void loadOwn(true);
        if (access.canPublishAuthor) {
            try {
                const books = await listAnnouncementBooks(supabase, userId);
                if (!isActive) return;
                for (const book of books) {
                    if ([...fields.bookId.options].some(option => option.value === book.id)) continue;
                    const option = document.createElement("option");
                    option.value = book.id;
                    option.textContent = book.title;
                    fields.bookId.append(option);
                }
                element("books-status").textContent = books.length ? "" : "Your publicly listed books will appear here.";
            } catch {
                if (isActive) element("books-status").textContent = "Books could not be loaded. You can still publish without a book link.";
            }
        }
    } catch (error) {
        if (isActive) element("access-status").textContent = (error.message || "Could not check your account.") + " Reload this page to try again.";
    }
}
void boot();
