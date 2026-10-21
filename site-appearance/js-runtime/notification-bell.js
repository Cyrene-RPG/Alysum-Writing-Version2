/**
 * Shared inbox UI. The application supplies the data service; no core imports.
 */
export function mountNotificationBell({ service, host = document.querySelector(".wd-welcome-inner") }) {
    if (!host || document.getElementById("notification-bell")) return;
    if (!document.getElementById("notification-bell-styles")) {
        const link = document.createElement("link");
        link.id = "notification-bell-styles";
        link.rel = "stylesheet";
        link.href = "/site-appearance/css-styles/notification-bell.css";
        document.head.append(link);
    }
    const root = document.createElement("div");
    root.id = "notification-bell";
    root.className = "notification-bell";
    root.hidden = true;
    root.innerHTML = `
        <button class="notification-bell-button" type="button" aria-label="Notifications" aria-expanded="false" aria-controls="notification-bell-panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>
            <span class="notification-bell-badge" hidden></span>
        </button>
        <section class="notification-bell-panel" id="notification-bell-panel" aria-label="Unread notifications" hidden>
            <div class="notification-bell-heading"><h2>Notifications</h2><button class="notification-bell-close" type="button" aria-label="Close notifications">×</button></div>
            <p class="notification-bell-status" role="status" aria-live="polite"></p>
            <div class="notification-bell-list"></div>
            <div class="notification-bell-footer"><a href="/inbox">View all notifications</a><a href="/inbox#preferences">Preferences</a></div>
        </section>`;
    host.append(root);
    const button = root.querySelector(".notification-bell-button");
    const panel = root.querySelector(".notification-bell-panel");
    const badge = root.querySelector(".notification-bell-badge");
    const list = root.querySelector(".notification-bell-list");
    const status = root.querySelector(".notification-bell-status");
    let account = "", signature = "";
    function close() {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
    }
    function closeProfile() {
        const profile = document.getElementById("welcomePfpDropdown");
        if (profile) profile.hidden = true;
        document.getElementById("welcomePfpMenu")?.classList.remove("is-open");
        document.getElementById("welcomePfpBtn")?.setAttribute("aria-expanded", "false");
    }
    const profilePanel = document.getElementById("welcomePfpDropdown");
    let inboxLink = document.getElementById("profile-inbox-link");
    if (profilePanel && !inboxLink) {
        inboxLink = document.createElement("a");
        inboxLink.id = "profile-inbox-link";
        inboxLink.href = "/inbox";
        inboxLink.textContent = "Inbox";
        inboxLink.setAttribute("role", "menuitem");
        inboxLink.addEventListener("click", closeProfile);
        const settings = profilePanel.querySelector('a[href="/settings"], a[href^="settings"]');
        profilePanel.insertBefore(inboxLink, settings || null);
    }
    button.addEventListener("click", () => {
        const opening = panel.hidden;
        closeProfile();
        panel.hidden = !opening;
        button.setAttribute("aria-expanded", opening ? "true" : "false");
        if (opening) void service.refresh();
    });
    root.querySelector(".notification-bell-close").addEventListener("click", () => { close(); button.focus(); });
    document.getElementById("welcomePfpBtn")?.addEventListener("click", close);
    document.addEventListener("click", event => { if (!root.contains(event.target)) close(); });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) { close(); button.focus(); }
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void service.refresh(); });
    service.subscribe(state => {
        root.hidden = !state.userId;
        if (inboxLink) inboxLink.hidden = !state.userId;
        if (account !== state.userId) {
            account = state.userId;
            close();
            list.replaceChildren();
            status.textContent = "";
        }
        const unread = state.recent.filter(item => !item.readAt);
        const nextSignature = JSON.stringify([state.userId, state.loading, state.error, state.unreadCount,
            unread.map(item => [item.id, item.readAt, item.announcementId, item.bookId, item.chapterId])]);
        if (signature === nextSignature) return;
        signature = nextSignature;
        button.setAttribute("aria-label", "Notifications" + (state.unreadCount ? ", " + state.unreadCount + " unread" : ""));
        badge.hidden = !state.unreadCount;
        badge.textContent = state.unreadCount > 99 ? "99+" : String(state.unreadCount);
        status.textContent = state.error || (state.loading ? "Loading notifications…" : unread.length ? "" : "You’re all caught up.");
        list.replaceChildren();
        for (const item of unread) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "notification-bell-item" + (!item.readAt ? " is-unread" : "");
            const title = document.createElement("strong");
            title.textContent = item.title;
            const message = document.createElement("span");
            message.textContent = item.message;
            const time = document.createElement("time");
            time.dateTime = item.createdAt;
            const date = new Date(item.createdAt);
            time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
            row.append(title, message, time);
            row.addEventListener("click", async () => {
                row.disabled = true;
                status.textContent = "";
                try {
                    const destination = await service.resolveDestination(item);
                    if (!item.readAt) await service.setRead(item.id, true);
                    if (destination) window.location.assign(destination);
                } catch (error) {
                    status.textContent = error.message || "Could not open this notification.";
                } finally { row.disabled = false; }
            });
            list.append(row);
        }
    });
}
