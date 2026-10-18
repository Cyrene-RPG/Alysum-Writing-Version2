/**
 * Prompts on screen. mountPromptPicker: free write, a prompt from the
 * collection (the word_war_prompts table), or the host's own; used on the hub
 * and in the host's waiting room. createPromptView: shows a prompt that may be
 * long or span several lines, folded with a "Show full prompt" button.
 */
import { PROMPT_MAX_CHARS } from "@alysum/community/word-war-race.js";
import { findPrompt, listPrompts, randomPrompt } from "@alysum/community/word-war-prompts.js";

const OWN_SETTLE_MS = 700;
const OWN_MAX_ROWS = 14;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

/** Long or multi-line prompts fold to two lines; the button opens the rest. */
export function createPromptView(textEl, toggleBtn, { freeText = "Free write. No prompt this time." } = {}) {
    let current;
    let isOpen = false;

    function refresh() {
        textEl.classList.toggle("is-folded", !isOpen);
        if (!toggleBtn) return;
        const isLong = isOpen || textEl.scrollHeight > textEl.clientHeight + 2;
        toggleBtn.classList.toggle("hidden", !current || !isLong);
        toggleBtn.textContent = isOpen ? "Show less" : "Show full prompt";
        toggleBtn.setAttribute("aria-expanded", String(isOpen));
    }

    toggleBtn?.addEventListener("click", () => {
        isOpen = !isOpen;
        refresh();
    });

    return {
        set(prompt) {
            const next = prompt || null;
            if (next !== current) {
                current = next;
                isOpen = false;
                textEl.textContent = next || freeText;
                textEl.classList.toggle("is-free", !next);
            }
            refresh();
        },
        refresh,
    };
}

export function mountPromptPicker(root, { onChange = () => {} } = {}) {
    let mode = "free";
    let listed = null;
    let prompts = [];
    let isLoaded = false;
    let loadError = "";
    let pendingValue;
    let wantsRandom = false;
    let ownTimer = 0;
    let isDisabled = false;

    const seg = el("div", "ww-seg");
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", "Prompt");
    const modes = [["free", "Free write"], ["list", "Pick a prompt"], ["own", "Write your own"]].map(([value, label]) => {
        const btn = el("button", "", label);
        btn.type = "button";
        btn.dataset.mode = value;
        btn.setAttribute("role", "radio");
        seg.append(btn);
        return btn;
    });

    const freeHint = el("p", "ww-hint", "No prompt. Everyone writes whatever they like.");

    // Picked prompt: shown in full (it scrolls if it's long), then ways to change it.
    const listBox = el("div", "ww-prompt-pick");
    const listText = el("p", "ww-prompt-full");
    const listMeta = el("p", "ww-hint");
    const another = el("button", "ww-btn ww-btn-small", "Another random one");
    another.type = "button";
    const browseBtn = el("button", "ww-btn ww-btn-small", "Browse all");
    browseBtn.type = "button";
    browseBtn.setAttribute("aria-expanded", "false");
    const listRow = el("div", "ww-row");
    listRow.append(another, browseBtn);

    const browse = el("div", "ww-prompt-browse hidden");
    const search = el("input", "ww-input");
    search.type = "search";
    search.placeholder = "Search prompts, or type a number like #12";
    search.setAttribute("aria-label", "Search prompts");
    const browseList = el("ol", "ww-prompt-list");
    const noMatch = el("p", "ww-hint hidden", "No prompts match that.");
    browse.append(search, browseList, noMatch);
    listBox.append(listText, listMeta, listRow, browse);

    // Own prompt: grows with what's typed; line breaks are kept.
    const ownBox = el("div", "ww-prompt-own");
    const ownInput = el("textarea", "ww-textarea");
    ownInput.rows = 4;
    ownInput.maxLength = PROMPT_MAX_CHARS;
    ownInput.placeholder = "Write a prompt for everyone in the race. Dialogue, a scene, a list of examples: line breaks are kept.";
    ownInput.setAttribute("aria-label", "Your prompt");
    const ownCount = el("p", "ww-hint");
    ownBox.append(ownInput, ownCount);

    root.replaceChildren(seg, freeHint, listBox, ownBox);

    function value() {
        if (mode === "list") return listed;
        if (mode === "own") return ownInput.value.trim() || null;
        return null;
    }

    function growOwn() {
        ownInput.style.height = "auto";
        const line = parseFloat(getComputedStyle(ownInput).lineHeight) || 20;
        ownInput.style.height = `${Math.min(ownInput.scrollHeight, line * OWN_MAX_ROWS + 24)}px`;
    }

    function buildBrowseList() {
        browseList.replaceChildren(...prompts.map((p) => {
            const li = el("li");
            const pick = el("button");
            pick.type = "button";
            pick.dataset.promptId = String(p.id);
            pick.append(el("span", "ww-prompt-num", `#${p.id}`), el("span", "ww-prompt-preview", p.text));
            li.append(pick);
            return li;
        }));
    }

    function paint() {
        modes.forEach((btn) => {
            const isOn = btn.dataset.mode === mode;
            btn.classList.toggle("is-on", isOn);
            btn.setAttribute("aria-checked", String(isOn));
            btn.disabled = isDisabled;
        });
        freeHint.classList.toggle("hidden", mode !== "free");
        listBox.classList.toggle("hidden", mode !== "list");
        ownBox.classList.toggle("hidden", mode !== "own");

        if (!isLoaded) {
            listText.textContent = loadError
                ? "Couldn't load the prompt list. Free write and your own prompt still work."
                : "Loading prompts…";
            listText.classList.add("is-free");
            listMeta.textContent = "";
        } else {
            listText.textContent = listed || "";
            listText.classList.remove("is-free");
            const picked = findPrompt(prompts, listed);
            listMeta.textContent = picked ? `Prompt #${picked.id}` : "";
        }
        const canBrowse = isLoaded && prompts.length > 0 && !isDisabled;
        another.disabled = !canBrowse;
        browseBtn.disabled = !canBrowse;
        if (!browseBtn.getAttribute("aria-expanded") || browseBtn.getAttribute("aria-expanded") === "false") {
            browseBtn.textContent = `Browse all ${prompts.length || ""}`.trim();
        }
        browseList.querySelectorAll("[data-prompt-id]").forEach((btn) => {
            btn.classList.toggle("is-on", findPrompt(prompts, listed)?.id === Number(btn.dataset.promptId));
            btn.disabled = isDisabled;
        });
        ownInput.disabled = isDisabled;
        search.disabled = isDisabled;
        ownCount.textContent = `${ownInput.value.length.toLocaleString()} / ${PROMPT_MAX_CHARS.toLocaleString()} characters`;
    }

    function emit() {
        paint();
        onChange(value());
    }

    function setBrowseOpen(isOpen) {
        browse.classList.toggle("hidden", !isOpen);
        browseBtn.setAttribute("aria-expanded", String(isOpen));
        browseBtn.textContent = isOpen ? "Close list" : `Browse all ${prompts.length}`;
        if (isOpen) search.focus();
    }

    seg.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-mode]");
        if (!btn || btn.disabled || btn.dataset.mode === mode) return;
        mode = btn.dataset.mode;
        if (mode === "list" && !listed) {
            if (!isLoaded) {
                // Pick one as soon as the list arrives.
                wantsRandom = true;
                paint();
                return;
            }
            listed = randomPrompt(prompts)?.text || null;
            if (!listed) {
                paint();
                return;
            }
        }
        if (mode === "own") {
            paint();
            growOwn();
            ownInput.focus();
            // Nothing to send until they write something.
            if (!ownInput.value.trim()) return;
        }
        emit();
    });
    another.addEventListener("click", () => {
        listed = randomPrompt(prompts, listed)?.text || listed;
        emit();
    });
    browseBtn.addEventListener("click", () => setBrowseOpen(browse.classList.contains("hidden")));
    search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        const number = query.replace(/^#/, "");
        let shown = 0;
        browseList.querySelectorAll("li").forEach((li, i) => {
            const p = prompts[i];
            const isMatch = !query || (/^\d+$/.test(number) ? String(p.id) === number : p.text.toLowerCase().includes(query));
            li.classList.toggle("hidden", !isMatch);
            if (isMatch) shown += 1;
        });
        noMatch.classList.toggle("hidden", shown > 0);
    });
    browseList.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-prompt-id]");
        if (!pick) return;
        listed = prompts.find((p) => p.id === Number(pick.dataset.promptId))?.text || listed;
        setBrowseOpen(false);
        emit();
    });
    ownInput.addEventListener("input", () => {
        paint();
        growOwn();
        clearTimeout(ownTimer);
        ownTimer = setTimeout(() => {
            if (ownInput.value.trim()) onChange(value());
        }, OWN_SETTLE_MS);
    });

    /** Show a prompt that came from the server, without clobbering what the host is typing. */
    function setValue(prompt) {
        const next = prompt || null;
        if (!isLoaded) {
            // Whether it's from the list can't be known yet; apply once the list arrives.
            pendingValue = next;
            return;
        }
        if (next === value() || document.activeElement === ownInput) return;
        if (!next) {
            if (mode === "own" && !ownInput.value.trim()) return;
            mode = "free";
        } else if (findPrompt(prompts, next)) {
            mode = "list";
            listed = next;
        } else {
            mode = "own";
            ownInput.value = next;
            growOwn();
        }
        paint();
    }

    listPrompts()
        .then((list) => {
            prompts = list;
            isLoaded = true;
            buildBrowseList();
            if (pendingValue !== undefined) {
                setValue(pendingValue);
                pendingValue = undefined;
            }
            if (wantsRandom && mode === "list" && !listed) {
                wantsRandom = false;
                listed = randomPrompt(prompts)?.text || null;
                if (listed) emit();
            }
            paint();
        })
        .catch((err) => {
            loadError = err.message;
            paint();
        });

    paint();

    return {
        getValue: value,
        setValue,
        setDisabled(disabled) {
            isDisabled = disabled;
            paint();
        },
    };
}
