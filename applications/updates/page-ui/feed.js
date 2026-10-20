import { supabase } from "/core/authentication/client.js";
import { listPublicAnnouncements, fetchAnnouncementAuthor, UPDATE_PAGE_SIZE } from "/core/publishing/announcements.js";
import { renderAnnouncement } from "./render.js";

const params = new URLSearchParams(window.location.search);
const authorId = params.get("author") || "";
const postId = params.get("post") || "";
const status = document.getElementById("feed-status");
const feed = document.getElementById("update-feed");
const more = document.getElementById("load-more");
const retry = document.getElementById("retry-feed");
const filter = document.getElementById("category-filter");
const empty = document.getElementById("empty-updates");
let offset = 0;
let generation = 0;
let isLoading = false;
const names = new Map();

async function authorName(id) {
    if (!names.has(id)) names.set(id, fetchAnnouncementAuthor(supabase, id));
    return names.get(id);
}

async function load(reset = false) {
    if (isLoading && !reset) return;
    const request = ++generation;
    if (reset) {
        offset = 0;
        feed.replaceChildren();
    }
    isLoading = true;
    const start = offset;
    more.disabled = true;
    retry.hidden = true;
    empty.hidden = true;
    status.textContent = "Loading updates…";
    feed.setAttribute("aria-busy", "true");
    try {
        const rows = await listPublicAnnouncements(supabase, { authorId, postId, category: filter.value, offset: start });
        const articles = await Promise.all(rows.map(async post => renderAnnouncement(post, {
            detail: Boolean(postId),
            authorName: post.scope === "author" ? await authorName(post.authorId) : "Alysum",
        })));
        if (request !== generation) return;
        feed.append(...articles);
        offset = start + rows.length;
        more.hidden = Boolean(postId) || rows.length < UPDATE_PAGE_SIZE;
        status.textContent = "";
        empty.hidden = Boolean(rows.length || start);
        if (!empty.hidden) {
            document.getElementById("empty-heading").textContent = postId ? "Update unavailable" : "No updates yet";
            document.getElementById("empty-copy").textContent = postId
                ? "This update is unavailable or has not been published."
                : filter.value ? "There are no published updates in this category." : "Published announcements will appear here.";
        }
        if (postId && rows[0]) document.title = rows[0].title + " — Alysum";
    } catch (error) {
        if (request !== generation) return;
        status.textContent = error.message || "Could not load updates. Please try again.";
        retry.hidden = false;
        more.hidden = true;
    } finally {
        if (request === generation) {
            isLoading = false;
            more.disabled = false;
            feed.setAttribute("aria-busy", "false");
        }
    }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if ((authorId && !uuid.test(authorId)) || (postId && !uuid.test(postId))) {
    status.textContent = "This update link is invalid.";
    feed.setAttribute("aria-busy", "false");
    filter.disabled = true;
} else {
    if (authorId || postId) {
        document.getElementById("all-updates-link").hidden = false;
        document.getElementById("page-heading").textContent = authorId && !postId ? "Author updates" : "Update";
        document.getElementById("page-kicker").textContent = authorId && !postId ? "From the writing desk" : "From the Alysum community";
        document.getElementById("page-description").textContent = authorId && !postId
            ? "Announcements and notes from this author." : "The latest news, in the writer’s own words.";
        document.title = authorId && !postId ? "Author updates — Alysum" : "Update — Alysum";
    }
    if (postId) document.getElementById("category-label").hidden = true;
    if (authorId && !postId) void authorName(authorId).then(name => {
        document.getElementById("page-heading").textContent = name === "Author" ? "Author updates" : name + "’s updates";
    });
    more.addEventListener("click", () => void load());
    retry.addEventListener("click", () => void load());
    filter.addEventListener("change", () => void load(true));
    void load(true);
}
