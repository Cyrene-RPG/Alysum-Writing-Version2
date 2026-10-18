/**
 * The racer's page: their real book, a chapter picker and the editor. Saves to
 * the book like Studio does. Only the word count ever leaves this page.
 */
import {
    addBodyChapter,
    lastOfKind,
    listBodyChapters,
    setChapterContent,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { recordTypedWords } from "@alysum/account/writing-stats.js";
import { countedWordDelta, isPasteLikeInput } from "@alysum/statistics/typed-input.js";
import { reviewSentencesForXp, recordPastedRegion } from "@alysum/statistics/sentence-review.js";
import { createRaceCounter, pageTextFromHtml } from "@alysum/community/word-war-race.js";
import { createAutosave } from "/js/editor/autosave.js";
import { mountDocument } from "/js/editor/document.js";
import { mountToolbar } from "/js/editor/toolbar.js";

function pastedKey(raceId) {
    return `alysum:word-wars:pasted:${raceId}`;
}

function readPasted(raceId) {
    try {
        return Math.max(0, Number(sessionStorage.getItem(pastedKey(raceId))) || 0);
    } catch {
        return 0;
    }
}

function writePasted(raceId, words) {
    try {
        sessionStorage.setItem(pastedKey(raceId), String(words));
    } catch {
        /* the count still works for this visit */
    }
}

/**
 * start: { chapterId } opens that chapter if it still exists; { newTitle }
 * adds a fresh chapter for the race. onChapterChange(chapterId) fires when the
 * racer switches chapters, so a shared page can follow them.
 */
export function mountWriter({
    els, book, booksApi, supabase, uid, raceId, targetWords,
    start = {}, onEdit = () => {}, onPaste = () => {}, onChapterChange = () => {},
}) {
    const { chapterList, chapterSelect, addChapterBtn, pageEl, toolbarMount, editorPane } = els;
    let current = withUpdatedWords(book);
    let counter = null;
    let pasted = readPasted(raceId);

    const chapters = () => listBodyChapters(current.sections).filter((ch) => ch && ch.kind !== "folder");
    let selectedId = chapters()[chapters().length - 1]?.id || "";

    const autosave = createAutosave({
        delay: 400,
        save: async (next) => {
            await booksApi.updateBook(next.id, {
                title: next.title,
                sections: next.sections,
                words: next.words,
                media_format: next.media_format,
            });
        },
    });

    const editor = mountDocument({
        pageEl,
        onInput: (html, event) => applyHtml(html, event),
    });
    mountToolbar({ mount: toolbarMount, editor, onTypewriter: () => {}, onFind: () => {} });
    // A race is not the full editor: drop Find and Typewriter.
    toolbarMount.querySelectorAll("[data-find-toggle], [data-typewriter]").forEach((el) => el.remove());

    // Tab indents like a normal writer. document.js turns Tab into "\t", which
    // collapses under white-space: normal, so catch it first.
    editorPane.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        const active = document.activeElement;
        if (active !== pageEl && !pageEl.contains(active)) return;
        event.preventDefault();
        event.stopPropagation();
        try {
            // Two em spaces render under white-space: normal; a tab would collapse.
            document.execCommand("insertText", false, "  ");
        } catch {
            /* ignore */
        }
    }, true);

    function currentChapter() {
        return chapters().find((ch) => ch.id === selectedId) || chapters()[0];
    }

    function bookWords() {
        return countWordsInSections(current.sections);
    }

    function applyHtml(html, event) {
        const chapter = currentChapter();
        if (!chapter) return;
        const isPaste = isPasteLikeInput(event);
        if (isPaste) recordPastedRegion(uid, chapter.content || "", html);
        const before = bookWords();
        current = withUpdatedWords({ ...current, sections: setChapterContent(current.sections, chapter.id, html) });
        const after = bookWords();
        if (isPaste && after > before) {
            pasted += after - before;
            writePasted(raceId, pasted);
            counter?.addPasted(after - before);
            onPaste();
        }
        const change = countedWordDelta(before, after, event);
        recordTypedWords({
            userId: uid,
            supabase,
            isLocal: false,
            added: Math.max(0, change),
            removed: Math.max(0, -change),
        });
        autosave.schedule(current);
        onEdit();
    }

    function paintChapters() {
        const list = chapters();
        chapterList.replaceChildren(...list.map((ch) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.dataset.ch = ch.id;
            btn.textContent = ch.title || "Untitled chapter";
            btn.classList.toggle("is-on", ch.id === selectedId);
            li.append(btn);
            return li;
        }));
        chapterSelect.replaceChildren(...list.map((ch) => {
            const opt = document.createElement("option");
            opt.value = ch.id;
            opt.textContent = ch.title || "Untitled chapter";
            return opt;
        }));
        chapterSelect.value = selectedId;
    }

    function openChapter(id) {
        const isSwitch = id !== selectedId;
        selectedId = id;
        paintChapters();
        editor.setHtml(currentChapter()?.content || "<p><br></p>");
        if (isSwitch) onChapterChange(selectedId);
    }

    async function addChapter() {
        addChapterBtn.disabled = true;
        try {
            await autosave.flush();
            current = withUpdatedWords({ ...current, sections: addBodyChapter(current.sections, "", null) });
            const added = lastOfKind(current.sections.body, "chapter", null);
            openChapter(added?.id || selectedId);
            autosave.schedule(current);
            await autosave.flush();
            editor.focus();
        } finally {
            addChapterBtn.disabled = false;
        }
    }

    chapterList.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-ch]");
        if (btn) openChapter(btn.dataset.ch);
    });
    chapterSelect.addEventListener("change", () => openChapter(chapterSelect.value));
    addChapterBtn.addEventListener("click", () => {
        void addChapter();
    });

    let createdChapterId = "";
    if (start.chapterId && chapters().some((ch) => ch.id === start.chapterId)) {
        selectedId = start.chapterId;
    } else if (start.newTitle || !chapters().length) {
        current = withUpdatedWords({ ...current, sections: addBodyChapter(current.sections, start.newTitle || "", null) });
        selectedId = lastOfKind(current.sections.body, "chapter", null)?.id || "";
        createdChapterId = selectedId;
        autosave.schedule(current);
    }
    const firstId = selectedId || chapters()[0]?.id || "";
    selectedId = "";
    openChapter(firstId);

    return {
        bookTitle: current.title || "your book",
        bookWords,
        /** The chapter this race added to the book, if it added one. */
        createdChapterId,
        get chapterId() {
            return selectedId;
        },
        /** What a public page shares: the open chapter's title and plain text. */
        page() {
            const chapter = currentChapter();
            return {
                chapterId: chapter?.id || "",
                title: chapter?.title || "Untitled chapter",
                text: pageTextFromHtml(editor.getHtml()),
            };
        },
        /** Start counting from the book's word count when the race began. Times are server time. */
        beginCount(startWords, startsAtMs, nowMs) {
            counter = createRaceCounter({ startWords, pastedWords: pasted, targetWords, startsAtMs });
            return counter.update(bookWords(), nowMs);
        },
        get startWords() {
            return counter ? counter.startWords : null;
        },
        count(nowMs) {
            return counter ? counter.update(bookWords(), nowMs) : { raw: 0, counted: 0, isOverLimit: false };
        },
        setEditable(isOn) {
            pageEl.contentEditable = isOn ? "true" : "false";
            editorPane.classList.toggle("is-locked", !isOn);
        },
        focus() {
            editor.focus();
        },
        flush() {
            return autosave.flush();
        },
        /** Save, then check the race's sentences for writing XP. Safe to call once at the end. */
        async seal() {
            await autosave.flush();
            try {
                await reviewSentencesForXp({
                    chapters: chapters(),
                    source: "word_wars",
                    roomId: raceId,
                    userId: uid,
                    isLocal: false,
                    supabase,
                });
            } catch {
                /* the words are saved either way */
            }
        },
    };
}
