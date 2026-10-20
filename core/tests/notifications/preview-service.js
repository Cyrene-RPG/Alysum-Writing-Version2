// Developer fixture: sample state only. No Supabase imports or live requests.
import { mountInbox } from "/applications/notifications/page-ui/inbox.js";
import { mountNotificationBell } from "/site-appearance/js-runtime/notification-bell.js";
const listeners = new Set();
let rows = [
    { id: "3", kind: "follower", title: "New follower", message: "Mira started following you.", createdAt: new Date().toISOString(), readAt: null },
    { id: "2", kind: "author_announcement", title: "Rowan posted an announcement", message: "An update from the writing desk", createdAt: new Date(Date.now()-3600000).toISOString(), readAt: null },
    { id: "1", kind: "site_update", title: "Alysum update", message: "Improvements to the Library", createdAt: new Date(Date.now()-86400000).toISOString(), readAt: new Date().toISOString() },
];
let preferences = { newFollowers: true, authorAnnouncements: true, siteUpdates: false };
let version = 1;
function state() { return { ready: true, userId: "sample-user", loading: false, unreadCount: rows.filter(row=>!row.readAt).length, latestId: rows[0]?.id || "0", recent: rows.slice(0,8), preferences, error: "", version }; }
function emit() { version++; listeners.forEach(fn=>fn(state())); }
const service = {
    getState: state,
    subscribe(fn) { listeners.add(fn); fn(state()); return ()=>listeners.delete(fn); },
    async refresh() {},
    async list({ unreadOnly, kind, before }) { return rows.filter(row=>(!unreadOnly||!row.readAt)&&(!kind||row.kind===kind)&&(!before||Number(row.id)<Number(before))); },
    async getByIds(ids) { return rows.filter(row=>ids.includes(row.id)); },
    async resolveDestination() { return null; },
    async setRead(id,isRead) { rows=rows.map(row=>row.id===id?{...row,readAt:isRead?new Date().toISOString():null}:row);emit(); },
    async markAllRead(through) { rows=rows.map(row=>Number(row.id)<=Number(through)?{...row,readAt:new Date().toISOString()}:row);emit(); },
    async savePreferences(value) { preferences=value;emit();return value; },
};
document.title = "Sample inbox — layout check";
document.getElementById("welcomePfpInitial").textContent = "A";
mountNotificationBell({ service });
mountInbox(service);
