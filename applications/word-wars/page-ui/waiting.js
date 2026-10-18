/**
 * The waiting room before a race: who is in, the invite code, the prompt, the
 * host's settings, each racer's page settings and the Begin button.
 */
import { GONE_AFTER_MS, TARGET_CHOICES } from "@alysum/community/word-war-race.js";
import { avatarEl, colorFor } from "/js/word-wars/track.js";
import { mountPromptPicker } from "/js/word-wars/prompt-picker.js";

export const WRITE_IN_NEW = "new";

function names(list) {
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.length} writers`;
}

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
    onPrompt = () => {},
    onAskPrompt = () => {},
    onPageVisibility = () => {},
    onWriteIn = () => {},
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

    const picker = mountPromptPicker(els.promptPicker, { onChange: (prompt) => onPrompt(prompt) });

    els.targets.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-target]");
        if (btn && !btn.disabled) onTarget(Number(btn.dataset.target));
    });
    els.visibility.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-public]");
        if (btn && !btn.disabled) onVisibility(btn.dataset.public === "1");
    });
    els.pageSeg.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-page]");
        if (btn && !btn.disabled && !btn.classList.contains("is-on")) onPageVisibility(btn.dataset.page === "public");
    });
    els.bookSelect.addEventListener("change", () => onBook(els.bookSelect.value));
    els.writeInSelect.addEventListener("change", () => onWriteIn(els.writeInSelect.value));
    els.askPromptBtn.addEventListener("click", () => onAskPrompt());
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
        [els.beginBtn, els.joinBtn, els.leaveBtn, els.askPromptBtn].forEach((btn) => { btn.disabled = isBusy; });
    }

    let listKey = "";
    let chaptersKey = "";

    /**
     * chapters: [{ id, title }] for the racer's book, or null while it loads.
     * writeIn: WRITE_IN_NEW or a chapter id. newChapterTitle: what a new chapter would be called.
     */
    function render({ race, racers, lobby, myId, isRacer, nowMs, chapters, writeIn, newChapterTitle }) {
        const isHost = isRacer && race.hostId === myId;
        const host = lobby.find((r) => r.userId === race.hostId);
        const fresh = lobby.filter((r) => nowMs - r.lastSeenAt <= GONE_AFTER_MS);
        const isFull = lobby.length >= race.maxRacers;
        const me = lobby.find((r) => r.userId === myId);

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

        paintPrompt(race, lobby, me, isRacer, isHost);
        paintMyPage(me, isRacer, chapters, writeIn, newChapterTitle);
        paintSettings(race, me, isRacer, isHost, host, fresh, isFull);
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

    function paintPrompt(race, lobby, me, isRacer, isHost) {
        els.promptText.textContent = race.prompt || "Free write. No prompt this time.";
        els.promptText.classList.toggle("is-free", !race.prompt);
        els.promptText.classList.toggle("hidden", isHost);

        els.promptPicker.classList.toggle("hidden", !isHost);
        if (isHost) picker.setValue(race.prompt);

        const canAsk = isRacer && !isHost;
        els.askPromptBtn.classList.toggle("hidden", !canAsk);
        if (canAsk) {
            const hasAsked = !!me?.wantsNewPrompt;
            els.askPromptBtn.textContent = hasAsked ? "Asked for a different prompt" : "Ask for a different prompt";
            els.askPromptBtn.classList.toggle("is-on", hasAsked);
            els.askPromptBtn.disabled = hasAsked;
        }

        const askers = lobby.filter((r) => r.wantsNewPrompt).map((r) => r.displayName);
        els.promptAsks.classList.toggle("hidden", !isHost || !askers.length);
        if (isHost && askers.length) {
            els.promptAsks.textContent = `${names(askers)} asked for a different prompt.`;
        }
    }

    function paintMyPage(me, isRacer, chapters, writeIn, newChapterTitle) {
        els.myPageField.classList.toggle("hidden", !isRacer);
        if (!isRacer || !me) return;

        els.pageSeg.querySelectorAll("[data-page]").forEach((btn) => {
            const isOn = (btn.dataset.page === "public") === me.isPagePublic;
            btn.classList.toggle("is-on", isOn);
            btn.setAttribute("aria-checked", String(isOn));
        });
        els.pageHint.textContent = me.isPagePublic
            ? "Spectators can watch you write. Other racers can read it after the race."
            : "Only you see your page. You can share it once the race is over.";

        const key = JSON.stringify(chapters);
        if (key !== chaptersKey) {
            chaptersKey = key;
            const options = [Object.assign(document.createElement("option"), {
                value: WRITE_IN_NEW,
                textContent: "A new chapter for this race",
            })];
            for (const ch of chapters || []) {
                options.push(Object.assign(document.createElement("option"), { value: ch.id, textContent: ch.title }));
            }
            els.writeInSelect.replaceChildren(...options);
            els.writeInSelect.disabled = !chapters;
        }
        if (document.activeElement !== els.writeInSelect) els.writeInSelect.value = writeIn;
        if (els.writeInSelect.value !== writeIn) els.writeInSelect.value = WRITE_IN_NEW;

        if (!chapters) {
            els.writeInHint.textContent = "Loading your chapters…";
        } else if (els.writeInSelect.value === WRITE_IN_NEW) {
            els.writeInHint.textContent = `Adds a chapter called “${newChapterTitle}” to ${me.bookTitle}.`;
        } else {
            els.writeInHint.textContent = me.isPagePublic
                ? "Spectators will see this whole chapter, including what's already in it."
                : "Your words go at the end of this chapter, like in Studio.";
        }
    }

    function paintSettings(race, me, isRacer, isHost, host, fresh, isFull) {
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
