/** Scene break presets and insert helpers for chapter HTML. */

export const SCENE_BREAK_PRESETS = [
    { id: "classic", name: "Classic", minimal: true },
    { id: "stars", name: "Stars" },
    { id: "swords", name: "Crossed swords" },
    { id: "gears", name: "Gears" },
    { id: "ornament", name: "Ornamental" },
    { id: "hearts", name: "Hearts" },
    { id: "skulls", name: "Skulls" },
    { id: "moons", name: "Moons" },
    { id: "dashes", name: "Em dashes", minimal: true },
    { id: "bullets", name: "Bullets", minimal: true },
    { id: "flourish", name: "Flourish", minimal: true },
    { id: "rule", name: "Thin rule", type: "rule" },
    { id: "spacer", name: "Blank space", type: "spacer" }
];

export function isSceneBreakParagraph(el) {
    return el?.tagName === "P" && (el.classList.contains("scene-break") || el.classList.contains("scene-spacer"));
}

export function isSceneBreakRule(el) {
    return el?.tagName === "HR" && el.classList.contains("scene-rule");
}

export function isSceneBreakNode(el) {
    return !!(el && (isSceneBreakParagraph(el) || isSceneBreakRule(el) || el.closest?.(".scene-break, .scene-spacer, hr.scene-rule")));
}

export function buildSceneBreakHtml(presetId) {
    const preset = SCENE_BREAK_PRESETS.find((item) => item.id === presetId);
    if (!preset) return "";
    if (preset.type === "rule") return '<hr class="scene-rule" contenteditable="false" />';
    if (preset.type === "spacer") return '<p class="scene-spacer" contenteditable="false">&nbsp;</p>';
    const minimal = preset.minimal ? " scene-break--minimal" : "";
    return `<p class="scene-break scene-break--${preset.id}${minimal}" contenteditable="false"><span class="scene-break-glyph" aria-hidden="true"></span></p>`;
}

function focusEditorParagraph(paragraph) {
    if (!paragraph) return;
    const selection = window.getSelection();
    if (!selection) return;
    if (!paragraph.querySelector("br") && !paragraph.textContent.trim()) {
        paragraph.innerHTML = "<br>";
    }
    const range = document.createRange();
    if (paragraph.firstChild?.nodeType === Node.TEXT_NODE) {
        range.setStart(paragraph.firstChild, paragraph.firstChild.length);
    } else {
        range.setStart(paragraph, 0);
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

function placeCaretAfterSceneBreak(breakEl) {
    let next = breakEl.nextElementSibling;
    if (!next || isSceneBreakParagraph(next) || isSceneBreakRule(next)) {
        next = document.createElement("p");
        next.innerHTML = "<br>";
        breakEl.after(next);
    } else if (next.tagName === "P" && !next.textContent.replace(/\u200B/g, "").trim() && !next.querySelector("img, figure")) {
        if (!next.querySelector("br")) next.innerHTML = "<br>";
    }
    focusEditorParagraph(next);
}

export function ensureEditorTailAfterSceneBreaks(editor) {
    if (!editor) return;
    const last = editor.lastElementChild;
    if (!last) return;
    if (isSceneBreakParagraph(last) || isSceneBreakRule(last)) {
        const paragraph = document.createElement("p");
        paragraph.innerHTML = "<br>";
        editor.appendChild(paragraph);
    }
}

function fixSceneBreakSelection(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const node = selection.anchorNode;
    if (!node) return;
    const anchor = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const inBreak = anchor?.closest?.(".scene-break, .scene-spacer, hr.scene-rule");
    if (inBreak && editor.contains(inBreak)) {
        placeCaretAfterSceneBreak(inBreak);
        return;
    }
    ensureEditorTailAfterSceneBreaks(editor);
}

export function insertSceneBreakAtCursor(editor, presetId) {
    const breakHtml = buildSceneBreakHtml(presetId);
    if (!breakHtml || !editor) return;
    const html = `${breakHtml}<p><br></p>`;
    editor.focus();
    try {
        document.execCommand("insertHTML", false, html);
    } catch {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const temp = document.createElement("div");
        temp.innerHTML = html;
        const fragment = document.createDocumentFragment();
        let lastNode = null;
        while (temp.firstChild) lastNode = fragment.appendChild(temp.firstChild);
        if (range && editor.contains(range.commonAncestorContainer)) {
            range.deleteContents();
            range.insertNode(fragment);
        } else {
            editor.appendChild(fragment);
        }
        if (lastNode && selection) {
            const nextRange = document.createRange();
            nextRange.setStartAfter(lastNode);
            nextRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(nextRange);
        }
    }
    const breaks = editor.querySelectorAll(".scene-break, .scene-spacer, hr.scene-rule");
    const lastBreak = breaks[breaks.length - 1];
    if (lastBreak) placeCaretAfterSceneBreak(lastBreak);
    ensureEditorTailAfterSceneBreaks(editor);
}

export function initSceneBreakEditorBehavior(editor) {
    if (!editor || editor.dataset.sceneBreakReady === "1") return;
    editor.dataset.sceneBreakReady = "1";
    const onSel = () => fixSceneBreakSelection(editor);
    editor.addEventListener("mouseup", onSel);
    editor.addEventListener("keyup", onSel);
    document.addEventListener("selectionchange", () => {
        if (!editor.contains(document.activeElement) && document.activeElement !== editor) return;
        onSel();
    });
}
