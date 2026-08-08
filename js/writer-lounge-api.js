/**
 * Writer's Lounge API — community forum boards, threads, and posts.
 * Requires supabase-writer-lounge.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function pick(obj, camel, snake, fallback = undefined) {
    if (obj == null) return fallback;
    if (obj[camel] !== undefined) return obj[camel];
    if (obj[snake] !== undefined) return obj[snake];
    return fallback;
}

export const WRITERS_LOUNGE_PAGE = "writers-lounge";

/** Canonical lounge path — always clean URL so refresh keeps query params. */
export function writersLoungeBasePath() {
    const path = window.location.pathname.replace(/\\/g, "/");
    if (path.includes("/story-board/")) return `../${WRITERS_LOUNGE_PAGE}`;
    return `/${WRITERS_LOUNGE_PAGE}`;
}

export function writersLoungeUrl(params = {}) {
    const url = new URL(writersLoungeBasePath(), window.location.href);
    url.search = "";
    if (params.board) url.searchParams.set("board", String(params.board));
    if (params.thread) url.searchParams.set("thread", String(params.thread));
    if (params.page && Number(params.page) > 1) url.searchParams.set("page", String(params.page));
    return url.pathname + url.search;
}

export async function listLoungeHome() {
    const { data, error } = await supabase.rpc("list_lounge_home");
    if (error) throw error;
    return data || { categories: [], stats: {} };
}

export async function listLoungeThreads(boardSlug, page = 1, limit = 25) {
    const { data, error } = await supabase.rpc("list_lounge_threads", {
        p_board_slug: boardSlug,
        p_page: page,
        p_limit: limit,
    });
    if (error) throw error;
    return data || { board: null, threads: [], pagination: {} };
}

export async function getLoungeThread(threadId, page = 1, limit = 20) {
    const { data, error } = await supabase.rpc("get_lounge_thread", {
        p_thread_id: threadId,
        p_page: page,
        p_limit: limit,
    });
    if (error) throw error;
    return data || { board: null, thread: null, posts: [], pagination: {} };
}

export async function createLoungeThread(boardSlug, title, body) {
    const { data, error } = await supabase.rpc("create_lounge_thread", {
        p_board_slug: boardSlug,
        p_title: (title || "").slice(0, 200),
        p_body: (body || "").slice(0, 12000),
    });
    if (error) throw error;
    return data;
}

export async function replyLoungeThread(threadId, body, quotePostId = null) {
    const { data, error } = await supabase.rpc("reply_lounge_thread", {
        p_thread_id: threadId,
        p_body: (body || "").slice(0, 12000),
        p_quote_post_id: quotePostId || null,
    });
    if (error) throw error;
    return data;
}

export async function getLoungePost(postId) {
    const { data, error } = await supabase.rpc("get_lounge_post", {
        p_post_id: postId,
    });
    if (error) throw error;
    return data ? normalizePost(data) : null;
}

export async function toggleLoungeReaction(postId, emoji) {
    const { data, error } = await supabase.rpc("toggle_lounge_reaction", {
        p_post_id: postId,
        p_emoji: emoji,
    });
    if (error) throw error;
    return data ? normalizePost(data) : null;
}

export async function listLoungeOnlineMembers(limit = 50) {
    const { data, error } = await supabase.rpc("list_lounge_online_members", {
        p_limit: limit,
    });
    if (error) throw error;
    const members = Array.isArray(data?.members) ? data.members : [];
    return {
        totalOnline: Number(data?.totalOnline ?? data?.total_online ?? 0) || 0,
        members: members.map(normalizeOnlineMember),
    };
}

export function normalizeOnlineMember(raw) {
    if (!raw) return null;
    return {
        id: pick(raw, "id", "id"),
        name: pick(raw, "name", "name", "Writer"),
        initials: pick(raw, "initials", "initials", "WR"),
        isOnline: Boolean(pick(raw, "isOnline", "is_online", true)),
        lastSeenAt: pick(raw, "lastSeenAt", "last_seen_at"),
    };
}

export function normalizeReaction(raw) {
    if (!raw) return null;
    return {
        emoji: pick(raw, "emoji", "emoji", ""),
        count: Number(pick(raw, "count", "count", 0)) || 0,
        reacted: Boolean(pick(raw, "reacted", "reacted", false)),
    };
}

/** @param {string} threadId @param {{ onPost?: (postId: string) => void, onReaction?: (postId: string) => void }} handlers */
export function subscribeLoungeThread(threadId, handlers = {}) {
    if (!threadId) return () => {};

    const channel = supabase
        .channel(`lounge_thread_${threadId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "lounge_posts",
                filter: `thread_id=eq.${threadId}`,
            },
            (payload) => {
                const postId = payload?.new?.id;
                if (postId) handlers.onPost?.(postId);
            }
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "lounge_post_reactions",
            },
            (payload) => {
                const postId = payload?.new?.post_id || payload?.old?.post_id;
                if (postId) handlers.onReaction?.(postId);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function normalizeBoard(raw) {
    if (!raw) return null;
    return {
        id: pick(raw, "id", "id"),
        slug: pick(raw, "slug", "slug", ""),
        title: pick(raw, "title", "title", ""),
        description: pick(raw, "description", "description", ""),
        isLocked: Boolean(pick(raw, "isLocked", "is_locked", false)),
        canPost: Boolean(pick(raw, "canPost", "can_post", true)),
        topicCount: Number(pick(raw, "topicCount", "topic_count", 0)) || 0,
        postCount: Number(pick(raw, "postCount", "post_count", 0)) || 0,
        lastPost: normalizeLastPost(pick(raw, "lastPost", "last_post", null)),
    };
}

export function normalizeLastPost(raw) {
    if (!raw) return null;
    return {
        threadId: pick(raw, "threadId", "thread_id"),
        threadTitle: pick(raw, "threadTitle", "thread_title", ""),
        authorId: pick(raw, "authorId", "author_id"),
        authorName: pick(raw, "authorName", "author_name", "Writer"),
        postedAt: pick(raw, "postedAt", "posted_at"),
    };
}

export function normalizeThread(raw) {
    if (!raw) return null;
    return {
        id: pick(raw, "id", "id"),
        title: pick(raw, "title", "title", ""),
        authorId: pick(raw, "authorId", "author_id"),
        authorName: pick(raw, "authorName", "author_name", "Writer"),
        isSticky: Boolean(pick(raw, "isSticky", "is_sticky", false)),
        isAnnouncement: Boolean(pick(raw, "isAnnouncement", "is_announcement", false)),
        replyCount: Number(pick(raw, "replyCount", "reply_count", 0)) || 0,
        viewCount: Number(pick(raw, "viewCount", "view_count", 0)) || 0,
        postCount: Number(pick(raw, "postCount", "post_count", 0)) || 0,
        createdAt: pick(raw, "createdAt", "created_at"),
        lastPostAt: pick(raw, "lastPostAt", "last_post_at"),
        lastPostBy: pick(raw, "lastPostBy", "last_post_by"),
        lastPostByName: pick(raw, "lastPostByName", "last_post_by_name", ""),
        status: pick(raw, "status", "status", "open"),
    };
}

export function normalizePost(raw) {
    if (!raw) return null;
    return {
        id: pick(raw, "id", "id"),
        threadId: pick(raw, "threadId", "thread_id"),
        authorId: pick(raw, "authorId", "author_id"),
        authorName: pick(raw, "authorName", "author_name", "Writer"),
        authorInitials: pick(raw, "authorInitials", "author_initials", "WR"),
        authorJoinedAt: pick(raw, "authorJoinedAt", "author_joined_at"),
        authorPostCount: Number(pick(raw, "authorPostCount", "author_post_count", 0)) || 0,
        authorDailyGoal: Number(pick(raw, "authorDailyGoal", "author_daily_goal", 2000)) || 2000,
        authorTodayWords: Number(pick(raw, "authorTodayWords", "author_today_words", 0)) || 0,
        quotePostId: pick(raw, "quotePostId", "quote_post_id"),
        quoteBody: pick(raw, "quoteBody", "quote_body", ""),
        quoteAuthorName: pick(raw, "quoteAuthorName", "quote_author_name", ""),
        body: pick(raw, "body", "body", ""),
        postNumber: Number(pick(raw, "postNumber", "post_number", 0)) || 0,
        createdAt: pick(raw, "createdAt", "created_at"),
        editedAt: pick(raw, "editedAt", "edited_at"),
        reactions: (Array.isArray(raw?.reactions) ? raw.reactions : []).map(normalizeReaction).filter(Boolean),
    };
}

export function normalizePagination(raw) {
    if (!raw) return { page: 1, limit: 25, total: 0, totalPages: 1 };
    return {
        page: Number(pick(raw, "page", "page", 1)) || 1,
        limit: Number(pick(raw, "limit", "limit", 25)) || 25,
        total: Number(pick(raw, "total", "total", 0)) || 0,
        totalPages: Number(pick(raw, "totalPages", "total_pages", 1)) || 1,
    };
}

export function isWriterLoungeSchemaMissing(error) {
    const msg = safeString(error?.message, "");
    const code = safeString(error?.code, "");
    return (
        code === "42P01" ||
        code === "PGRST202" ||
        /lounge_categories|lounge_boards|lounge_threads|lounge_posts/i.test(msg) ||
        /list_lounge_home|list_lounge_threads|get_lounge_thread|get_lounge_post|create_lounge_thread|reply_lounge_thread|toggle_lounge_reaction|list_lounge_online_members/i.test(msg)
    );
}
