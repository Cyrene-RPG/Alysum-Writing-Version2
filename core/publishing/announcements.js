const CATEGORIES = ["new", "improved", "fixed", "announcement"];
export const UPDATE_PAGE_SIZE = 20;
export const UPDATE_CATEGORIES = Object.freeze({
    new: "New", improved: "Improved", fixed: "Fixed", announcement: "Announcement",
});
const COLUMNS = "id,author_id,scope,category,title,body,book_id,status,created_at,updated_at,published_at";

function checkResult(error) {
    if (!error) return;
    const message = String(error.message || "");
    if (/announcements|save_announcement|get_announcement_access/i.test(message)
        && /schema cache|does not exist|could not find/i.test(message)) {
        throw new Error("Updates are not available yet. Please try again later.");
    }
    throw new Error(message || "Could not load updates. Please try again.");
}

export function normalizeAnnouncement(row) {
    if (!row) return null;
    return {
        id: row.id, authorId: row.author_id, scope: row.scope, category: row.category,
        title: row.title, body: row.body, bookId: row.book_id || "",
        status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
        publishedAt: row.published_at || null,
    };
}

export function validateAnnouncement(input) {
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    if (!["site", "author"].includes(input.scope)) throw new Error("Choose an update audience.");
    if (!CATEGORIES.includes(input.category)) throw new Error("Choose an update category.");
    if (!title || Array.from(title).length > 160) throw new Error("Enter a title up to 160 characters.");
    if (!body || Array.from(body).length > 12000) throw new Error("Enter update text up to 12000 characters.");
    const bookId = String(input.bookId || "").trim();
    if (input.scope === "site" && bookId) throw new Error("Book links belong to author updates.");
    return { scope: input.scope, category: input.category, title, body, bookId };
}

export function announcementUrl(id) {
    return "/updates?post=" + encodeURIComponent(id);
}

export function authorUpdatesUrl(authorId) {
    return "/updates?author=" + encodeURIComponent(authorId);
}

export async function listPublicAnnouncements(client, { authorId = "", category = "", offset = 0, postId = "" } = {}) {
    let query = client.from("announcements").select(COLUMNS).eq("status", "published");
    if (postId) query = query.eq("id", postId);
    else if (authorId) query = query.eq("scope", "author").eq("author_id", authorId);
    else query = query.eq("scope", "site");
    if (category && !postId) query = query.eq("category", category);
    const { data, error } = await query.order("published_at", { ascending: false })
        .order("id", { ascending: false }).range(offset, offset + UPDATE_PAGE_SIZE - 1);
    checkResult(error);
    return (data || []).map(normalizeAnnouncement);
}

export async function listOwnAnnouncements(client, authorId, offset = 0) {
    if (!authorId) throw new Error("Sign in to manage updates.");
    const { data, error } = await client.from("announcements").select(COLUMNS)
        .eq("author_id", authorId).order("updated_at", { ascending: false })
        .order("id", { ascending: false }).range(offset, offset + UPDATE_PAGE_SIZE - 1);
    checkResult(error);
    return (data || []).map(normalizeAnnouncement);
}

export async function getAnnouncementAccess(client) {
    const { data, error } = await client.rpc("get_announcement_access");
    checkResult(error);
    return {
        canPublishSite: data?.canPublishSite === true,
        canPublishAuthor: data?.canPublishAuthor === true,
    };
}

export async function saveAnnouncement(client, input, { publish = false } = {}) {
    const value = validateAnnouncement(input);
    if (!input.id) throw new Error("Missing update id.");
    const { data, error } = await client.rpc("save_announcement", {
        p_id: input.id, p_scope: value.scope, p_category: value.category,
        p_title: value.title, p_body: value.body, p_book_id: value.bookId || null,
        p_publish: publish, p_expected_updated_at: input.updatedAt || null,
    });
    checkResult(error);
    const saved = normalizeAnnouncement(Array.isArray(data) ? data[0] : data);
    if (!saved?.id) throw new Error("Could not confirm your saved update. Reopen it from your saved updates.");
    return saved;
}

export async function listAnnouncementBooks(client, authorId) {
    const { data, error } = await client.from("library").select("id,data")
        .eq("user_id", authorId).order("id").limit(200);
    checkResult(error);
    return (data || []).filter(row => row.data?.isPublished !== false && !row.data?.isAnonymous)
        .map(row => ({ id: String(row.id), title: String(row.data?.title || "Untitled") }));
}

export async function fetchAnnouncementAuthor(client, authorId) {
    if (!authorId) return "Author";
    const { data, error } = await client.from("users").select("username,display_name").eq("id", authorId).maybeSingle();
    if (error) return "Author";
    return String(data?.display_name || data?.username || "Author");
}
