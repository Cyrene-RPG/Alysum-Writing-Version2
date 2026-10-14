/**
 * The race track: one row per writer, with a bar running toward the finish
 * flag. Racers see a compact track; spectators get star and cheer buttons.
 * Rows stay in join order so nobody's row jumps around mid-race.
 */
import { averageWpm, formatClock, ordinal } from "@alysum/community/word-war-race.js";

const COLORS = [
    "#a78bfa", "#22d3ee", "#f472b6", "#fbbf24", "#a3e635", "#fb923c", "#38bdf8", "#f87171",
    "#2dd4bf", "#e879f9", "#facc15", "#4ade80", "#c084fc", "#60a5fa", "#fda4af", "#86efac",
];
const HEART_PATH = "M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4.5 6 4.5c2.2 0 3.6 1.2 6 3.6 2.4-2.4 3.8-3.6 6-3.6 3.7 0 5.6 3.9 4 7.2C19.5 16.4 12 21 12 21z";
const FIRE_WPM = 55;
const QUIET_MS = 20_000;
const MAX_FLOATS = 40;

export function heartIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", HEART_PATH);
    svg.append(path);
    return svg;
}

export function initialOf(name) {
    const letter = String(name || "").trim().charAt(0);
    return letter ? letter.toUpperCase() : "?";
}

/** Round avatar: the writer's picture if they have one, else their initial. */
export function avatarEl(racer, color) {
    const el = document.createElement("span");
    el.className = "ww-av";
    el.style.setProperty("--c", color);
    const initial = initialOf(racer.displayName);
    if (racer.avatarUrl) {
        const img = document.createElement("img");
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.src = racer.avatarUrl;
        img.addEventListener("error", () => {
            img.remove();
            el.textContent = initial;
        });
        el.append(img);
    } else {
        el.textContent = initial;
    }
    return el;
}

/** Colors follow join order, so a writer keeps theirs from lobby to results. */
export function colorFor(racers, userId) {
    const ordered = [...racers].sort((a, b) => a.joinedAt - b.joinedAt);
    const index = ordered.findIndex((r) => r.userId === userId);
    return COLORS[Math.max(0, index) % COLORS.length];
}

function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
}

export function createTrack(listEl, { isSpectator = false, myId = "", onStar = () => {}, onCheer = () => {} } = {}) {
    const rows = new Map();

    listEl.addEventListener("click", (event) => {
        const star = event.target.closest("[data-star]");
        if (star) {
            onStar(star.dataset.star);
            return;
        }
        const cheer = event.target.closest("[data-cheer]");
        if (cheer) onCheer(cheer.dataset.cheer);
    });

    function buildRow(racer, color) {
        const isMe = racer.userId === myId;
        const li = document.createElement("li");
        li.className = `ww-lane${isMe ? " is-you" : ""}`;
        li.style.setProperty("--c", isMe ? "var(--text)" : color);

        const pos = document.createElement("span");
        pos.className = "ww-pos";
        pos.textContent = "–";

        const who = document.createElement("div");
        who.className = "ww-who";
        const name = document.createElement("span");
        name.className = "ww-name";
        const nameText = document.createElement("b");
        nameText.textContent = isMe ? "You" : racer.displayName;
        const book = document.createElement("small");
        book.textContent = racer.bookTitle;
        name.append(nameText, book);
        who.append(avatarEl(racer, isMe ? "var(--text)" : color), name);

        const run = document.createElement("div");
        run.className = "ww-run";
        const state = document.createElement("span");
        state.className = "ww-state";
        const rail = document.createElement("div");
        rail.className = "ww-rail";
        const fill = document.createElement("div");
        fill.className = "ww-fill";
        const head = document.createElement("div");
        head.className = "ww-head";
        rail.append(fill, head);
        run.append(state, rail);

        const nums = document.createElement("div");
        nums.className = "ww-nums";
        const words = document.createElement("strong");
        words.textContent = "0";
        const wpm = document.createElement("small");
        wpm.textContent = "0 wpm";
        nums.append(words, wpm);

        li.append(pos, who, run, nums);

        const refs = { li, pos, state, words, wpm, cheerCount: null, star: null, cheer: null };
        if (isSpectator) {
            const acts = document.createElement("div");
            acts.className = "ww-acts";
            const star = document.createElement("button");
            star.type = "button";
            star.className = "ww-star";
            star.dataset.star = racer.userId;
            star.setAttribute("aria-pressed", "false");
            star.setAttribute("aria-label", `Back ${racer.displayName}`);
            star.textContent = "★";
            const cheer = document.createElement("button");
            cheer.type = "button";
            cheer.className = "ww-cheer";
            cheer.dataset.cheer = racer.userId;
            cheer.setAttribute("aria-label", `Cheer for ${racer.displayName}`);
            const count = document.createElement("span");
            count.textContent = "0";
            cheer.append(heartIcon(), count);
            acts.append(star, cheer);
            li.append(acts);
            Object.assign(refs, { cheerCount: count, star, cheer });
        }
        return refs;
    }

    /**
     * list: standings(); paces: Map userId → { wpm, idleMs };
     * mine: { counted, isOverLimit } for the racer's own row, or null.
     */
    function sync(list, { racers, targetWords, startsAt, status, nowMs, paces, cheersOf, favId, mine }) {
        const ids = new Set(list.map((r) => r.userId));
        for (const [id, refs] of rows) {
            if (!ids.has(id)) {
                refs.li.remove();
                rows.delete(id);
            }
        }
        const laneOrder = [...list].sort((a, b) => a.joinedAt - b.joinedAt);
        let needsOrder = false;
        for (const racer of laneOrder) {
            if (!rows.has(racer.userId)) {
                rows.set(racer.userId, buildRow(racer, colorFor(racers, racer.userId)));
                needsOrder = true;
            }
        }
        if (needsOrder) laneOrder.forEach((r) => listEl.append(rows.get(r.userId).li));

        const isRunning = status === "running";
        for (const r of list) {
            const refs = rows.get(r.userId);
            const isMe = r.userId === myId;
            const words = isMe && mine && r.finishedAt == null ? mine.counted : r.words;
            const pace = paces.get(r.userId) || { wpm: 0, idleMs: 0 };
            const pct = Math.min(100, (words / targetWords) * 100);
            refs.li.style.setProperty("--p", pct.toFixed(2));

            setText(refs.pos, words > 0 || r.place ? String(r.pos) : "–");
            setText(refs.words, words.toLocaleString());
            setText(refs.wpm, r.finishedAt != null
                ? `${averageWpm(words, startsAt, r.finishedAt)} avg wpm`
                : `${pace.wpm} wpm`);

            let label = "";
            let tone = "";
            if (r.place != null) {
                label = `${ordinal(r.place)} · ${formatClock(r.finishedAt - startsAt)}`;
                tone = "done";
            } else if (r.hasLeft) {
                label = "Left";
            } else if (status === "finished") {
                label = "Out of time";
            } else if (r.isGone) {
                label = "Connection lost";
            } else if (isMe && mine?.isOverLimit) {
                label = "Speed limit";
                tone = "fire";
            } else if (isRunning && pace.wpm >= FIRE_WPM) {
                label = "On fire";
                tone = "fire";
            } else if (isRunning && pace.idleMs >= QUIET_MS) {
                label = "Thinking…";
            }
            setText(refs.state, label);
            refs.state.className = `ww-state${tone ? ` is-${tone}` : ""}`;

            refs.li.classList.toggle("is-lead", r.pos === 1 && words > 0);
            refs.li.classList.toggle("is-fire", tone === "fire");
            refs.li.classList.toggle("is-done", r.place != null);
            refs.li.classList.toggle("is-out", r.hasLeft || r.isGone);
            refs.li.classList.toggle("is-fav", favId === r.userId);
            if (refs.cheerCount) {
                setText(refs.cheerCount, String(cheersOf(r)));
                refs.star.setAttribute("aria-pressed", String(favId === r.userId));
            }
        }
    }

    /** Hearts float up from a writer's cheer button. */
    function burst(userId, count, isMine) {
        const refs = rows.get(userId);
        if (!refs?.cheer || listEl.querySelectorAll(".ww-float").length > MAX_FLOATS) return;
        const btn = refs.cheer;
        for (let i = 0; i < Math.min(count, 4); i += 1) {
            const heart = document.createElement("span");
            heart.className = `ww-float${isMine ? " is-mine" : ""}`;
            heart.append(heartIcon());
            heart.style.left = `${btn.offsetLeft + btn.offsetWidth / 2 - 8 + (Math.random() * 24 - 12)}px`;
            heart.style.top = `${btn.offsetTop - 6}px`;
            heart.style.setProperty("--dx", `${Math.random() * 36 - 18}px`);
            heart.style.animationDelay = `${i * 90}ms`;
            heart.addEventListener("animationend", () => heart.remove());
            refs.li.append(heart);
        }
    }

    return { sync, burst };
}
