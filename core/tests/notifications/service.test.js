import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationService } from "../../notifications/service.js";

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function fixture() {
    let authHandler;
    const pending = [];
    let defer = false;
    const channelCallbacks = [];
    const client = {
        auth: {
            onAuthStateChange(callback) { authHandler = callback; return { data: { subscription: { unsubscribe() {} } } }; },
            async getSession() { return { data: { session: { user: { id: "A" } } } }; },
        },
        channel() { return { on(type, options, callback) { channelCallbacks.push(callback); return this; }, subscribe() { return this; } }; },
        async removeChannel() {},
        rpc(name) {
            if (name === "get_inbox_summary") {
                if (defer) return new Promise(resolve => pending.push(resolve));
                return Promise.resolve({ data: { unreadCount: 1, latestId: "1" } });
            }
            if (defer) return new Promise(resolve => pending.push(resolve));
            return Promise.resolve({ data: true });
        },
        from(table) {
            let owner = "";
            const q = {
                select() { return q; }, eq(key, value) { if (key === "recipient_id" || key === "user_id") owner = value; return q; },
                order() { return q; }, limit() { return q; }, maybeSingle() { return q; }, in() { return q; },
                then(resolve, reject) {
                    const result = table === "notification_preferences" ? { data: null } : { data: [
                        { id: 1, kind: "follower", title: owner + " private", message: owner, created_at: "2026-10-20T12:00:00Z" },
                    ] };
                    return Promise.resolve(result).then(resolve, reject);
                },
            };
            return q;
        },
    };
    return { client, switchTo(id) { authHandler("SIGNED_IN", id ? { user: { id } } : null); },
        defer() { defer = true; }, resolveAll() { pending.splice(0).forEach(resolve => resolve({ data: true })); },
        resolveSummary() { pending.splice(0).forEach(resolve => resolve({ data: { unreadCount: 99, latestId: "99" } })); },
        get pendingCount() { return pending.length; }, channelCallbacks };
}

test("account changes clear private rows synchronously and discard old refresh responses", async () => {
    const f = fixture(), states = [];
    const service = createNotificationService(f.client, { isEnabled: () => true });
    const stop = service.subscribe(state => states.push(state));
    try {
        await tick();
        assert.equal(service.getState().recent[0].title, "A private");
        f.defer();
        const refreshing = service.refresh();
        f.switchTo("B");
        assert.equal(service.getState().userId, "B");
        assert.deepEqual(service.getState().recent, []);
        f.resolveSummary();
        await refreshing;
        assert.deepEqual(service.getState().recent, []);
        assert.equal(service.getState().unreadCount, 0);
        f.switchTo(null);
        assert.equal(service.getState().userId, "");
        assert.deepEqual(service.getState().recent, []);
    } finally { stop(); }
});
test("a read mutation started under a previous account is rejected after switching", async () => {
    const f = fixture();
    const service = createNotificationService(f.client, { isEnabled: () => true });
    const stop = service.subscribe(() => {});
    try {
        await tick();
        f.defer();
        const change = service.setRead("1", true);
        f.switchTo(null);
        f.resolveAll();
        await assert.rejects(change, /account changed/);
        assert.equal(service.getState().unreadCount, 0);
    } finally { stop(); }
});
test("local-only mode never requests private notifications or opens realtime channels", async () => {
    const f = fixture();
    const service = createNotificationService(f.client, { isEnabled: () => false });
    const stop = service.subscribe(() => {});
    try {
        await tick();
        assert.equal(service.getState().userId, "");
        assert.equal(f.channelCallbacks.length, 0);
        await assert.rejects(service.list({}), /Sign in/);
    } finally { stop(); }
});
test("one shared service is reused by the page and bell", () => {
    const f = fixture();
    assert.equal(createNotificationService(f.client), createNotificationService(f.client));
});
