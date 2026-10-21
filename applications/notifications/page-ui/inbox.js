import { NOTIFICATION_PAGE_SIZE } from "../../../core/notifications/client.js";
import { renderNotification } from "./render.js";


export function mountInbox(service) {
const el = id => document.getElementById(id);
const status = el("inbox-status");
const list = el("inbox-list");
let userId = "", rows = [], cursor = "", unreadOnly = false, hasMore = false;
let listError = false;
let loading = false, bulkSaving = false, preferenceSaving = false, preferencesDirty = false;
let generation = 0, syncGeneration = 0, lastVersion = -1, latestId = "0", needsInitial = true;

function updateControls(state = service.getState()) {
    el("mark-all-read").disabled = !state.userId || !state.unreadCount || bulkSaving || Boolean(state.error);
    el("refresh-inbox").disabled = loading;
    el("inbox-more").hidden = !hasMore;
    el("inbox-more").disabled = loading;
    el("preferences-fields").disabled = !state.userId || state.loading || Boolean(state.error) || preferenceSaving;
}
function setPreferences(value) {
    el("pref-followers").checked = value.newFollowers;
    el("pref-authors").checked = value.authorAnnouncements;
    el("pref-site").checked = value.siteUpdates;
    el("pref-books").checked = value.newBooks;
    el("pref-chapters").checked = value.newChapters;
}
function drawRows() {
    list.replaceChildren(...rows.map(entry => renderNotification(entry, { onOpen: openEntry, onToggle: toggleEntry })));
    el("inbox-empty").hidden = Boolean(rows.length || loading || listError || service.getState().error);
    el("inbox-empty-heading").textContent = unreadOnly ? "You’re all caught up" : "No notifications yet";
    el("inbox-empty-copy").textContent = unreadOnly
        ? "There are no unread notifications in this view."
        : el("inbox-category").value ? "There are no notifications in this category." : "New follows, books, chapters, and announcements will appear here.";
}
async function load(reset = true) {
    if (!userId || (loading && !reset)) return;
    const request = ++generation, account = userId;
    syncGeneration++;
    loading = true;
    listError = false;
    status.textContent = "Loading notifications…";
    list.setAttribute("aria-busy", "true");
    updateControls();
    try {
        const page = await service.list({
            unreadOnly, kind: el("inbox-category").value, before: reset ? "" : cursor,
        });
        if (request !== generation || account !== userId) return;
        const existing = new Set(reset ? [] : rows.map(row => row.id));
        rows = [...(reset ? [] : rows), ...page.filter(row => !existing.has(row.id))];
        cursor = page.at(-1)?.id || (reset ? "" : cursor);
        hasMore = page.length === NOTIFICATION_PAGE_SIZE;
        if (reset) el("new-notifications").hidden = true;
        status.textContent = "";
    } catch (error) {
        if (request !== generation || account !== userId) return;
        listError = true;
        status.textContent = error.message || "Could not load your inbox. Refresh to try again.";
    } finally {
        if (request === generation && account === userId) {
            loading = false;
            list.setAttribute("aria-busy", "false");
            drawRows();
            updateControls();
        }
    }
}
async function syncRows() {
    if (!rows.length || loading) return;
    const request = ++syncGeneration, account = userId, view = generation;
    try {
        const fresh = await service.getByIds(rows.map(row => row.id));
        if (request !== syncGeneration || account !== userId || view !== generation) return;
        const byId = new Map(fresh.map(row => [row.id, row]));
        rows = rows.map(row => byId.get(row.id)).filter(row => row && (!unreadOnly || !row.readAt));
        drawRows();
    } catch { /* Summary/poll errors are reported by the shared service. */ }
}
async function openEntry(entry, button) {
    const account = userId;
    button.disabled = true;
    status.textContent = "";
    try {
        const destination = await service.resolveDestination(entry);
        if (!entry.readAt) await service.setRead(entry.id, true);
        if (account !== userId) return;
        rows = rows.map(row => row.id === entry.id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row)
            .filter(row => !unreadOnly || !row.readAt);
        drawRows();
        if (destination) window.location.assign(destination);
    } catch (error) {
        if (account === userId) status.textContent = error.message || "Could not open this notification.";
    } finally { button.disabled = false; }
}
async function toggleEntry(entry, button) {
    const account = userId, isRead = !entry.readAt;
    button.disabled = true;
    status.textContent = "";
    try {
        await service.setRead(entry.id, isRead);
        if (account !== userId) return;
        rows = rows.map(row => row.id === entry.id ? { ...row, readAt: isRead ? new Date().toISOString() : null } : row)
            .filter(row => !unreadOnly || !row.readAt);
        drawRows();
    } catch (error) {
        if (account === userId) status.textContent = error.message || "Could not change the read status.";
    } finally { button.disabled = false; }
}
function setView(unread) {
    unreadOnly = unread;
    el("view-all").setAttribute("aria-pressed", unread ? "false" : "true");
    el("view-unread").setAttribute("aria-pressed", unread ? "true" : "false");
    rows = [];
    hasMore = false;
    drawRows();
    void load(true);
}
el("view-all").addEventListener("click", () => setView(false));
el("view-unread").addEventListener("click", () => setView(true));
el("inbox-category").addEventListener("change", () => setView(unreadOnly));
el("refresh-inbox").addEventListener("click", () => { void service.refresh(); void load(true); });
el("new-notifications").addEventListener("click", () => void load(true));
el("inbox-more").addEventListener("click", () => void load(false));
el("mark-all-read").addEventListener("click", async () => {
    if (bulkSaving) return;
    const account = userId, throughId = service.getState().latestId;
    bulkSaving = true;
    updateControls();
    try {
        await service.markAllRead(throughId);
        if (account === userId) await load(true);
    } catch (error) {
        if (account === userId) status.textContent = error.message || "Could not mark notifications as read.";
    } finally { bulkSaving = false; updateControls(); }
});
el("notification-preferences-form").addEventListener("change", () => { preferencesDirty = true; });
el("notification-preferences-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (preferenceSaving) return;
    const account = userId;
    preferenceSaving = true;
    el("preferences-status").textContent = "Saving preferences…";
    updateControls();
    try {
        const saved = await service.savePreferences({
            newFollowers: el("pref-followers").checked,
            authorAnnouncements: el("pref-authors").checked,
            siteUpdates: el("pref-site").checked,
            newBooks: el("pref-books").checked, newChapters: el("pref-chapters").checked,
        });
        if (account !== userId) return;
        preferencesDirty = false;
        setPreferences(saved);
        el("preferences-status").textContent = "Preferences saved.";
    } catch (error) {
        if (account === userId) el("preferences-status").textContent = error.message || "Could not save preferences.";
    } finally { preferenceSaving = false; updateControls(); }
});
if (window.location.hash === "#preferences") el("preferences-panel").open = true;
window.addEventListener("hashchange", () => { if (window.location.hash === "#preferences") el("preferences-panel").open = true; });
window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });

const unsubscribe = service.subscribe(state => {
    if (state.userId !== userId) {
        userId = state.userId;
        generation++;
        syncGeneration++;
        rows = [];
        cursor = "";
        hasMore = false;
        loading = false;
        preferencesDirty = false;
        needsInitial = true;
        latestId = "0";
        lastVersion = -1;
        list.replaceChildren();
        el("notification-preferences-form").reset();
        el("preferences-status").textContent = "";
        el("new-notifications").hidden = true;
    }
    el("inbox-content").hidden = !state.userId;
    el("inbox-sign-in").hidden = !state.ready || Boolean(state.userId);
    el("inbox-unread-count").textContent = state.userId
        ? state.unreadCount + " unread" : "Updates, announcements, and new followers.";
    updateControls(state);
    if (!state.ready) { status.textContent = "Checking your inbox…"; return; }
    if (!state.userId) { status.textContent = state.error || "Sign in to see your private notifications."; return; }
    if (!preferencesDirty && !preferenceSaving) setPreferences(state.preferences);
    if (state.loading) { status.textContent = "Loading notifications…"; return; }
    if (state.error) { status.textContent = state.error; return; }
    if (needsInitial) {
        needsInitial = false;
        latestId = state.latestId;
        lastVersion = state.version;
        void load(true);
        return;
    }
    if (lastVersion === state.version) return;
    lastVersion = state.version;
    if (latestId !== state.latestId) {
        latestId = state.latestId;
        if (!loading && rows.length <= NOTIFICATION_PAGE_SIZE) void load(true);
        else el("new-notifications").hidden = false;
    } else void syncRows();
});

return unsubscribe;
}
