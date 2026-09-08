import { padStub } from "@alysum/roadmap/slug.js";
import { loginHref, state } from "./state.js";
import { toggleVote } from "@alysum/roadmap/votes.js";
import { supabase } from "@alysum/authentication/client.js";
import { bindReplyThread, replyLabel } from "./replies.js";

function voteKey(kind, stub) {
    return `${kind}:${stub}`;
}

async function onUpvote(button, row) {
    if (!state.user) {
        location.href = loginHref(row.kind === "bug" ? "bugs" : "suggestions");
        return;
    }
    const key = voteKey(row.kind, row.stub);
    const was = state.myVotes.has(key);
    try {
        const nowVoted = await toggleVote(supabase, state.user.userId, row.kind, row.stub, was);
        const countEl = button.querySelector(".count");
        let count = Number(countEl?.textContent || 0);
        if (nowVoted && !was) {
            count += 1;
            state.myVotes.add(key);
            button.classList.add("voted");
        } else if (!nowVoted && was) {
            count = Math.max(0, count - 1);
            state.myVotes.delete(key);
            button.classList.remove("voted");
        }
        if (countEl) countEl.textContent = String(count);
        state.voteMap.set(key, count);
        row.votes = count;
        row.voted = nowVoted;
    } catch (err) {
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

function paintEntry(row, { withReplies }) {
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
    if (withReplies) {
        const replies = document.createElement("span");
        replies.className = "reply-count";
        replies.dataset.count = String(row.replyCount || 0);
        replies.textContent = replyLabel(row.replyCount);
        meta.appendChild(replies);
    }
    const when = document.createElement("span");
    when.textContent = row.relative || "";
    meta.append(when);
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
    count.textContent = String(row.votes || 0);
    upvote.appendChild(count);
    upvote.addEventListener("click", () => onUpvote(upvote, row));
    side.append(tag, upvote);

    entry.append(stub, body, side);
    if (withReplies) bindReplyThread(entry, row);
    return entry;
}

export function paintBugs(rows) {
    const ledger = document.getElementById("bugLedger");
    if (!ledger) return;
    ledger.replaceChildren();
    rows.forEach((row) => ledger.appendChild(paintEntry(row, { withReplies: true })));
}

export function paintSuggestions(rows) {
    const ledger = document.getElementById("suggestionLedger");
    if (!ledger) return;
    ledger.replaceChildren();
    rows.forEach((row) => ledger.appendChild(paintEntry(row, { withReplies: false })));
}
