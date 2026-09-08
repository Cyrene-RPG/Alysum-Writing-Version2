import { padStub } from "@alysum/roadmap/slug.js";
import { loginHref, state } from "./state.js";
import { toggleDownvote, toggleVote } from "@alysum/roadmap/votes.js?v=4";
import { supabase } from "@alysum/authentication/client.js";
import { bindReplyThread, setReplyTrigger } from "./replies.js?v=6";
import { bindFilingDelete } from "./filing-delete.js";

function voteKey(kind, stub) {
    return `${kind}:${stub}`;
}

function asCount(n) {
    const value = Number(n);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function writeCount(button, n) {
    const el = button?.querySelector(".count");
    if (el) el.textContent = String(asCount(n));
}

function paintPair(side, row, key) {
    const up = side?.querySelector(".upvote");
    const down = side?.querySelector(".downvote");
    up?.classList.toggle("voted", Boolean(row.voted));
    down?.classList.toggle("voted", Boolean(row.downVoted));
    writeCount(up, row.votes);
    writeCount(down, row.downs);
    state.voteMap.set(key, row.votes);
    state.downMap.set(key, row.downs);
}

function flipUp(row, key, on) {
    row.votes = asCount(row.votes);
    if (on && !row.voted) {
        row.votes += 1;
        state.myVotes.add(key);
    } else if (!on && row.voted) {
        row.votes = Math.max(0, row.votes - 1);
        state.myVotes.delete(key);
    }
    row.voted = on;
}

function flipDown(row, key, on) {
    row.downs = asCount(row.downs);
    if (on && !row.downVoted) {
        row.downs += 1;
        state.myDowns.add(key);
    } else if (!on && row.downVoted) {
        row.downs = Math.max(0, row.downs - 1);
        state.myDowns.delete(key);
    }
    row.downVoted = on;
}

async function onUpvote(button, row) {
    if (!state.user) {
        location.href = loginHref(row.kind === "bug" ? "bugs" : "suggestions");
        return;
    }
    const key = voteKey(row.kind, row.stub);
    const was = row.voted;
    const hadDown = row.downVoted;
    flipUp(row, key, !was);
    if (!was && hadDown) flipDown(row, key, false);
    paintPair(button.parentElement, row, key);
    try {
        await toggleVote(supabase, state.user.userId, row.kind, row.stub, was);
    } catch (err) {
        flipUp(row, key, was);
        if (!was && hadDown) flipDown(row, key, true);
        paintPair(button.parentElement, row, key);
        console.error(err);
    }
}

async function onDownvote(button, row) {
    if (!state.user) {
        location.href = loginHref(row.kind === "bug" ? "bugs" : "suggestions");
        return;
    }
    const key = voteKey(row.kind, row.stub);
    const was = row.downVoted;
    const hadUp = row.voted;
    flipDown(row, key, !was);
    if (!was && hadUp) flipUp(row, key, false);
    paintPair(button.parentElement, row, key);
    try {
        await toggleDownvote(supabase, state.user.userId, row.kind, row.stub, was);
    } catch (err) {
        flipDown(row, key, was);
        if (!was && hadUp) flipUp(row, key, true);
        paintPair(button.parentElement, row, key);
        console.error(err);
    }
}

function paintStop(item) {
    const stop = document.createElement("div");
    stop.className = "stop";
    if (item.zone === "progress") stop.classList.add("progress");
    if (item.zone === "done") stop.classList.add("done");
    const h4 = document.createElement("h4");
    h4.textContent = item.title || "";
    const p = document.createElement("p");
    p.textContent = item.body || "";
    const stamp = document.createElement("div");
    stamp.className = "stamp";
    stamp.textContent = item.stamp || "";
    stop.append(h4, p, stamp);
    return stop;
}

export function paintRoadmap(items) {
    const groups = { planned: [], progress: [], done: [] };
    for (const item of items || []) {
        if (groups[item.zone]) groups[item.zone].push(item);
    }
    const map = [
        ["planned", "plannedZone", "plannedCount"],
        ["progress", "progressZone", "progressCount"],
        ["done", "doneZone", "doneCount"],
    ];
    for (const [zone, listId, countId] of map) {
        const list = document.getElementById(listId);
        const count = document.getElementById(countId);
        if (list) {
            list.replaceChildren();
            groups[zone].forEach((item) => list.appendChild(paintStop(item)));
        }
        if (count) count.textContent = `[${groups[zone].length}]`;
    }
}

function paintEntry(row) {
    const entry = document.createElement("div");
    entry.className = "entry";
    entry.dataset.stub = String(row.stub);
    entry.dataset.kind = row.kind;

    const stub = document.createElement("div");
    stub.className = "stub-number";
    stub.textContent = `#${padStub(row.stub)}`;

    const body = document.createElement("div");
    body.className = "entry-body";
    const h4 = document.createElement("h4");
    h4.textContent = row.title || "";
    const p = document.createElement("p");
    p.textContent = row.body || "";
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    const author = document.createElement("span");
    author.className = "author";
    author.textContent = row.author;
    meta.appendChild(author);
    const replies = document.createElement("span");
    replies.className = "reply-count replies";
    setReplyTrigger(replies, row.replyCount);
    meta.appendChild(replies);
    const when = document.createElement("span");
    when.textContent = row.relative || "";
    meta.append(when);
    bindFilingDelete(meta, row);
    body.append(h4, p, meta);

    const side = document.createElement("div");
    side.className = "entry-side";
    const tag = document.createElement("span");
    if (row.kind === "bug") {
        tag.className = `tag ${row.status || "open"}`;
        tag.textContent = row.status === "ack" ? "Ack" : row.status === "fixed" ? "Fixed" : "Open";
    } else {
        tag.className = "tag ack";
        tag.textContent = "Under review";
    }
    const upvote = document.createElement("button");
    upvote.type = "button";
    upvote.className = "upvote";
    if (row.voted) upvote.classList.add("voted");
    upvote.append("▲ ");
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(asCount(row.votes));
    upvote.appendChild(count);
    upvote.addEventListener("click", () => onUpvote(upvote, row));
    side.append(tag, upvote);
    const downvote = document.createElement("button");
    downvote.type = "button";
    downvote.className = "downvote";
    if (row.downVoted) downvote.classList.add("voted");
    downvote.append("▼ ");
    const downCount = document.createElement("span");
    downCount.className = "count";
    downCount.textContent = String(asCount(row.downs));
    downvote.appendChild(downCount);
    downvote.addEventListener("click", () => onDownvote(downvote, row));
    side.append(downvote);

    entry.append(stub, body, side);
    bindReplyThread(entry, row);
    return entry;
}

export function paintBugs(rows) {
    const ledger = document.getElementById("bugLedger");
    if (!ledger) return;
    ledger.replaceChildren();
    rows.forEach((row) => ledger.appendChild(paintEntry(row)));
}

export function paintSuggestions(rows) {
    const ledger = document.getElementById("suggestionLedger");
    if (!ledger) return;
    ledger.replaceChildren();
    rows.forEach((row) => ledger.appendChild(paintEntry(row)));
}
