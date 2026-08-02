/**
 * Real-time collab room session — Supabase Broadcast + postgres_changes.
 */

import { supabase } from "../firebase.js";
import {
    upsertCollabLiveDraft,
    syncCollabChapterSuggestions,
} from "./collab-rooms-api.js?v=9";

const PRESENCE_COLORS = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#f472b6", "#fb7185"];

/**
 * @param {{
 *   bookId: string,
 *   chapterId: string,
 *   userId: string,
 *   userLabel: string,
 *   isAuthor?: boolean,
 *   onRemoteDoc?: (html: string, userId: string, userLabel: string) => void,
 *   onRemotePersisted?: (html: string, userId: string) => void,
 *   onSuggestionsChange?: () => void,
 *   onCommentsChange?: () => void,
 *   onPresenceChange?: (users: Array<{ userId: string, label: string, color: string }>) => void,
 * }} opts
 */
export function createCollabRealtimeSession(opts) {
    const {
        bookId,
        chapterId,
        userId,
        userLabel,
        isAuthor = false,
        onRemoteDoc,
        onRemotePersisted,
        onSuggestionsChange,
        onCommentsChange,
        onPresenceChange,
    } = opts;

    /** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
    let channel = null;
    let broadcastTimer = 0;
    let persistTimer = 0;
    let syncTimer = 0;
    let localEditUntil = 0;
    let applyingRemote = false;
    let lastRemoteTs = 0;
    let pendingRemote = null;
    let pendingFlushTimer = 0;
    const color = PRESENCE_COLORS[Math.abs(hashCode(userId)) % PRESENCE_COLORS.length];

    function hashCode(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
        return h | 0;
    }

    function markLocalEdit() {
        // Authors only review — never gate remote applies on their own review commits
        if (isAuthor) return;
        localEditUntil = Date.now() + 900;
    }

    function canApplyRemote() {
        if (applyingRemote) return false;
        // Author must always see collaborator keystrokes
        if (isAuthor) return true;
        return Date.now() >= localEditUntil;
    }

    function flushPendingRemote() {
        window.clearTimeout(pendingFlushTimer);
        if (!pendingRemote || !canApplyRemote()) {
            if (pendingRemote && !isAuthor) {
                const wait = Math.max(40, localEditUntil - Date.now() + 40);
                pendingFlushTimer = window.setTimeout(flushPendingRemote, wait);
            }
            return;
        }
        const next = pendingRemote;
        pendingRemote = null;
        if (next.source === "persisted") {
            onRemotePersisted?.(next.html, next.userId);
        } else {
            onRemoteDoc?.(next.html, next.userId, next.userLabel || "");
        }
    }

    function queueOrApplyRemote(html, fromUserId, fromLabel, source, ts) {
        if (!html) return;
        if (ts && ts <= lastRemoteTs) return;
        if (ts) lastRemoteTs = ts;
        else lastRemoteTs = Date.now();

        if (!canApplyRemote()) {
            pendingRemote = {
                html,
                userId: fromUserId,
                userLabel: fromLabel || "",
                source,
                ts: lastRemoteTs,
            };
            flushPendingRemote();
            return;
        }
        pendingRemote = null;
        if (source === "persisted") onRemotePersisted?.(html, fromUserId);
        else onRemoteDoc?.(html, fromUserId, fromLabel || "");
    }

    function broadcastDoc(html) {
        channel?.send({
            type: "broadcast",
            event: "doc",
            payload: { html, userId, userLabel, ts: Date.now() },
        });
    }

    function scheduleBroadcast(html) {
        markLocalEdit();
        window.clearTimeout(broadcastTimer);
        broadcastTimer = window.setTimeout(() => broadcastDoc(html), 80);
    }

    async function persistAndSync(html, baseContentHash, suggestions) {
        try {
            await upsertCollabLiveDraft(bookId, chapterId, html, baseContentHash);
            if (suggestions?.length) {
                await syncCollabChapterSuggestions(bookId, chapterId, baseContentHash, suggestions);
            }
        } catch (err) {
            console.warn("[collab-realtime] persist failed", err);
        }
    }

    function schedulePersist(html, baseContentHash, suggestions) {
        markLocalEdit();
        window.clearTimeout(persistTimer);
        window.clearTimeout(syncTimer);
        persistTimer = window.setTimeout(() => {
            upsertCollabLiveDraft(bookId, chapterId, html, baseContentHash).catch(() => {});
        }, 450);
        syncTimer = window.setTimeout(() => {
            persistAndSync(html, baseContentHash, suggestions);
        }, 750);
    }

    function flattenPresence(state) {
        /** @type {Array<{ userId: string, label: string, color: string }>} */
        const users = [];
        for (const key of Object.keys(state || {})) {
            const entries = state[key] || [];
            const latest = entries[entries.length - 1];
            if (!latest?.user_id) continue;
            users.push({
                userId: latest.user_id,
                label: latest.label || "Guest",
                color: PRESENCE_COLORS[Math.abs(hashCode(latest.user_id)) % PRESENCE_COLORS.length],
            });
        }
        return users;
    }

    function connect() {
        if (!bookId || !chapterId || !userId) return;

        const channelName = `collab_room_${bookId}_${chapterId}`;
        channel = supabase.channel(channelName, {
            config: { presence: { key: userId } },
        });

        channel
            .on("broadcast", { event: "doc" }, ({ payload }) => {
                if (!payload || payload.userId === userId) return;
                queueOrApplyRemote(
                    payload.html || "",
                    payload.userId,
                    payload.userLabel || "",
                    "broadcast",
                    payload.ts || Date.now()
                );
            })
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "collab_live_drafts",
                    filter: `book_id=eq.${bookId}`,
                },
                (payload) => {
                    const row = payload.new || payload.old;
                    if (!row || row.chapter_id !== chapterId) return;
                    if (row.updated_by === userId) return;
                    // Prefer live broadcast; only use persisted draft if newer than last broadcast
                    const rowTs = row.updated_at ? Date.parse(row.updated_at) : Date.now();
                    if (rowTs && rowTs <= lastRemoteTs) return;
                    queueOrApplyRemote(row.html || "", row.updated_by || "", "", "persisted", rowTs || Date.now());
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "collab_suggestions",
                    filter: `book_id=eq.${bookId}`,
                },
                (payload) => {
                    const row = payload.new || payload.old;
                    if (!row || row.chapter_id !== chapterId) return;
                    onSuggestionsChange?.();
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "collab_comments",
                    filter: `book_id=eq.${bookId}`,
                },
                (payload) => {
                    const row = payload.new || payload.old;
                    if (!row || row.chapter_id !== chapterId) return;
                    onCommentsChange?.();
                }
            )
            .on("presence", { event: "sync" }, () => {
                onPresenceChange?.(flattenPresence(channel.presenceState()));
            })
            .on("presence", { event: "join" }, () => {
                onPresenceChange?.(flattenPresence(channel.presenceState()));
            })
            .on("presence", { event: "leave" }, () => {
                onPresenceChange?.(flattenPresence(channel.presenceState()));
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    await channel.track({
                        user_id: userId,
                        label: userLabel,
                        color,
                        at: Date.now(),
                    });
                    onPresenceChange?.(flattenPresence(channel.presenceState()));
                }
            });
    }

    function disconnect() {
        window.clearTimeout(broadcastTimer);
        window.clearTimeout(persistTimer);
        window.clearTimeout(syncTimer);
        window.clearTimeout(pendingFlushTimer);
        pendingRemote = null;
        if (channel) {
            supabase.removeChannel(channel);
            channel = null;
        }
    }

    return {
        connect,
        disconnect,
        color,
        get applyingRemote() {
            return applyingRemote;
        },
        set applyingRemote(v) {
            applyingRemote = v;
        },
        notifyInput(html, baseContentHash, suggestions) {
            scheduleBroadcast(html);
            schedulePersist(html, baseContentHash, suggestions);
        },
        markLocalEdit,
    };
}
