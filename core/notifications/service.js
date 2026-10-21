import {
    DEFAULT_NOTIFICATION_PREFERENCES, listNotifications, getNotificationsByIds,
    getNotificationSummary, getNotificationPreferences, saveNotificationPreferences,
    setNotificationRead, markNotificationsRead, resolveNotificationDestination,
} from "./client.js";
import { isDesktopLocalHost } from "../desktop/app.js";

const services = new WeakMap();

export function createNotificationService(client, { isEnabled = () => !isDesktopLocalHost() } = {}) {
    if (services.has(client)) return services.get(client);
    const listeners = new Set();
    let epoch = 0, request = 0, channel = null, poll = null, auth = null, started = false;
    const emptyState = () => ({
        ready: false, userId: "", loading: true, unreadCount: 0, latestId: "0",
        recent: [], preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES }, error: "", version: 0,
    });
    let state = emptyState();
    function emit() { listeners.forEach(fn => fn(state)); }
    function removeChannel() {
        if (poll) clearInterval(poll);
        poll = null;
        if (channel) void client.removeChannel(channel);
        channel = null;
    }
    async function refresh() {
        if (!state.userId) return;
        const account = epoch, sequence = ++request, userId = state.userId;
        try {
            const [summary, recent, preferences] = await Promise.all([
                getNotificationSummary(client),
                listNotifications(client, { userId, limit: 8, unreadOnly: true }),
                getNotificationPreferences(client, userId),
            ]);
            if (account !== epoch || sequence !== request) return;
            state = { ...state, ...summary, recent, preferences, error: "", loading: false, version: state.version + 1 };
            emit();
        } catch (error) {
            if (account !== epoch || sequence !== request) return;
            state = { ...state, loading: false, error: error.message || "Could not load notifications." };
            emit();
        }
    }
    function switchUser(user) {
        const userId = isEnabled() ? user?.id || "" : "";
        if (state.ready && userId === state.userId) return;
        epoch++;
        const account = epoch;
        removeChannel();
        state = { ...emptyState(), ready: true, userId, loading: Boolean(userId) };
        emit(); // Clear previous-account content before starting any new request.
        if (!userId) return;
        setTimeout(() => {
            if (account !== epoch || !started) return;
            void refresh();
            channel = client.channel("alysum:inbox:" + userId)
                .on("postgres_changes", { event: "*", schema: "public", table: "inbox_notifications", filter: "recipient_id=eq." + userId }, () => {
                    if (account === epoch) void refresh();
                })
                .on("postgres_changes", { event: "*", schema: "public", table: "notification_preferences", filter: "user_id=eq." + userId }, () => {
                    if (account === epoch) void refresh();
                }).subscribe();
            // Fallback if Realtime is unavailable; also recovers transient network errors.
            poll = setInterval(() => { if (account === epoch) void refresh(); }, 30000);
        }, 0);
    }
    function start() {
        if (started) return;
        started = true;
        auth = client.auth.onAuthStateChange((event, session) => switchUser(session?.user)).data.subscription;
        const initialEpoch = epoch;
        void client.auth.getSession().then(({ data, error }) => {
            if (initialEpoch !== epoch) return;
            if (error) throw error;
            switchUser(data?.session?.user);
        }).catch(() => {
            if (initialEpoch !== epoch) return;
            state = { ...emptyState(), ready: true, loading: false, error: "Could not check your sign-in. Reload to try again." };
            emit();
        });
    }
    async function guard(action) {
        const account = epoch, userId = state.userId;
        if (!userId || !isEnabled()) throw new Error("Sign in to open your inbox.");
        const result = await action(userId);
        if (account !== epoch) throw new Error("Your account changed. Please try again.");
        return result;
    }
    const service = {
        getState: () => state,
        subscribe(fn) {
            listeners.add(fn);
            fn(state);
            start();
            return () => {
                listeners.delete(fn);
                if (!listeners.size) {
                    epoch++;
                    removeChannel();
                    auth?.unsubscribe();
                    auth = null;
                    started = false;
                    state = emptyState();
                }
            };
        },
        refresh,
        list: options => guard(userId => listNotifications(client, { ...options, userId })),
        getByIds: ids => guard(userId => getNotificationsByIds(client, userId, ids)),
        resolveDestination: entry => guard(() => resolveNotificationDestination(client, entry)),
        async setRead(id, isRead) {
            await guard(() => setNotificationRead(client, id, isRead));
            await refresh();
        },
        async markAllRead(throughId) {
            const count = await guard(() => markNotificationsRead(client, throughId));
            await refresh();
            return count;
        },
        async savePreferences(value) {
            const saved = await guard(() => saveNotificationPreferences(client, value));
            await refresh();
            return saved;
        },
    };
    services.set(client, service);
    return service;
}
