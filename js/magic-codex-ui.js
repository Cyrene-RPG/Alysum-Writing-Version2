/**
 * Arcane Codex UI for magic system worksheets.
 */

import { upsertEncyclopediaLink, buildCodexFieldHref } from "./encyclopedia-links-store.js";
import {
    normalizeEncyclopediaPlain,
    serializeEncBody,
    plainToEncLinkHtml,
    plainToDisplayText
} from "./encyclopedia-wikilinks.js";
import {
    showEncyclopediaLinkPrompt,
    hideEncyclopediaLinkPrompt
} from "./encyclopedia-link-ui.js";

export function magicStorageKey(type, encyclopediaId) {
    const base = "alysum-magic-codex-" + type + "-v1";
    return encyclopediaId ? base + "-" + encyclopediaId : base;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   theme: "soft" | "hard",
 *   sections: { id: string, title: string, glyph: string, questions: [string, string][] }[],
 *   intro: string,
 *   storageKey: string,
 *   compileHeading: string,
 * }} config
 * @returns {{ destroy: () => void }}
 */
export function mountMagicCodex(root, config) {
    const {
        sections,
        intro,
        storageKey,
        compileHeading,
        nameLabel = "Name of this magic",
        taglineLabel = "Epithet or tagline",
        namePlaceholder = "Unnamed power",
        taglinePlaceholder = "Optional",
        manuscriptTitle = "Your magic manuscript",
        onFieldChange = null,
        linkContext = null
    } = config;

    root.replaceChildren();

    const introBlock = document.createElement("div");
    introBlock.className = "mc-intro";
    const introP = document.createElement("p");
    introP.textContent = intro;
    introBlock.appendChild(introP);
    root.appendChild(introBlock);

    const naming = document.createElement("div");
    naming.className = "mc-naming";

    function addNameField(labelText, key, placeholder) {
        const wrap = document.createElement("div");
        const label = document.createElement("label");
        label.textContent = labelText;
        const input = document.createElement("input");
        input.dataset.codexTop = key;
        input.placeholder = placeholder;
        input.autocomplete = "off";
        wrap.append(label, input);
        naming.appendChild(wrap);
    }

    addNameField(nameLabel, "systemName", namePlaceholder);
    addNameField(taglineLabel, "systemTagline", taglinePlaceholder);
    root.appendChild(naming);

    const layout = document.createElement("div");
    layout.className = "mc-layout";
    const chaptersNav = document.createElement("nav");
    chaptersNav.className = "mc-chapters";
    chaptersNav.setAttribute("aria-label", "Chapters");
    const scroll = document.createElement("div");
    scroll.className = "mc-scroll";
    layout.append(chaptersNav, scroll);
    root.appendChild(layout);

    const dock = document.createElement("div");
    dock.className = "mc-dock";
    const dockLeft = document.createElement("div");
    const statusEl = document.createElement("p");
    statusEl.className = "mc-dock-status";
    statusEl.dataset.codexStatus = "";
    statusEl.textContent = "Ready";
    const progressEl = document.createElement("p");
    progressEl.className = "mc-dock-progress";
    progressEl.dataset.codexProgress = "";
    dockLeft.append(statusEl, progressEl);

    const dockActions = document.createElement("div");
    dockActions.className = "mc-dock-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "mc-dock-btn ghost";
    clearBtn.dataset.codexClear = "";
    clearBtn.textContent = "Clear chapter";
    const openMsBtn = document.createElement("button");
    openMsBtn.type = "button";
    openMsBtn.className = "mc-dock-btn";
    openMsBtn.dataset.codexManuscriptOpen = "";
    openMsBtn.textContent = "View manuscript";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "mc-dock-btn primary";
    copyBtn.dataset.codexCopy = "";
    copyBtn.textContent = "Copy";
    dockActions.append(clearBtn, openMsBtn, copyBtn);
    dock.append(dockLeft, dockActions);
    document.body.appendChild(dock);

    const manuscript = document.createElement("div");
    manuscript.className = "mc-manuscript hidden";
    manuscript.setAttribute("role", "dialog");
    manuscript.setAttribute("aria-modal", "true");

    const sheet = document.createElement("div");
    sheet.className = "mc-manuscript-sheet";
    const msHead = document.createElement("div");
    msHead.className = "mc-manuscript-head";
    const msTitle = document.createElement("h3");
    msTitle.textContent = manuscriptTitle;
    const msClose = document.createElement("button");
    msClose.type = "button";
    msClose.className = "mc-link";
    msClose.dataset.codexManuscriptClose = "";
    msClose.textContent = "Close";
    msHead.append(msTitle, msClose);

    const manuscriptBody = document.createElement("pre");
    manuscriptBody.className = "mc-manuscript-body";
    manuscriptBody.dataset.codexManuscriptBody = "";

    const msFoot = document.createElement("div");
    msFoot.className = "mc-manuscript-foot";
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "mc-dock-btn";
    downloadBtn.dataset.codexDownload = "";
    downloadBtn.textContent = "Download";
    const copyAllBtn = document.createElement("button");
    copyAllBtn.type = "button";
    copyAllBtn.className = "mc-dock-btn primary";
    copyAllBtn.dataset.codexCopySheet = "";
    copyAllBtn.textContent = "Copy all";
    msFoot.append(downloadBtn, copyAllBtn);
    sheet.append(msHead, manuscriptBody, msFoot);
    manuscript.appendChild(sheet);
    document.body.appendChild(manuscript);

    function defaultState() {
        return {
            answers: {},
            activeSectionId: sections[0]?.id || "",
            updatedAt: 0
        };
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
        } catch {
            return defaultState();
        }
    }

    let state = loadState();
    let activeSectionId = state.activeSectionId || sections[0]?.id || "";

    function valueFor(key) {
        return state.answers[key] || "";
    }

    function sectionHasAnswers(section) {
        return section.questions.some(([key]) => valueFor(key).trim());
    }

    function saveState() {
        state.activeSectionId = activeSectionId;
        state.updatedAt = Date.now();
        localStorage.setItem(storageKey, JSON.stringify(state));
        statusEl.textContent = "Saved on this device";
        statusEl.className = "mc-dock-status saved";
        refreshProgress();
        refreshChapterDots();
        refreshManuscript();
    }

    function setValue(key, value) {
        state.answers[key] = value;
        if (typeof onFieldChange === "function") onFieldChange(key, value);
        statusEl.textContent = "Writing…";
        statusEl.className = "mc-dock-status";
        clearTimeout(setValue.timer);
        setValue.timer = setTimeout(saveState, 280);
    }

    function compileText() {
        const name = valueFor("systemName").trim() || "Unnamed magic";
        const lines = ["# " + name];
        if (valueFor("systemTagline").trim()) {
            lines.push("_" + plainToDisplayText(valueFor("systemTagline").trim()) + "_");
        }
        lines.push("", "## " + compileHeading, "");

        for (const section of sections) {
            const blocks = section.questions
                .filter(([key]) => valueFor(key).trim())
                .map(
                    ([key, question]) =>
                        question + "\n\n" + plainToDisplayText(valueFor(key).trim())
                );
            if (!blocks.length) continue;
            lines.push("## " + section.title);
            lines.push(blocks.join("\n\n"));
            lines.push("");
        }

        return lines.join("\n").trim();
    }

    function fieldKeyToSectionId(fieldKey) {
        const section = sections.find((s) => s.questions.some(([k]) => k === fieldKey));
        return section?.id || "";
    }

    function escapeEditorHtml(plain) {
        return String(plain || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>") || "<br>";
    }

    function saveEditor(editor, key, reRenderLinks) {
        const raw = linkContext ? serializeEncBody(editor) : editor.innerText;
        const normalized = linkContext ? normalizeEncyclopediaPlain(raw) : raw;
        state.answers[key] = normalized;
        if (reRenderLinks && linkContext) {
            editor.innerHTML = plainToEncLinkHtml(normalized);
        }
        if (typeof onFieldChange === "function") onFieldChange(key, normalized);
        statusEl.textContent = "Writing…";
        statusEl.className = "mc-dock-status";
        clearTimeout(saveEditor.timer);
        saveEditor.timer = setTimeout(saveState, 280);
        const entry = editor.closest(".mc-entry");
        if (entry) entry.classList.toggle("is-answered", !!normalized.trim());
        return normalized;
    }

    function createLinkForSelection(editor, key, question, phrase) {
        if (!linkContext) return;
        const trimmed = phrase.trim();
        if (trimmed.length < 2) return;

        const href = buildCodexFieldHref(
            linkContext.page,
            linkContext.queryParams,
            key
        );
        upsertEncyclopediaLink({
            phrase: trimmed,
            target: {
                href,
                page: linkContext.page,
                queryParams: { ...linkContext.queryParams },
                storageKey: linkContext.storageKey || storageKey,
                fieldKey: key,
                sectionId: fieldKeyToSectionId(key),
                sheetLabel: linkContext.sheetLabel || "",
                fieldLabel: question
            }
        });

        const sel = window.getSelection();
        if (sel?.rangeCount && editor.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const tn = document.createTextNode(`[[${trimmed}]]`);
            range.insertNode(tn);
            range.setStartAfter(tn);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        saveEditor(editor, key, true);
        saveState();
    }

    function bindEditorLinks(editor) {
        if (!linkContext) return;
        const key = () => keyFromEditor(editor);
        let linkRenderTimer = null;

        editor.addEventListener("mouseup", () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
            const phrase = sel.toString().trim();
            if (phrase.length < 2 || phrase.includes("\n")) return;
            if (/^\[\[/.test(phrase)) return;

            const range = sel.rangeCount ? sel.getRangeAt(0) : null;
            const rect = range?.getBoundingClientRect();
            if (!rect?.width) return;

            const key = editor.dataset.codexField;
            const question = editor.dataset.codexQuestion || "";

            showEncyclopediaLinkPrompt({
                rect,
                phrase,
                onYes: () => createLinkForSelection(editor, key, question, phrase)
            });
        });

        editor.addEventListener("input", () => {
            saveEditor(editor, key(), false);
            clearTimeout(linkRenderTimer);
            linkRenderTimer = setTimeout(() => saveEditor(editor, key(), true), 550);
        });
        editor.addEventListener("blur", () => {
            clearTimeout(linkRenderTimer);
            saveEditor(editor, key(), true);
            saveState();
        });

        editor.addEventListener("click", (e) => {
            const a = e.target.closest("a.mc-enc-link");
            if (!a || !editor.contains(a)) return;
            e.preventDefault();
            const href = a.getAttribute("href");
            if (href) location.href = href;
        });
    }

    function keyFromEditor(editor) {
        return editor.dataset.codexField || "";
    }

    function applyFieldHash() {
        const m = location.hash.match(/^#mc-field=(.+)$/);
        if (!m) return;
        const fieldKey = decodeURIComponent(m[1]);
        const section = sections.find((s) => s.questions.some(([k]) => k === fieldKey));
        if (!section) return;
        activeSectionId = section.id;
        state.activeSectionId = activeSectionId;
        renderAll();
        requestAnimationFrame(() => {
            const el = scroll.querySelector(`[data-codex-field="${CSS.escape(fieldKey)}"]`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.focus();
        });
    }

    function refreshManuscript() {
        manuscriptBody.textContent = compileText() || "Your manuscript will appear here as you answer.";
    }

    function refreshProgress() {
        const allKeys = sections.flatMap((s) => s.questions.map(([k]) => k)).concat(["systemName", "systemTagline"]);
        const filled = allKeys.filter((k) => valueFor(k).trim()).length;
        const pct = allKeys.length ? Math.round((filled / allKeys.length) * 100) : 0;
        progressEl.textContent = pct + "% inscribed";
    }

    function refreshChapterDots() {
        chaptersNav.querySelectorAll(".mc-chapter-btn").forEach((btn) => {
            const section = sections.find((s) => s.id === btn.dataset.section);
            if (section) btn.classList.toggle("has-answers", sectionHasAnswers(section));
        });
    }

    function bindTopFields() {
        root.querySelectorAll("[data-codex-top]").forEach((input) => {
            const key = input.dataset.codexTop;
            input.value = valueFor(key);
            input.addEventListener("input", () => setValue(key, input.value));
        });
    }

    function renderChapter(section) {
        scroll.replaceChildren();
        const panel = document.createElement("article");
        panel.className = "mc-chapter-panel is-visible";

        const head = document.createElement("header");
        head.className = "mc-chapter-head";
        const glyph = document.createElement("span");
        glyph.className = "mc-chapter-glyph-large";
        glyph.textContent = section.glyph;
        const h2 = document.createElement("h2");
        h2.textContent = section.title;
        head.append(glyph, h2);

        const entries = document.createElement("div");
        entries.className = "mc-entries";

        for (const [key, question] of section.questions) {
            const entry = document.createElement("div");
            entry.className = "mc-entry" + (valueFor(key).trim() ? " is-answered" : "");
            const label = document.createElement("label");
            label.textContent = question;
            const editor = document.createElement("div");
            editor.className = "mc-entry-editor";
            editor.contentEditable = "true";
            editor.dataset.codexField = key;
            editor.dataset.codexQuestion = question;
            editor.setAttribute("role", "textbox");
            editor.setAttribute("aria-multiline", "true");
            const initial = valueFor(key);
            editor.innerHTML = linkContext
                ? plainToEncLinkHtml(initial)
                : escapeEditorHtml(initial);
            if (linkContext) {
                bindEditorLinks(editor);
            } else {
                editor.addEventListener("input", () => {
                    setValue(key, editor.innerText);
                    entry.classList.toggle("is-answered", !!editor.innerText.trim());
                });
            }
            entry.append(label, editor);
            entries.appendChild(entry);
        }

        panel.append(head, entries);
        scroll.appendChild(panel);
    }

    function renderNav() {
        chaptersNav.replaceChildren();
        sections.forEach((section) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
                "mc-chapter-btn" +
                (section.id === activeSectionId ? " is-active" : "") +
                (sectionHasAnswers(section) ? " has-answers" : "");
            btn.dataset.section = section.id;
            const g = document.createElement("span");
            g.className = "mc-chapter-glyph";
            g.textContent = section.glyph;
            const label = document.createElement("span");
            label.textContent = section.title;
            const dot = document.createElement("span");
            dot.className = "mc-chapter-dot";
            btn.append(g, label, dot);
            btn.addEventListener("click", () => {
                activeSectionId = section.id;
                state.activeSectionId = activeSectionId;
                localStorage.setItem(storageKey, JSON.stringify(state));
                renderAll();
            });
            chaptersNav.appendChild(btn);
        });
    }

    function renderAll() {
        renderNav();
        const section = sections.find((s) => s.id === activeSectionId) || sections[0];
        if (section) renderChapter(section);
        refreshProgress();
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            statusEl.textContent = "Copied";
            statusEl.className = "mc-dock-status saved";
        } catch {
            alert("Could not copy — select the manuscript text manually.");
        }
    }

    function downloadMarkdown() {
        const text = compileText();
        const slug = (valueFor("systemName") || "magic-codex")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const blob = new Blob([text], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (slug || "magic-codex") + ".md";
        a.click();
        URL.revokeObjectURL(url);
    }

    clearBtn.addEventListener("click", () => {
        const section = sections.find((s) => s.id === activeSectionId);
        if (!section) return;
        if (!confirm("Clear all answers in “" + section.title + "”?")) return;
        for (const [key] of section.questions) delete state.answers[key];
        saveState();
        renderAll();
    });

    copyBtn.addEventListener("click", () => copyText(compileText()));
    copyAllBtn.addEventListener("click", () => copyText(compileText()));
    downloadBtn.addEventListener("click", downloadMarkdown);

    openMsBtn.addEventListener("click", () => {
        refreshManuscript();
        manuscript.classList.remove("hidden");
    });
    msClose.addEventListener("click", () => manuscript.classList.add("hidden"));
    manuscript.addEventListener("click", (e) => {
        if (e.target === manuscript) manuscript.classList.add("hidden");
    });

    bindTopFields();
    renderAll();
    refreshManuscript();
    applyFieldHash();
    window.addEventListener("hashchange", applyFieldHash);

    function destroy() {
        hideEncyclopediaLinkPrompt();
        window.removeEventListener("hashchange", applyFieldHash);
        dock.remove();
        manuscript.remove();
    }

    return { destroy };
}
