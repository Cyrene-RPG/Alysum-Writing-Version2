/**
 * Results: podium, full table, and the way into a rematch.
 */
import { averageWpm, formatClock, ordinal, raceEndedAt } from "@alysum/community/word-war-race.js";
import { avatarEl, colorFor } from "/js/word-wars/track.js";

function cell(text, className = "") {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

/** pageOwners: Set of user ids whose writing can be read on this screen. */
export function renderResults(els, { race, racers, list, myId, isRacer, favId, cheersOf, myPeak, nowMs, bookTitle, pageOwners = new Set() }) {
    const startsAt = race.startsAt;
    const endedAt = raceEndedAt(race, nowMs);
    const target = race.targetWords.toLocaleString();
    const winner = list[0] && list[0].place === 1 ? list[0] : null;
    const me = list.find((r) => r.userId === myId);
    const nameOf = (r) => (r.userId === myId ? "You" : r.displayName);
    const timeOf = (r) => (r.finishedAt != null ? formatClock(r.finishedAt - startsAt) : null);
    const avgOf = (r) => averageWpm(r.words, startsAt, r.finishedAt ?? endedAt);
    const peakOf = (r) => (r.userId === myId ? Math.max(r.peakWpm, myPeak || 0) : r.peakWpm);

    els.eyebrow.textContent = `Race to ${target} words · Final`;

    let title;
    let sub;
    if (me) {
        if (me.place === 1) title = "You win";
        else if (me.place) title = `You finished ${ordinal(me.place)}`;
        else if (me.hasLeft) title = "You left the race";
        else title = "Out of time";
        sub = me.place
            ? `${target} words in ${timeOf(me)}, averaging ${avgOf(me)} wpm, with ${cheersOf(me)} cheers from the stands.`
            : `${me.words.toLocaleString()} of ${target} words.${winner ? ` ${winner.displayName} won in ${timeOf(winner)}.` : ""}`;
        sub += ` Your words are saved in ${bookTitle || "your book"}.`;
    } else {
        title = winner ? `${winner.displayName} wins` : "Nobody made the line";
        sub = winner ? `First to ${target} words in ${timeOf(winner)}, averaging ${avgOf(winner)} wpm.` : "Time ran out before anyone finished.";
        const fav = list.find((r) => r.userId === favId);
        if (fav && fav === winner) sub += " Your pick called it.";
        else if (fav) sub += ` Your pick, ${fav.displayName}, ${fav.place ? `finished ${ordinal(fav.place)}` : "didn't make the line"}.`;
    }
    els.title.textContent = title;
    els.sub.textContent = sub;

    const steps = [[list[1], 2], [list[0], 1], [list[2], 3]];
    els.podium.replaceChildren(...steps.map(([r, place]) => {
        const step = document.createElement("div");
        step.className = `ww-step is-p${place}`;
        if (r) {
            const name = document.createElement("span");
            name.className = "ww-step-name";
            name.textContent = nameOf(r);
            const meta = document.createElement("span");
            meta.className = "ww-step-meta";
            meta.textContent = r.finishedAt != null
                ? `${timeOf(r)} · ${avgOf(r)} wpm`
                : `${r.words.toLocaleString()} words`;
            step.append(avatarEl(r, r.userId === myId ? "var(--text)" : colorFor(racers, r.userId)), name, meta);
        }
        const block = document.createElement("div");
        block.className = "ww-block";
        block.textContent = String(place);
        step.append(block);
        return step;
    }));

    els.rows.replaceChildren(...list.map((r) => {
        const tr = document.createElement("tr");
        tr.classList.toggle("is-you", r.userId === myId);
        tr.classList.toggle("is-fav", r.userId === favId);
        const who = document.createElement("td");
        const dot = document.createElement("span");
        dot.className = "ww-dot";
        dot.style.setProperty("--c", r.userId === myId ? "var(--text)" : colorFor(racers, r.userId));
        who.append(dot, document.createTextNode(nameOf(r)));
        let time = timeOf(r);
        if (!time) time = r.hasLeft ? "Left" : "Out of time";
        const work = document.createElement("td");
        if (pageOwners.has(r.userId)) {
            const read = document.createElement("button");
            read.type = "button";
            read.className = "ww-read";
            read.dataset.readResult = r.userId;
            read.textContent = "Read";
            read.setAttribute("aria-label", `Read ${nameOf(r)}'s writing`);
            work.append(read);
        } else {
            work.textContent = r.userId === myId ? "Private" : "—";
            work.className = "ww-muted";
        }
        tr.append(
            cell(r.place ? ordinal(r.place) : "—"),
            who,
            cell(time),
            cell(r.words.toLocaleString(), "num"),
            cell(String(avgOf(r)), "num"),
            cell(String(peakOf(r)), "num"),
            cell(String(cheersOf(r)), "num"),
            work,
        );
        return tr;
    }));

    els.rematchBtn.classList.toggle("hidden", !isRacer && !race.rematchId);
    if (isRacer) {
        els.rematchBtn.textContent = race.rematchId ? "Join the rematch" : "Rematch";
    } else {
        els.rematchBtn.textContent = "Watch the rematch";
        els.rematchBtn.classList.toggle("hidden", !race.rematchId || !race.isPublic);
    }
}
