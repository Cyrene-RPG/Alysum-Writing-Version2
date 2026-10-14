/**
 * The waiting room before a race: who is in, the invite code, the host's
 * settings and the Begin button.
 */
import { GONE_AFTER_MS, TARGET_CHOICES } from "@alysum/community/word-war-race.js";
import { avatarEl, colorFor } from "/js/word-wars/track.js";

export function mountWaitingRoom(els, {
    books = [],
    onBegin = () => {},
    onJoin = () => {},
    onLeave = () => {},
    onTarget = () => {},
    onVisibility = () => {},
    onBook = () => {},
    onCopyCode = () => {},
    onCopyLink = () => {},
} = {}) {
    els.bookSelect.replaceChildren(...(books.length
        ? books.map((b) => {
            const opt = document.createElement("option");
            opt.value = b.id;
            opt.textContent = b.title || "Untitled";
            return opt;
        })
        : [Object.assign(document.createElement("option"), { value: "", textContent: "No books yet. Make one in Studio." })]));

    els.targets.replaceChildren(...TARGET_CHOICES.map((n) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.target = String(n);
        btn.setAttribute("role", "radio");
        btn.textContent = n.toLocaleString();
        return btn;
    }));

    els.targets.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-target]");
        if (btn && !btn.disabled) onTarget(Number(btn.dataset.target));
    });
    els.visibility.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-public]");
        if (btn && !btn.disabled) onVisibility(btn.dataset.public === "1");
    });
    els.bookSelect.addEventListener("change", () => onBook(els.bookSelect.value));
    els.beginBtn.addEventListener("click", () => onBegin());
    els.joinBtn.addEventListener("click", () => onJoin(els.bookSelect.value));
    els.leaveBtn.addEventListener("click", () => onLeave());
    els.copyCodeBtn.addEventListener("click", () => onCopyCode());
    els.copyLinkBtn.addEventListener("click", () => onCopyLink());

    function setError(message) {
        els.error.textContent = message || "";
        els.error.classList.toggle("hidden", !message);
    }

    function setBusy(isBusy) {
        [els.beginBtn, els.joinBtn, els.leaveBtn].forEach((btn) => { btn.disabled = isBusy; });
    }

    let listKey = "";

    function render({ race, racers, lobby, myId, isRacer, nowMs }) {
        const isHost = isRacer && race.hostId === myId;
        const host = lobby.find((r) => r.userId === race.hostId);
        const fresh = lobby.filter((r) => nowMs - r.lastSeenAt <= GONE_AFTER_MS);
        const isFull = lobby.length >= race.maxRacers;

        els.title.textContent = `Race to ${race.targetWords.toLocaleString()} words`;
        els.code.textContent = race.code || "——————";
        els.count.textContent = `${lobby.length}/${race.maxRacers}`;

        const nextKey = JSON.stringify([race.hostId, race.maxRacers, lobby.map((r) => [
            r.userId, r.displayName, r.bookTitle, r.avatarUrl, nowMs - r.lastSeenAt > GONE_AFTER_MS,
        ])]);
        if (nextKey !== listKey) {
            listKey = nextKey;
            paintList(race, racers, lobby, myId, nowMs);
        }

        paintSettings(race, racers, lobby, myId, isRacer, isHost, host, fresh, isFull);
    }

    function paintList(race, racers, lobby, myId, nowMs) {
        els.list.replaceChildren(...lobby.map((r) => {
            const li = document.createElement("li");
            const isGone = nowMs - r.lastSeenAt > GONE_AFTER_MS;
            li.classList.toggle("is-gone", isGone);
            const text = document.createElement("span");
            text.className = "ww-name";
            const name = document.createElement("b");
            name.textContent = r.userId === myId ? `${r.displayName} (you)` : r.displayName;
            const book = document.createElement("small");
            book.textContent = isGone ? "Gone quiet" : `Writing in ${r.bookTitle}`;
            text.append(name, book);
            li.append(avatarEl(r, colorFor(racers, r.userId)), text);
            if (r.userId === race.hostId) {
                const tag = document.createElement("span");
                tag.className = "ww-tag";
                tag.textContent = "Host";
                li.append(tag);
            }
            return li;
        }));
        for (let i = lobby.length; i < Math.min(race.maxRacers, lobby.length + 2); i += 1) {
            const li = document.createElement("li");
            li.className = "is-empty";
            li.textContent = "Open spot";
            els.list.append(li);
        }
    }

    function paintSettings(race, racers, lobby, myId, isRacer, isHost, host, fresh, isFull) {
        els.targets.querySelectorAll("[data-target]").forEach((btn) => {
            const isOn = Number(btn.dataset.target) === race.targetWords;
            btn.classList.toggle("is-on", isOn);
            btn.setAttribute("aria-checked", String(isOn));
            btn.disabled = !isHost;
        });
        els.visibility.querySelectorAll("[data-public]").forEach((btn) => {
            const isOn = (btn.dataset.public === "1") === race.isPublic;
            btn.classList.toggle("is-on", isOn);
            btn.setAttribute("aria-checked", String(isOn));
            btn.disabled = !isHost;
        });
        els.visibilityHint.textContent = race.isPublic
            ? "Anyone signed in can find this race and watch it."
            : "Only people with the code can join or watch.";

        const me = lobby.find((r) => r.userId === myId);
        if (me && document.activeElement !== els.bookSelect) els.bookSelect.value = me.bookId;
        els.bookLabel.textContent = isRacer ? "Your book" : "Race in";
        els.bookField.classList.toggle("hidden", !isRacer && isFull);

        els.beginBtn.classList.toggle("hidden", !isHost);
        els.beginBtn.disabled = fresh.length < 2;
        els.joinBtn.classList.toggle("hidden", isRacer || isFull);
        els.leaveBtn.textContent = isRacer ? "Leave" : "Back to Word Wars";

        let hint;
        if (isHost) {
            hint = fresh.length < 2
                ? "Share the code. You need at least one other writer to begin."
                : "Begin when everyone's in. There's a 5-second countdown.";
        } else if (isRacer) {
            hint = `Waiting for ${host?.displayName || "the host"} to begin.`;
        } else {
            hint = isFull
                ? "This race is full. Stay to watch it."
                : "You're watching. Join to race, or stay to watch the start.";
        }
        els.hint.textContent = hint;
        els.status.textContent = isRacer ? "First to the word count wins." : "You're in the stands.";
    }

    return { render, setError, setBusy };
}
