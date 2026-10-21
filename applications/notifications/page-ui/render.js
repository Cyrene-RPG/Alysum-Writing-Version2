import { NOTIFICATION_KINDS } from "../../../core/notifications/client.js";

export function renderNotification(entry, { onOpen, onToggle }) {
    const article = document.createElement("article");
    article.className = "inbox-notification" + (!entry.readAt ? " is-unread" : "");
    article.dataset.notificationId = entry.id;
    const icon = document.createElement("span");
    icon.className = "inbox-notification-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ["new_book", "new_chapter"].includes(entry.kind) ? "▤" : entry.kind === "follower" ? "+" : entry.kind === "site_update" ? "◇" : "✎";
    const content = document.createElement("div");
    content.className = "inbox-notification-content";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "inbox-notification-open";
    open.setAttribute("aria-label", entry.title + ". " + entry.message + (entry.readAt ? "" : ". Unread"));
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const message = document.createElement("span");
    message.textContent = entry.message;
    open.append(title, message);
    open.addEventListener("click", () => onOpen(entry, open));
    const meta = document.createElement("div");
    meta.className = "inbox-notification-meta";
    const category = document.createElement("span");
    category.textContent = NOTIFICATION_KINDS[entry.kind] || "Notification";
    const time = document.createElement("time");
    time.dateTime = entry.createdAt;
    const date = new Date(entry.createdAt);
    if (!Number.isNaN(date.getTime())) {
        time.textContent = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        time.title = date.toLocaleString();
    }
    meta.append(category, time);
    content.append(open, meta);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "inbox-read-toggle";
    toggle.textContent = entry.readAt ? "Mark unread" : "Mark read";
    toggle.setAttribute("aria-label", toggle.textContent + ": " + entry.title);
    toggle.addEventListener("click", () => onToggle(entry, toggle));
    article.append(icon, content, toggle);
    return article;
}
