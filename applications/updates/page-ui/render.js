import { UPDATE_CATEGORIES, announcementUrl, authorUpdatesUrl } from "../../../core/publishing/announcements.js";

export function renderAnnouncement(post, { detail = false, authorName = "Author" } = {}) {
    const article = document.createElement("article");
    article.className = "update-card";
    const category = document.createElement("span");
    category.className = "update-category";
    category.textContent = UPDATE_CATEGORIES[post.category] || "Announcement";
    const heading = document.createElement("h2");
    if (detail) heading.textContent = post.title;
    else {
        const link = document.createElement("a");
        link.href = announcementUrl(post.id);
        link.textContent = post.title;
        heading.append(link);
    }
    const meta = document.createElement("p");
    meta.className = "update-meta";
    meta.append(post.scope === "site" ? "Alysum" : authorName);
    if (post.publishedAt) {
        const date = new Date(post.publishedAt);
        if (!Number.isNaN(date.getTime())) {
            const time = document.createElement("time");
            time.dateTime = date.toISOString();
            time.textContent = date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
            meta.append(" · ", time);
        }
    } else meta.append(" · Unpublished preview");
    const body = document.createElement("p");
    body.className = "update-body";
    const text = String(post.body || "");
    body.textContent = detail || text.length <= 280 ? text : text.slice(0, 280) + "…";
    const links = document.createElement("div");
    links.className = "update-links";
    if (!detail) {
        const read = document.createElement("a");
        read.href = announcementUrl(post.id);
        read.textContent = "Read update";
        links.append(read);
    }
    if (post.scope === "author") {
        const author = document.createElement("a");
        author.href = authorUpdatesUrl(post.authorId);
        author.textContent = "All updates from this author";
        links.append(author);
    }
    if (post.bookId) {
        const book = document.createElement("a");
        book.href = "/book?id=" + encodeURIComponent(post.bookId);
        book.textContent = "View book";
        links.append(book);
    }
    article.append(category, heading, meta, body, links);
    return article;
}
