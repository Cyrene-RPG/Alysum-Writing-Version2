import { state } from "./state.js";
import { playUiSound } from "./ui-sounds.js?v=16";

const GLYPHS = [...new Set([
    "ᑑ𝙹ꖌᔑᑑᓭℸʖ⍑ꖎᓭᑑリ𝙹⋮⚍╎ꖎリリ",
    "ᒷリ⚍ᒲʖ∷リᔑᒲᒷ",
    "⎓ᒷᔑℸ¡ㅜᒷ ᓭ⚍リᒷ∷",
    "ᔑ ʖ ᓵ ᔑ ᒷ ⎓ ⊣ ⍑"
].join(""))];

const CRYPTIC = [
    "ᓭ¡⊣リᔑꖎ ᓭᒷリℸ ⇒ {u}",
    "キー交換 ⇒ {u} :: ペンディング",
    "HANDSHAKE ::{u}:: 0x{hex}",
    "invite.pkt → {u} [encrypted]",
    "接続要求 → {u} 受信待ち",
];

const channels = { general: { label: "#general", messages: [] } };
let currentChannel = "general";
let groupMode = false;
let pending = [];
let bound = false;

function els() {
    return {
        log: document.getElementById("chatLog"),
        typing: document.getElementById("chatTyping"),
        input: document.getElementById("chatMsg"),
        send: document.getElementById("chatSend"),
        list: document.getElementById("chatChannelList"),
        title: document.getElementById("chatRoomTitle"),
        groupBtn: document.getElementById("chatGroupBtn"),
        pendingEl: document.getElementById("chatPending"),
        createBtn: document.getElementById("chatCreateGroup"),
        toasts: document.getElementById("chatToastStack"),
        self: document.getElementById("chatSelfName"),
        anon: document.getElementById("chatAnon"),
    };
}

function timestamp() {
    return new Date().toTimeString().slice(0, 5);
}

function selfName() {
    const { anon } = els();
    if (anon?.checked) return "anonymous";
    return state.user?.username || "you";
}

function addMessage(msg, channelKey) {
    const key = channelKey || currentChannel;
    if (!channels[key]) return;
    const full = { ts: timestamp(), ...msg };
    channels[key].messages.push(full);
    if (key === currentChannel) renderMessage(full);
}

function renderMessage(msg) {
    const { log } = els();
    if (!log) return;
    const row = document.createElement("div");
    row.className = `msg${msg.system ? " system" : ""}${msg.me ? " me" : ""}`;
    const ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = msg.ts;
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = msg.text;
    row.append(ts);
    if (!msg.system) {
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = msg.user;
        row.append(user);
    }
    row.append(text);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
}

function renderChannelList() {
    const { list } = els();
    if (!list) return;
    list.replaceChildren();
    Object.keys(channels).forEach((key) => {
        const row = document.createElement("div");
        row.className = "channel-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = `channel-item${key === currentChannel ? " active" : ""}`;
        const hash = document.createElement("span");
        hash.className = "hash";
        hash.textContent = channels[key].label[0] || "#";
        button.append(hash, channels[key].label.slice(1));
        button.addEventListener("click", () => switchChannel(key));
        row.appendChild(button);
        if (channels[key].owned) {
            const trash = document.createElement("button");
            trash.type = "button";
            trash.className = "channel-delete";
            trash.setAttribute("aria-label", "Delete group");
            trash.title = "Delete group";
            trash.innerHTML = "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path d=\"M6 2h4l.5 1H14v1H2V3h3.5L6 2zm1 4v6H6V6h1zm3 0v6H9V6h1zM3 5h10l-.7 9H3.7L3 5z\"/></svg>";
            trash.addEventListener("click", (event) => {
                event.stopPropagation();
                deleteGroup(key);
            });
            row.appendChild(trash);
        }
        list.appendChild(row);
    });
}

function deleteGroup(key) {
    if (!channels[key]?.owned) return;
    const label = channels[key].label;
    delete channels[key];
    playUiSound("commentsFail");
    showToast(`GROUP CHANNEL DROPPED :: ${label}`);
    if (currentChannel === key) switchChannel("general");
    else renderChannelList();
}

function switchChannel(key) {
    if (!channels[key]) return;
    currentChannel = key;
    const { log, title } = els();
    if (log) log.replaceChildren();
    channels[key].messages.forEach(renderMessage);
    if (title) {
        title.replaceChildren();
        const dot = document.createElement("span");
        dot.className = "dot";
        title.append(dot, ` ${channels[key].label} — switched`);
    }
    renderChannelList();
}

function glitchSend() {
    const { send } = els();
    if (!send) return;
    send.classList.remove("glitching");
    void send.offsetWidth;
    send.classList.add("glitching");
    setTimeout(() => send.classList.remove("glitching"), 400);
}

function sendMessage() {
    const { input } = els();
    const val = input?.value.trim() || "";
    if (!val) return;
    addMessage({ user: selfName(), text: val, me: true });
    input.value = "";
    glitchSend();
}

function showToast(label) {
    const { toasts } = els();
    if (!toasts) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("data-label", label);
    toast.textContent = label;
    toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 2900);
}

function inviteToast(user) {
    const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
    const template = CRYPTIC[Math.floor(Math.random() * CRYPTIC.length)];
    showToast(template.replace("{u}", user).replace("{hex}", hex));
}

function renderPending() {
    const { pendingEl, createBtn } = els();
    if (!pendingEl) return;
    pendingEl.replaceChildren();
    pending.forEach((name) => {
        const chip = document.createElement("span");
        chip.className = "pending-chip";
        chip.textContent = name;
        pendingEl.appendChild(chip);
    });
    pendingEl.classList.toggle("show", pending.length > 0);
    createBtn?.classList.toggle("show", pending.length > 0);
}

function toggleGroupMode() {
    const { groupBtn } = els();
    groupMode = !groupMode;
    playUiSound(groupMode ? "commentsOpen" : "commentsFail");
    groupBtn?.classList.toggle("active", groupMode);
    if (groupBtn) groupBtn.textContent = groupMode ? "× cancel" : "+ New Group";
    if (!groupMode) {
        pending = [];
        renderPending();
        document.querySelectorAll("#chat .user-item.selected").forEach((el) => el.classList.remove("selected"));
    }
}

function onUserClick(el, user) {
    if (!groupMode) {
        playUiSound("filterClick");
        inviteToast(user);
        return;
    }
    if (pending.includes(user)) {
        playUiSound("down");
        pending = pending.filter((name) => name !== user);
        el.classList.remove("selected");
    } else {
        playUiSound("up");
        pending.push(user);
        el.classList.add("selected");
        inviteToast(user);
    }
    renderPending();
}

function createGroup() {
    const names = pending.join(", ");
    const key = `group-${Date.now()}`;
    const label = `#${pending.length <= 2 ? pending.join("-") : `${pending[0]}-and-${pending.length - 1}-more`}`;
    channels[key] = { label, messages: [], owned: true };
    playUiSound("commentsSucceed");
    showToast(`GROUP CHANNEL ESTABLISHED :: ${names}`);
    toggleGroupMode();
    switchChannel(key);
    addMessage({ system: true, text: `group created with ${names}` });
}

function scrambleAwayNames() {
    document.querySelectorAll("#chat .scramble-name").forEach((el) => {
        const len = Number.parseInt(el.dataset.len, 10) || 6;
        let out = "";
        for (let i = 0; i < len; i += 1) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)] || "";
        el.textContent = out;
    });
}

function paintSelf() {
    const { self } = els();
    if (self) self.textContent = state.user?.username || "you";
}

export function bindChat() {
    paintSelf();
    if (bound) return;
    bound = true;
    const { input, send, groupBtn, createBtn } = els();
    send?.addEventListener("click", sendMessage);
    input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") sendMessage();
    });
    groupBtn?.addEventListener("click", toggleGroupMode);
    createBtn?.addEventListener("click", createGroup);
    document.querySelectorAll("#chat .user-item[data-user]").forEach((el) => {
        el.addEventListener("click", () => onUserClick(el, el.dataset.user));
    });
    addMessage({ system: true, text: "you joined #general" });
    renderChannelList();
    scrambleAwayNames();
    setInterval(scrambleAwayNames, 160);
}
