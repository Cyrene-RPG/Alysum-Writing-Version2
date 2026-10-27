export const NOTIFICATION_PAGE_SIZE = 25;
export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
    newFollowers: true, authorAnnouncements: true, siteUpdates: false, newBooks: true, newChapters: true, newComments: true, authorReplies: true,
});
export const NOTIFICATION_KINDS = Object.freeze({
    moderation_message: "Moderation messages", follower: "Followers", author_announcement: "Author announcements", site_update: "Alysum updates",
    chapter_comment: "Comments on your books", author_reply: "Author replies",
    book_inactivity: "Book inactivity reminders",
    book_reminder: "Your book reminders",
    new_book: "New books", new_chapter: "New chapters",
    follow_confirmation: "Follow confirmations", subscription_confirmation: "Subscription confirmations",
});
const COLUMNS = "id,kind,actor_id,announcement_id,book_id,chapter_id,title,message,created_at,read_at";

function checkError(error) {
    if (!error) return;
    const text = String(error.message || "");
    if (["42P01", "PGRST205", "PGRST202"].includes(error.code)
        || /inbox_notifications|get_inbox_summary|notification_preferences/.test(text) && /does not exist|schema cache|could not find/i.test(text)) {
        throw new Error("Notifications are not available yet. Please try again later.");
    }
    throw new Error(text || "Could not update your inbox. Please try again.");
}

function requireUser(userId) {
    if (!userId) throw new Error("Sign in to open your inbox.");
}
function requireId(id, allowZero = false) {
    const value = String(id ?? "");
    if (!(allowZero ? /^\d+$/ : /^[1-9]\d*$/).test(value)) throw new Error("Invalid notification.");
    return value;
}
export function normalizeNotification(row) {
    return {
        id: String(row.id), kind: row.kind, actorId: row.actor_id || "",
        announcementId: row.announcement_id || "", bookId: row.book_id || "", chapterId: row.chapter_id || "", title: String(row.title || ""),
        message: String(row.message || ""), createdAt: row.created_at, readAt: row.read_at || null,
    };
}
export function normalizeNotificationPreferences(row) {
    return {
        newFollowers: row?.new_followers ?? true,
        authorAnnouncements: row?.author_announcements ?? true,
        siteUpdates: row?.site_updates ?? false,
        newBooks: row?.new_books ?? true, newChapters: row?.new_chapters ?? true,
        newComments: row?.new_comments ?? true, authorReplies: row?.author_replies ?? true,
    };
}
export async function listNotifications(client, { userId, before = "", unreadOnly = false, kind = "", limit = NOTIFICATION_PAGE_SIZE }) {
    requireUser(userId);
    if (kind && !Object.hasOwn(NOTIFICATION_KINDS, kind)) throw new Error("Choose a notification category.");
    let query = client.from("inbox_notifications").select(COLUMNS).eq("recipient_id", userId);
    if (before) query = query.lt("id", requireId(before));
    if (unreadOnly) query = query.is("read_at", null);
    if (kind) query = query.eq("kind", kind);
    const size = Math.max(1, Math.min(200, Number(limit) || NOTIFICATION_PAGE_SIZE));
    const { data, error } = await query.order("id", { ascending: false }).limit(size);
    checkError(error);
    return (data || []).map(normalizeNotification);
}
export async function getNotificationsByIds(client, userId, ids) {
    requireUser(userId);
    if (!ids.length) return [];
    const results = [];
    for (let start = 0; start < ids.length; start += 100) {
        const { data, error } = await client.from("inbox_notifications").select(COLUMNS)
            .eq("recipient_id", userId).in("id", ids.slice(start, start + 100).map(id => requireId(id)));
        checkError(error);
        results.push(...(data || []).map(normalizeNotification));
    }
    return results;
}
export async function getNotificationSummary(client) {
    const { data, error } = await client.rpc("get_inbox_summary");
    checkError(error);
    return {
        unreadCount: Math.max(0, Number(data?.unreadCount) || 0),
        latestId: requireId(data?.latestId || "0", true),
    };
}
export async function getNotificationPreferences(client, userId) {
    requireUser(userId);
    let { data, error } = await client.from("notification_preferences").select("new_followers,author_announcements,site_updates,new_books,new_chapters,new_comments,author_replies")
        .eq("user_id", userId).maybeSingle();
    if (error && ["42703", "PGRST204"].includes(error.code) && /new_comments|author_replies/.test(error.message || "")) {
        ({data,error} = await client.from("notification_preferences").select("new_followers,author_announcements,site_updates,new_books,new_chapters").eq("user_id",userId).maybeSingle());
    }
    checkError(error);
    return normalizeNotificationPreferences(data);
}
export async function saveNotificationPreferences(client, value) {
    if (![value.newFollowers, value.authorAnnouncements, value.siteUpdates, value.newBooks, value.newChapters, value.newComments, value.authorReplies].every(v => typeof v === "boolean")) {
        throw new Error("Choose a setting for every category.");
    }
    let { data, error } = await client.rpc("set_all_notification_preferences", {
        p_new_followers: value.newFollowers,
        p_author_announcements: value.authorAnnouncements,
        p_site_updates: value.siteUpdates,
        p_new_books: value.newBooks, p_new_chapters: value.newChapters,
        p_new_comments: value.newComments, p_author_replies: value.authorReplies,
    });
    if (error && ["PGRST202", "42883"].includes(error.code)) {
        if (!value.newComments || !value.authorReplies) throw new Error("Comment notification preferences are not available yet. Please try again later.");
        ({data,error} = await client.rpc("set_reading_notification_preferences", {
            p_new_followers:value.newFollowers,p_author_announcements:value.authorAnnouncements,p_site_updates:value.siteUpdates,p_new_books:value.newBooks,p_new_chapters:value.newChapters,
        }));
    }
    checkError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Could not confirm your preferences. Please try again.");
    return normalizeNotificationPreferences(row);
}
export async function setNotificationRead(client, id, isRead) {
    if (typeof isRead !== "boolean") throw new Error("Choose a read state.");
    const { error } = await client.rpc("set_inbox_notification_read", {
        p_notification_id: requireId(id), p_is_read: isRead,
    });
    checkError(error);
}
export async function markNotificationsRead(client, throughId) {
    const { data, error } = await client.rpc("mark_inbox_notifications_read", {
        p_through_id: requireId(throughId, true),
    });
    checkError(error);
    return Number(data) || 0;
}
export async function resolveNotificationDestination(client, entry) {
    if (["follower", "follow_confirmation"].includes(entry.kind)) return null;
    if (entry.kind === "book_reminder") {
        const {data,error}=await client.rpc("get_book_reminder_notification_target",{p_notification_id:requireId(entry.id)});
        checkError(error); const target=Array.isArray(data)?data[0]:data;
        if(!target?.book_id)throw new Error("This book is no longer available.");
        return (target.goal==="post"?"/publish?book=":"/editor?book=")+encodeURIComponent(target.book_id);
    }
    if (entry.kind === "book_inactivity") {
        const { data, error } = await client.rpc("get_book_inactivity_notification_target", { p_notification_id: requireId(entry.id) });
        checkError(error);
        const target = Array.isArray(data) ? data[0] : data;
        if (!target?.book_id) throw new Error("This book is no longer available.");
        return "/book?id=" + encodeURIComponent(target.book_id);
    }
    if (["chapter_comment", "author_reply"].includes(entry.kind)) {
        const {data,error} = await client.rpc("get_comment_notification_target", {p_notification_id:requireId(entry.id)});
        checkError(error);
        const target = Array.isArray(data) ? data[0] : data;
        if (!target?.book_id || !target.chapter_id || !target.comment_id) throw new Error("This comment is no longer available.");
        return "/read?id="+encodeURIComponent(target.book_id)+"&chapter="+encodeURIComponent(target.chapter_id)+"&comment="+encodeURIComponent(target.comment_id);
    }
    if(entry.kind==="moderation_message"){
        const {data,error}=await client.rpc("mc_call",{p_action:"my_notification",p_payload:{id:requireId(entry.id)}});checkError(error);
        if(!data?.threadId)throw new Error("This conversation is no longer available.");
        return "/moderation-inbox?thread="+encodeURIComponent(data.threadId);
    }
    if (entry.kind === "new_book" || entry.kind === "new_chapter" || entry.kind === "subscription_confirmation") {
        const { data, error } = await client.rpc("get_reading_notification_target", {
            p_notification_id: requireId(entry.id),
        });
        checkError(error);
        const target = Array.isArray(data) ? data[0] : data;
        if (!target?.book_id || (entry.kind === "new_chapter" && !target.chapter_id)) {
            throw new Error("This book or chapter is no longer available.");
        }
        return entry.kind !== "new_chapter" ? "/book?id=" + encodeURIComponent(target.book_id)
            : "/read?id=" + encodeURIComponent(target.book_id) + "&chapter=" + encodeURIComponent(target.chapter_id);
    }
    if (!entry.announcementId) throw new Error("This update is no longer available.");
    const { data, error } = await client.from("announcements").select("id")
        .eq("id", entry.announcementId).eq("status", "published").maybeSingle();
    checkError(error);
    if (!data) throw new Error("This update is no longer available.");
    return "/updates?post=" + encodeURIComponent(data.id);
}

export async function claimBookReminderPopup(client) {
    const {data,error}=await client.rpc('claim_book_reminder_popup');
    checkError(error);return data?normalizeNotification(data):null;
}
