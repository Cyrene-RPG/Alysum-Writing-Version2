/** Scene break presets and editor picker for Alysum chapters. */

export const SCENE_BREAK_CLASSES = new Set(["scene-break", "scene-spacer", "scene-rule"]);
const SCENE_BREAK_VARIANT_PREFIX = "scene-break--";

export const SCENE_BREAK_PRESETS = [
    { id: "classic", name: "Classic", tags: ["literary", "contemporary", "drama", "romance"], minimal: true },
    { id: "stars", name: "Stars", tags: ["fantasy", "fairy", "mythic", "magical"] },
    { id: "swords", name: "Crossed swords", tags: ["fantasy", "sword", "epic", "adventure", "action"] },
    { id: "gears", name: "Gears", tags: ["science fiction", "steampunk", "cyberpunk", "tech"] },
    { id: "ornament", name: "Ornamental", tags: ["historical", "literary", "classic"] },
    { id: "hearts", name: "Hearts", tags: ["romance", "love", "drama"] },
    { id: "skulls", name: "Skulls", tags: ["horror", "dark", "gothic"] },
    { id: "moons", name: "Moons", tags: ["gothic", "paranormal", "dark fantasy"] },
    { id: "dashes", name: "Em dashes", tags: ["mystery", "thriller", "noir", "literary"], minimal: true },
    { id: "bullets", name: "Bullets", tags: ["science fiction", "minimal", "contemporary"], minimal: true },
    { id: "flourish", name: "Flourish", tags: ["gothic", "horror", "dark"], minimal: true },
    { id: "rule", name: "Thin rule", type: "rule", tags: ["nonfiction", "minimal", "literary"] },
    { id: "spacer", name: "Blank space", type: "spacer", tags: ["any"] },
];

function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function isSceneBreakParagraph(el) {
    return el?.tagName === "P" && (el.classList.contains("scene-break") || el.classList.contains("scene-spacer"));
}

export function isSceneBreakRule(el) {
    return el?.tagName === "HR" && el.classList.contains("scene-rule");
}

function sceneBreakClassList(el) {
    if (el.classList.contains("scene-spacer")) return ["scene-spacer"];
    const classes = ["scene-break"];
    for (const name of el.classList) {
        if (name.startsWith(SCENE_BREAK_VARIANT_PREFIX)) classes.push(name);
    }
    return [...new Set(classes)];
}

export function followsSceneBreak(el) {
    const prev = el?.previousElementSibling;
    return !!(prev && (isSceneBreakParagraph(prev) || isSceneBreakRule(prev)));
}

export function isCaretParagraph(el) {
    if (!el || el.tagName !== "P" || isSceneBreakParagraph(el)) return false;
    const text = el.textContent.replace(/\u200B/g, "").trim();
    return !text && !el.querySelector("img, figure") && (el.querySelector("br") || el.textContent.includes("\u200B"));
}

/** Preserve scene-break markup when sanitizing chapter HTML. Returns true if handled. */
export function normalizeSceneBreakAttributes(el) {
    if (isSceneBreakParagraph(el)) {
        [...el.attributes].forEach((attr) => {
            if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
        });
        el.className = sceneBreakClassList(el).join(" ");
        el.setAttribute("contenteditable", "false");
        const glyph = el.querySelector(".scene-break-glyph");
        if (glyph) {
            [...glyph.attributes].forEach((attr) => glyph.removeAttribute(attr.name));
            glyph.className = "scene-break-glyph";
            glyph.setAttribute("aria-hidden", "true");
            el.textContent = "";
            el.appendChild(glyph);
        }
        return true;
    }
    if (isSceneBreakRule(el)) {
        [...el.attributes].forEach((attr) => {
            if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
        });
        el.className = "scene-rule";
        el.setAttribute("contenteditable", "false");
        return true;
    }
    return false;
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
    if (inBreak) {
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
    if (document.queryCommandSupported?.("insertHTML")) {
        document.execCommand("insertHTML", false, html);
    } else {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const temp = document.createElement("div");
        temp.innerHTML = html;
        const fragment = document.createDocumentFragment();
        let lastNode = null;
        while (temp.firstChild) lastNode = fragment.appendChild(temp.firstChild);
        if (range) {
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
}

export function initSceneBreakEditorBehavior(editor) {
    if (!editor || editor.dataset.sceneBreakBound === "1") return;
    editor.dataset.sceneBreakBound = "1";
    const scheduleFix = () => requestAnimationFrame(() => fixSceneBreakSelection(editor));
    editor.addEventListener("click", scheduleFix);
    editor.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) {
            scheduleFix();
        }
    });
}

function scorePresetForGenres(preset, genres) {
    if (!genres.length) return 0;
    const haystack = genres.join(" ").toLowerCase();
    let score = 0;
    for (const tag of preset.tags || []) {
        if (haystack.includes(tag)) score += tag.length > 6 ? 3 : 2;
    }
    return score;
}

export function getSuggestedSceneBreakPresets(genres, limit = 3) {
    return SCENE_BREAK_PRESETS
        .filter((preset) => preset.type !== "spacer")
        .map((preset) => ({ preset, score: scorePresetForGenres(preset, genres) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.preset.name.localeCompare(b.preset.name))
        .slice(0, limit)
        .map((entry) => entry.preset);
}

function previewHtml(preset) {
    if (preset.type === "rule") return '<hr class="scene-rule scene-break-preview-rule" />';
    if (preset.type === "spacer") return '<span class="scene-break-preview-gap">blank gap</span>';
    const minimal = preset.minimal ? " scene-break--minimal" : "";
    return `<span class="scene-break scene-break--${preset.id}${minimal} scene-break-preview"><span class="scene-break-glyph" aria-hidden="true"></span></span>`;
}

function renderPresetSections(listEl, genres) {
    listEl.innerHTML = "";
    const suggested = getSuggestedSceneBreakPresets(genres);
    const featured = suggested.length ? suggested : SCENE_BREAK_PRESETS.slice(0, 4);
    const featuredIds = new Set(featured.map((p) => p.id));
    const sections = [
        { label: suggested.length ? "Suggested for your genres" : "Quick picks", presets: featured },
        { label: "All scene breaks", presets: SCENE_BREAK_PRESETS.filter((p) => !featuredIds.has(p.id)) },
    ];

    sections.forEach(({ label, presets }) => {
        if (!presets.length) return;
        const heading = document.createElement("div");
        heading.className = "scene-break-section-label";
        heading.textContent = label;
        listEl.appendChild(heading);
        presets.forEach((preset) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "scene-break-pick";
            btn.dataset.presetId = preset.id;
            btn.innerHTML = `<span class="scene-break-pick-name">${escapeHtml(preset.name)}</span><span class="scene-break-pick-preview" aria-hidden="true">${previewHtml(preset)}</span>`;
            listEl.appendChild(btn);
        });
    });
}

export function initSceneBreakPicker(options) {
    const { btn, modal, listEl, closeBtn, getGenres, isDisabled, onPick } = options;
    if (!btn || !modal || !listEl) return;

    const close = () => {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    };

    const open = () => {
        if (isDisabled()) return;
        renderPresetSections(listEl, getGenres());
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        listEl.querySelector(".scene-break-pick")?.focus();
    };

    btn.addEventListener("click", () => {
        if (isDisabled()) return;
        open();
    });

    closeBtn?.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
    });

    listEl.addEventListener("click", (e) => {
        const pick = e.target.closest(".scene-break-pick");
        if (!pick?.dataset.presetId) return;
        onPick(pick.dataset.presetId);
        close();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("open")) close();
    });
}
