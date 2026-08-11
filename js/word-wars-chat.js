/**
 * Word Wars room text chat — side panel with Supabase Realtime (local BroadcastChannel fallback).
 */
import { supabase } from "../firebase.js";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function isLocalRoom(roomId) {
    return String(roomId || "").startsWith("local-") || String(roomId || "").startsWith("preview-");
}

function normalizeMessage(row) {
    if (!row) return null;
    return {
        id: String(row.id || ""),
        roomId: String(row.roomId || row.room_id || ""),
        senderId: String(row.senderId || row.sender_id || ""),
        senderName: safeString(row.senderName || row.sender_name || "Writer").trim() || "Writer",
        body: safeString(row.body).trim(),
        createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    };
}

function localStorageKey(roomId) {
    return `alysum-ww-chat:${roomId}`;
}

function loadLocalMessages(roomId) {
    try {
        const raw = localStorage.getItem(localStorageKey(roomId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(normalizeMessage).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function saveLocalMessages(roomId, messages) {
    try {
        localStorage.setItem(localStorageKey(roomId), JSON.stringify(messages.slice(-200)));
    } catch {
        /* ignore quota */
    }
}

export async function listWordWarMessages(roomId, { before = null, limit = 80 } = {}) {
    if (!roomId) return [];
    if (isLocalRoom(roomId)) {
        let messages = loadLocalMessages(roomId);
        if (before) {
            const beforeTs = new Date(before).getTime();
            messages = messages.filter((m) => new Date(m.createdAt).getTime() < beforeTs);
        }
        return messages.slice(-limit);
    }

    const { data, error } = await supabase.rpc("list_word_war_messages", {
        p_room_id: roomId,
        p_before: before,
        p_limit: limit,
    });
    if (error) throw error;
    const rows = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
    return rows.map(normalizeMessage).filter(Boolean).reverse();
}

export async function sendWordWarMessage(roomId, body, { senderId, senderName } = {}) {
    const trimmed = safeString(body).trim();
    if (!trimmed) throw new Error("Message cannot be empty.");
    if (trimmed.length > 2000) throw new Error("Message is too long.");
    if (/<[^>]+>/.test(trimmed)) throw new Error("text_only_messages");

    if (isLocalRoom(roomId)) {
        const message = {
            id: `local-msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            roomId,
            senderId: String(senderId || ""),
            senderName: safeString(senderName || "Writer").trim() || "Writer",
            body: trimmed,
            createdAt: new Date().toISOString(),
        };
        const next = [...loadLocalMessages(roomId), message];
        saveLocalMessages(roomId, next);
        try {
            const bc = new BroadcastChannel(`ww-chat-${roomId}`);
            bc.postMessage({ type: "message", message });
            bc.close();
        } catch {
            /* BroadcastChannel unavailable */
        }
        return message;
    }

    const { data, error } = await supabase.rpc("send_word_war_message", {
        p_room_id: roomId,
        p_body: trimmed,
    });
    if (error) throw error;
    return normalizeMessage(data);
}

export function formatWordWarChatError(error) {
    const message = String(error?.message || error || "Could not send message.");
    if (/rate_limited/i.test(message)) return "You're sending messages too quickly. Wait a moment.";
    if (/invalid_message_body|empty/i.test(message)) return "Message cannot be empty.";
    if (/text_only_messages/i.test(message)) return "Plain text only — no HTML.";
    if (/Not a participant/i.test(message)) return "Join the Word War to chat.";
    if (/function.*does not exist|Could not find the function|word_wars_messages/i.test(message)) {
        return "Room chat needs supabase-word-wars.sql applied in Supabase.";
    }
    return message;
}

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
        return "";
    }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   roomId: string,
 *   userId: string,
 *   displayName?: string,
 * }} opts
 */
export function mountWordWarChat(root, opts) {
    if (!root) return { destroy() {}, refresh() {} };

    const roomId = String(opts.roomId || "").trim();
    const userId = String(opts.userId || "").trim();
    const displayName = safeString(opts.displayName || "Writer").trim() || "Writer";

    /** @type {Map<string, ReturnType<typeof normalizeMessage>>} */
    const byId = new Map();
    let channel = null;
    let broadcast = null;
    let destroyed = false;
    let sending = false;

    root.classList.add("ww-chat");
    root.innerHTML = `
        <div class="ww-chat-head">
            <div>
                <p class="ww-chat-label">Room chat</p>
                <p class="ww-chat-sub">Text while you sprint</p>
            </div>
            <button type="button" class="ww-chat-collapse" data-ww-chat-toggle aria-expanded="true" title="Collapse chat">⟨</button>
        </div>
        <div class="ww-chat-messages" data-ww-chat-list role="log" aria-live="polite"></div>
        <form class="ww-chat-compose" data-ww-chat-form>
            <textarea
                class="ww-chat-input"
                data-ww-chat-input
                rows="2"
                maxlength="2000"
                placeholder="Message the room…"
                aria-label="Message the room"
            ></textarea>
            <button type="submit" class="btn mint ww-chat-send" data-ww-chat-send>Send</button>
        </form>
        <p class="ww-chat-status hidden" data-ww-chat-status></p>
    `;

    const listEl = root.querySelector("[data-ww-chat-list]");
    const formEl = root.querySelector("[data-ww-chat-form]");
    const inputEl = root.querySelector("[data-ww-chat-input]");
    const statusEl = root.querySelector("[data-ww-chat-status]");
    const toggleEl = root.querySelector("[data-ww-chat-toggle]");
    const panel = root.closest(".ww-comms-panel") || root;

    function setStatus(message, isError = false) {
        if (!statusEl) return;
        if (!message) {
            statusEl.classList.add("hidden");
            statusEl.textContent = "";
            return;
        }
        statusEl.textContent = message;
        statusEl.classList.toggle("error", isError);
        statusEl.classList.remove("hidden");
    }

    function renderList() {
        if (!listEl) return;
        const messages = [...byId.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const nearBottom =
            listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 72;

        if (!messages.length) {
            listEl.innerHTML = `<p class="ww-chat-empty">No messages yet. Say hi before the sprint starts.</p>`;
            return;
        }

        listEl.innerHTML = messages
            .map((msg) => {
                const mine = msg.senderId && msg.senderId === userId;
                return `
                    <article class="ww-chat-bubble${mine ? " is-mine" : ""}">
                        <header class="ww-chat-meta">
                            <span class="ww-chat-author">${escapeHtml(mine ? "You" : msg.senderName)}</span>
                            <time class="ww-chat-time">${escapeHtml(formatTime(msg.createdAt))}</time>
                        </header>
                        <p class="ww-chat-body">${escapeHtml(msg.body)}</p>
                    </article>
                `;
            })
            .join("");

        if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
    }

    function upsertMessage(raw) {
        const msg = normalizeMessage(raw);
        if (!msg?.id || !msg.body) return;
        byId.set(msg.id, msg);
        renderList();
    }

    async function refresh() {
        if (!roomId || destroyed) return;
        try {
            const rows = await listWordWarMessages(roomId);
            byId.clear();
            rows.forEach((row) => {
                if (row?.id) byId.set(row.id, row);
            });
            renderList();
            setStatus("");
        } catch (err) {
            console.warn(err);
            setStatus(formatWordWarChatError(err), true);
        }
    }

    function subscribe() {
        if (!roomId) return;

        if (isLocalRoom(roomId)) {
            try {
                broadcast = new BroadcastChannel(`ww-chat-${roomId}`);
                broadcast.onmessage = (event) => {
                    if (event?.data?.type === "message") upsertMessage(event.data.message);
                };
            } catch {
                /* ignore */
            }
            return;
        }

        channel = supabase
            .channel(`word_wars_chat_${roomId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "word_wars_messages",
                    filter: `room_id=eq.${roomId}`,
                },
                () => {
                    refresh().catch(() => {});
                }
            )
            .subscribe();
    }

    formEl?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (sending || !inputEl) return;
        const body = String(inputEl.value || "").trim();
        if (!body) return;
        sending = true;
        setStatus("");
        try {
            const message = await sendWordWarMessage(roomId, body, { senderId: userId, senderName: displayName });
            upsertMessage(message);
            inputEl.value = "";
            inputEl.focus();
        } catch (err) {
            setStatus(formatWordWarChatError(err), true);
        } finally {
            sending = false;
        }
    });

    inputEl?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            formEl?.requestSubmit();
        }
    });

    toggleEl?.addEventListener("click", () => {
        const collapsed = panel.classList.toggle("is-collapsed");
        toggleEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggleEl.textContent = collapsed ? "⟩" : "⟨";
        toggleEl.title = collapsed ? "Expand chat" : "Collapse chat";
    });

    refresh();
    subscribe();

    return {
        refresh,
        destroy() {
            destroyed = true;
            if (channel) {
                supabase.removeChannel(channel);
                channel = null;
            }
            if (broadcast) {
                broadcast.close();
                broadcast = null;
            }
            root.innerHTML = "";
        },
    };
}
