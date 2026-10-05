/**
 * Studio's "Import manuscript" dialog: pick or drop a file, review the chapters
 * found, then create the book and open it in the editor.
 */
import { buildImportedBook, importSplitChoices } from "@alysum/writing-engine/manuscript-import.js";
import { ACCEPTED_FILES, ManuscriptReadError, readManuscriptFile } from "./manuscript-reader.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function plural(n, one, many) {
    return `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;
}

function methodLabel(method) {
    if (method?.kind === "heading") return `Heading ${method.level}`;
    if (method?.kind === "lines") return "“Chapter” lines";
    return "one chapter";
}

function isQuotaError(error) {
    return error?.name === "QuotaExceededError" || /quota/i.test(String(error?.message || ""));
}

/**
 * @param {{ api: object, onCreated: (book: object) => void, returnFocus?: () => HTMLElement | null }} options
 */
export function bindManuscriptImport({ api, onCreated, returnFocus }) {
    const $ = (id) => document.getElementById(id);
    const els = {
        overlay: $("importOverlay"),
        close: $("importClose"),
        pick: $("importPick"),
        drop: $("importDrop"),
        file: $("importFile"),
        busy: $("importBusy"),
        busyText: $("importBusyText"),
        review: $("importReview"),
        title: $("importBookTitle"),
        summary: $("importSummary"),
        split: $("importSplit"),
        outline: $("importOutline"),
        notes: $("importNotes"),
        error: $("importError"),
        back: $("importBack"),
        cancel: $("importCancel"),
        confirm: $("importConfirm"),
    };
    if (!els.overlay) return { open() {}, bindDrop() {} };
    els.file.accept = ACCEPTED_FILES;

    let step = "closed";
    let parsed = null;
    let book = null;
    let titleEdited = false;
    let readToken = 0;

    function showError(message) {
        els.error.textContent = message || "";
        els.error.hidden = !message;
    }

    function setStep(next) {
        step = next;
        els.pick.hidden = next !== "pick";
        els.busy.hidden = next !== "busy" && next !== "saving";
        els.review.hidden = next !== "review";
        els.back.hidden = next !== "review";
        els.confirm.hidden = next !== "review";
        const saving = next === "saving";
        els.close.disabled = saving;
        els.cancel.disabled = saving;
    }

    function open(file) {
        if (step === "saving") return;
        if (step === "closed") {
            els.overlay.hidden = false;
            document.documentElement.classList.add("is-import-open");
        }
        showError("");
        if (file) {
            void readFile(file);
        } else {
            setStep("pick");
            els.drop.focus();
        }
    }

    function close() {
        if (step === "saving" || step === "closed") return;
        readToken += 1;
        step = "closed";
        parsed = null;
        book = null;
        els.overlay.hidden = true;
        els.file.value = "";
        document.documentElement.classList.remove("is-import-open");
        returnFocus?.()?.focus();
    }

    async function readFile(file) {
        const token = ++readToken;
        showError("");
        els.busyText.textContent = `Reading “${file.name}”…`;
        setStep("busy");
        try {
            const result = await readManuscriptFile(file);
            if (token !== readToken) return;
            parsed = result;
            titleEdited = false;
            const choices = importSplitChoices(result.blocks);
            els.split.innerHTML = choices
                .map((choice) => `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`)
                .join("");
            els.split.value = "auto";
            if (!rebuild("auto")) {
                setStep("pick");
                return;
            }
            setStep("review");
            els.confirm.focus();
        } catch (error) {
            if (token !== readToken) return;
            if (!(error instanceof ManuscriptReadError)) console.error("Manuscript import failed", error);
            showError(error instanceof ManuscriptReadError
                ? error.message
                : "Something went wrong reading this file. Try again, or save it as Word (.docx) and import that.");
            setStep("pick");
        } finally {
            els.file.value = "";
        }
    }

    function rebuild(split) {
        try {
            book = buildImportedBook(parsed.blocks, {
                split,
                title: parsed.title,
                documentTitle: parsed.documentTitle,
                fallbackTitle: parsed.fallbackTitle,
            });
        } catch (error) {
            book = null;
            showError(error?.message || "This manuscript couldn’t be split into chapters.");
            return false;
        }
        showError("");
        if (!titleEdited) els.title.value = book.title;
        const autoOption = els.split.querySelector('option[value="auto"]');
        if (autoOption && split === "auto") autoOption.textContent = `Automatic (${methodLabel(book.method)})`;
        paintReview();
        return true;
    }

    function paintReview() {
        const parts = book.partCount ? ` in ${plural(book.partCount, "part", "parts")}` : "";
        els.summary.textContent = `${plural(book.chapterCount, "chapter", "chapters")}${parts} · ${plural(book.words, "word", "words")} · ${parsed.kind}`;
        els.outline.innerHTML = book.outline.map((row) => {
            const classes = [
                row.kind === "part" ? "is-part" : "",
                row.depth ? "is-nested" : "",
                row.kind === "front" || row.kind === "back" ? "is-matter" : "",
            ].filter(Boolean).join(" ");
            const tag = row.kind === "front" ? "Front" : row.kind === "back" ? "Back" : row.kind === "part" ? "Part" : "";
            const count = row.kind === "part"
                ? plural(row.chapters, "chapter", "chapters")
                : plural(row.words, "word", "words");
            return `<li class="${classes}"><span class="import-outline-name">${tag ? `<span class="import-outline-tag">${tag}</span>` : ""}${escapeHtml(row.title)}</span><span class="import-outline-words">${count}</span></li>`;
        }).join("");
        const notes = [...new Set([...(parsed.notes || []), ...book.notes])];
        els.notes.innerHTML = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
        els.notes.hidden = notes.length === 0;
    }

    async function confirm() {
        if (!book || step !== "review") return;
        const title = els.title.value.trim() || book.title;
        showError("");
        els.busyText.textContent = `Creating “${title}”…`;
        setStep("saving");
        try {
            const created = await api.insertBook({ title, sections: book.sections, media_format: "novel" });
            // Cloud save failed and the device copy didn't fit either: nothing was kept.
            if (!created?.id || (api.mode === "cloud" && created._synced === false && !api.peekBook?.(created.id))) {
                throw new Error("not-saved");
            }
            step = "closed";
            onCreated(created);
        } catch (error) {
            if (error?.message !== "not-saved") console.error("Saving imported book failed", error);
            setStep("review");
            showError(api.mode === "local" && isQuotaError(error)
                ? "This book is too big to keep in this browser without an account. Sign in, then import it again."
                : "Couldn’t save the imported book. Check your connection and try again.");
        }
    }

    els.drop.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", () => {
        const file = els.file.files?.[0];
        if (file) void readFile(file);
    });
    els.split.addEventListener("change", () => {
        if (parsed) rebuild(els.split.value);
    });
    els.title.addEventListener("input", () => {
        titleEdited = true;
    });
    els.title.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void confirm();
        }
    });
    els.confirm.addEventListener("click", () => void confirm());
    els.back.addEventListener("click", () => {
        readToken += 1;
        parsed = null;
        book = null;
        showError("");
        setStep("pick");
        els.drop.focus();
    });
    els.cancel.addEventListener("click", close);
    els.close.addEventListener("click", close);
    els.overlay.addEventListener("mousedown", (event) => {
        if (event.target === els.overlay && step === "pick") close();
    });
    document.addEventListener("keydown", (event) => {
        if (step === "closed") return;
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== "Tab") return;
        // Keep keyboard focus inside the dialog.
        const focusable = [...els.overlay.querySelectorAll("button, input, select")]
            .filter((el) => !el.disabled && !el.hidden && el.type !== "file" && el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        } else if (!els.overlay.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        }
    });

    /** Dropping a file anywhere on the page opens the import with it. */
    function bindDrop(target) {
        let depth = 0;
        const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
        const setDragging = (on) => {
            document.body.classList.toggle("is-file-drag", on);
            els.drop.classList.toggle("is-dragover", on);
        };
        target.addEventListener("dragenter", (event) => {
            if (!hasFiles(event) || step === "saving") return;
            event.preventDefault();
            depth += 1;
            setDragging(true);
        });
        target.addEventListener("dragover", (event) => {
            if (!hasFiles(event) || step === "saving") return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        });
        target.addEventListener("dragleave", () => {
            depth = Math.max(0, depth - 1);
            if (!depth) setDragging(false);
        });
        target.addEventListener("drop", (event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            depth = 0;
            setDragging(false);
            if (step === "saving") return;
            const file = event.dataTransfer.files?.[0];
            if (file) open(file);
        });
    }

    return { open, bindDrop };
}
