/**
 * Results: podium (or, after a chill session, most words and crowd favourite),
 * full table, and the way into a rematch.
 */
import { averageWpm, formatClock, lengthLabel, ordinal, raceEndedAt } from "@alysum/community/word-war-race.js";
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
    const crowdFav = list.reduce((best, r) => (cheersOf(r) > (best ? cheersOf(best) : 0) ? r : best), null);

    if (race.mode === "chill") {
        renderChill(els, { race, racers, list, me, myId, favId, cheersOf, crowdFav, endedAt, bookTitle, nameOf, peakOf, pageOwners, isRacer });
        return;
    }

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
    els.podium.className = "ww-podium";
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
        let time = timeOf(r);
        if (!time) time = r.hasLeft ? "Left" : "Out of time";
        return resultRow(r, {
            racers, myId, favId, crowdFav, nameOf, pageOwners,
            cells: [
                r.place ? ordinal(r.place) : "—",
                time,
                r.words.toLocaleString(),
                String(avgOf(r)),
                String(peakOf(r)),
                String(cheersOf(r)),
            ],
        });
    }));

    paintRematch(els, race, isRacer, { again: "Rematch", join: "Join the rematch", watch: "Watch the rematch" });
}

function plural(n, word) {
    return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

/** cells: place, time, words, avg, peak, cheers (as text). */
function resultRow(r, { racers, myId, favId, crowdFav, nameOf, pageOwners, cells }) {
    const tr = document.createElement("tr");
    tr.classList.toggle("is-you", r.userId === myId);
    tr.classList.toggle("is-fav", r.userId === favId);
    const who = document.createElement("td");
    const dot = document.createElement("span");
    dot.className = "ww-dot";
    dot.style.setProperty("--c", r.userId === myId ? "var(--text)" : colorFor(racers, r.userId));
    who.append(dot, document.createTextNode(nameOf(r)));
    if (crowdFav && crowdFav.userId === r.userId) {
        const tag = document.createElement("span");
        tag.className = "ww-tag";
        tag.textContent = "Crowd favourite";
        who.append(tag);
    }
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
    const [place, time, words, avg, peak, cheers] = cells;
    tr.append(
        cell(place),
        who,
        cell(time),
        cell(words, "num"),
        cell(avg, "num"),
        cell(peak, "num"),
        cell(cheers, "num"),
        work,
    );
    return tr;
}

function paintRematch(els, race, isRacer, labels) {
    els.rematchBtn.classList.toggle("hidden", !isRacer && !race.rematchId);
    if (isRacer) {
        els.rematchBtn.textContent = race.rematchId ? labels.join : labels.again;
    } else {
        els.rematchBtn.textContent = labels.watch;
        els.rematchBtn.classList.toggle("hidden", !race.rematchId || !race.isPublic);
    }
}

function awardCard(label, r, meta, { racers, myId, nameOf }) {
    const card = document.createElement("div");
    card.className = "ww-award";
    const title = document.createElement("span");
    title.className = "ww-label";
    title.textContent = label;
    const name = document.createElement("span");
    name.className = "ww-step-name";
    name.textContent = nameOf(r);
    const info = document.createElement("span");
    info.className = "ww-step-meta";
    info.textContent = meta;
    card.append(title, avatarEl(r, r.userId === myId ? "var(--text)" : colorFor(racers, r.userId)), name, info);
    return card;
}

/** A chill session has no winner: words, time written and cheers for everyone. */
function renderChill(els, { race, racers, list, me, myId, favId, cheersOf, crowdFav, endedAt, bookTitle, nameOf, peakOf, pageOwners, isRacer }) {
    const startsAt = race.startsAt;
    // Writers can drop in after the start, so each one's time runs from when they joined.
    const startedAt = (r) => Math.max(startsAt, r.joinedAt || 0);
    const stoppedAt = (r) => Math.min(r.leftAt ?? endedAt, endedAt);
    const wroteFor = (r) => formatClock(Math.max(0, stoppedAt(r) - startedAt(r)));
    const avgOf = (r) => averageWpm(r.words, startedAt(r), stoppedAt(r));
    const top = list[0] && list[0].words > 0 ? list[0] : null;
    const writers = list.length;

    els.eyebrow.textContent = race.durationMin == null
        ? "Chill mode · Final"
        : `Chill mode · ${lengthLabel(race.durationMin)} · Final`;

    let title;
    let sub;
    if (me) {
        title = me.hasLeft ? "You left the session" : `You wrote ${plural(me.words, "word")}`;
        sub = `${wroteFor(me)} of writing, averaging ${avgOf(me)} wpm, with ${plural(cheersOf(me), "cheer")} from the stands.`;
        if (top && top !== me) sub += ` ${top.displayName} wrote the most: ${plural(top.words, "word")}.`;
        else if (top === me && writers > 1) sub += " The most of anyone.";
        if (crowdFav && crowdFav !== me) sub += ` Crowd favourite: ${crowdFav.displayName}.`;
        else if (crowdFav === me && writers > 1) sub += " The crowd's favourite, too.";
        sub += ` Your words are saved in ${bookTitle || "your book"}.`;
    } else {
        title = top ? `${top.displayName} wrote the most` : "Session over";
        sub = top
            ? `${plural(top.words, "word")} in ${wroteFor(top)}.`
            : "Nobody got any words down this time.";
        if (crowdFav) sub += ` Crowd favourite: ${crowdFav.displayName}, with ${plural(cheersOf(crowdFav), "cheer")}.`;
        const pick = list.find((r) => r.userId === favId);
        if (pick) sub += ` Your pick, ${pick.displayName}, wrote ${plural(pick.words, "word")}.`;
    }
    els.title.textContent = title;
    els.sub.textContent = sub;

    els.podium.className = "ww-awards";
    const cards = [];
    if (top) cards.push(awardCard("Most words", top, `${plural(top.words, "word")} · ${avgOf(top)} wpm`, { racers, myId, nameOf }));
    if (crowdFav) cards.push(awardCard("Crowd favourite", crowdFav, plural(cheersOf(crowdFav), "cheer"), { racers, myId, nameOf }));
    els.podium.replaceChildren(...cards);

    els.rows.replaceChildren(...list.map((r) => resultRow(r, {
        racers, myId, favId, crowdFav, nameOf, pageOwners,
        cells: [
            r.hasLeft ? "—" : ordinal(r.pos),
            r.hasLeft && r.leftAt < endedAt ? `Left after ${wroteFor(r)}` : wroteFor(r),
            r.words.toLocaleString(),
            String(avgOf(r)),
            String(peakOf(r)),
            String(cheersOf(r)),
        ],
    })));

    paintRematch(els, race, isRacer, { again: "Go again", join: "Join the next one", watch: "Watch the next one" });
}
