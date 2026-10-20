import test from "node:test";
import assert from "node:assert/strict";
import {
    listNotifications, getNotificationsByIds, getNotificationSummary, getNotificationPreferences,
    saveNotificationPreferences, setNotificationRead, markNotificationsRead, resolveNotificationDestination,
} from "../../notifications/client.js";

function clientFor(result = { data: [], error: null }) {
    const calls = [], query = {};
    for (const name of ["select", "eq", "lt", "is", "in", "order", "limit", "maybeSingle"]) {
        query[name] = (...args) => { calls.push([name, ...args]); return query; };
    }
    query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return { calls, from(table) { calls.push(["from", table]); return query; },
        async rpc(name, payload) { calls.push(["rpc", name, payload]); return result; } };
}
const row = { id: 42, kind: "follower", actor_id: "reader", title: "New follower",
    message: "Reader started following you.", created_at: "2026-10-20T12:00:00Z", read_at: null };

test("private lists use the new table, recipient scope, keyset cursor and category filters", async () => {
    const client = clientFor({ data: [row] });
    const rows = await listNotifications(client, { userId: "me", before: "100", unreadOnly: true, kind: "follower" });
    assert.equal(rows[0].id, "42");
    assert.equal(rows[0].readAt, null);
    assert.ok(client.calls.some(c => c[0] === "from" && c[1] === "inbox_notifications"));
    for (const filter of [["eq", "recipient_id", "me"], ["lt", "id", "100"], ["is", "read_at", null], ["eq", "kind", "follower"]]) {
        assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(filter)));
    }
    await assert.rejects(listNotifications(client, { userId: "" }), /Sign in/);
    await assert.rejects(listNotifications(client, { userId: "me", before: "not-an-id" }), /Invalid/);
    await assert.rejects(listNotifications(client, { userId: "me", kind: "private-other" }), /category/);
});
test("read mutations pass no recipient or editable content and mark-all retains the caller snapshot", async () => {
    const client = clientFor({ data: 4 });
    await setNotificationRead(client, "42", true);
    await markNotificationsRead(client, "41");
    assert.deepEqual(client.calls, [
        ["rpc", "set_inbox_notification_read", { p_notification_id: "42", p_is_read: true }],
        ["rpc", "mark_inbox_notifications_read", { p_through_id: "41" }],
    ]);
    await assert.rejects(setNotificationRead(client, "42", "true"), /read state/);
    await assert.rejects(markNotificationsRead(client, "-1"), /Invalid/);
});
test("preference defaults opt out of site updates and explicit saves use the authenticated RPC", async () => {
    assert.deepEqual(await getNotificationPreferences(clientFor({ data: null }), "me"), {
        newFollowers: true, authorAnnouncements: true, siteUpdates: false, newBooks: true, newChapters: true,
    });
    const client = clientFor({ data: [{ new_followers: false, author_announcements: true, site_updates: true }] });
    assert.deepEqual(await saveNotificationPreferences(client, { newFollowers: false, authorAnnouncements: true, siteUpdates: true, newBooks: true, newChapters: true }), {
        newFollowers: false, authorAnnouncements: true, siteUpdates: true, newBooks: true, newChapters: true,
    });
    assert.deepEqual(client.calls[0][2], { p_new_followers: false, p_author_announcements: true, p_site_updates: true, p_new_books: true, p_new_chapters: true });
    await assert.rejects(saveNotificationPreferences(client, { siteUpdates: true }), /every category/);
});
test("follower entries have no invented profile destination and removed announcements stay unavailable", async () => {
    const followerClient = clientFor();
    assert.equal(await resolveNotificationDestination(followerClient, { kind: "follower" }), null);
    assert.equal(followerClient.calls.length, 0);
    await assert.rejects(resolveNotificationDestination(clientFor(), { kind: "site_update", announcementId: "" }), /no longer available/);
    await assert.rejects(resolveNotificationDestination(clientFor({ data: null }), { kind: "author_announcement", announcementId: "deleted" }), /no longer available/);
    assert.equal(await resolveNotificationDestination(clientFor({ data: { id: "a&b" } }), { kind: "site_update", announcementId: "a&b" }), "/updates?post=a%26b");
});
test("summary and row refreshes preserve exact ids and remain account-scoped", async () => {
    assert.deepEqual(await getNotificationSummary(clientFor({ data: { unreadCount: 102, latestId: "9007199254740993" } })), {
        unreadCount: 102, latestId: "9007199254740993",
    });
    const client = clientFor();
    await getNotificationsByIds(client, "me", ["42"]);
    assert.ok(client.calls.some(c => c[0] === "eq" && c[1] === "recipient_id" && c[2] === "me"));
});
test("missing migration and permission failures cannot masquerade as empty success", async () => {
    await assert.rejects(getNotificationSummary(clientFor({ error: { code: "PGRST202", message: "Missing function" } })), /not available yet/);
    await assert.rejects(listNotifications(clientFor({ error: { code: "42501", message: "permission denied" } }), { userId: "me" }), /permission denied/);
});
