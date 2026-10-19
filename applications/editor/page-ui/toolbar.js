import {
    EDITOR_FONT_GROUPS,
    EDITOR_FONT_SIZES,
    DEFAULT_FONT_ID,
    DEFAULT_FONT_SIZE_PX,
    fontStackForId,
    normalizeFontId,
    normalizeFontSize
} from "./font-catalog.js";
import {
    ensureAllEditorGoogleFonts,
    ensureEditorGoogleFont,
    loadEditorGoogleFontBootstrap
} from "./editor-google-fonts.js";
import { SCENE_BREAK_PRESETS, buildSceneBreakHtml } from "./scene-breaks.js";
import { bindToolbarOverflow, placeMorePanel } from "./toolbar-overflow.js";
import { IS_EDITOR_TEST } from "../../../core/desktop/test-mode.js";

const STORAGE_PREFIX = IS_EDITOR_TEST ? "alysum:editor-test:" : "alysum:editor:";
const INDENT_KEY = STORAGE_PREFIX + "auto-indent";
const SPACE_KEY = STORAGE_PREFIX + "line-spacing";
const INDENT_SIZES = ["1.5em", "0.25in", "0.5in"];
const PARAGRAPH_GAPS = ["preset", "0pt", "6pt", "12pt"];
const LINE_SPACES = ["book", "compact", "comfortable", "relaxed", "single", "one-half", "double"];
const SPACE_LABELS = {
    book: "Book",
    compact: "Compact",
    comfortable: "Comfortable",
    relaxed: "Relaxed",
    single: "1.0 — Single",
    "one-half": "1.5",
    double: "2.0 — Double"
};
const DEFAULT_LINE_SPACE = "comfortable";

const ACTIONS = [
    { command: "bold", label: "B", title: "Bold" },
    { command: "italic", label: "I", title: "Italic" },
    { command: "underline", label: "U", title: "Underline" },
    { command: "strikeThrough", label: "S", title: "Strikethrough" },
    { command: "formatBlock", value: "h1", label: "H1", title: "Heading 1" },
    { command: "formatBlock", value: "h2", label: "H2", title: "Heading 2" },
    { command: "insertUnorderedList", label: "•", title: "Bullet list" },
    { command: "insertOrderedList", label: "1.", title: "Numbered list" },
    { command: "formatBlock", value: "blockquote", label: "“”", title: "Block quote" },
    { command: "undo", label: "↶", title: "Undo" },
    { command: "redo", label: "↷", title: "Redo" }
];

const SEARCH_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.2 10.2 L14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const MORE_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="3.5" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="12.5" r="1.4" fill="currentColor"/></svg>`;

function readAutoIndent() {
    try {
        return localStorage.getItem(INDENT_KEY) !== "0";
    } catch {
        return true;
    }
}

function writeAutoIndent(on) {
    try {
        localStorage.setItem(INDENT_KEY, on ? "1" : "0");
    } catch {
        /* ignore */
    }
}

function readLineSpacing() {
    try {
        const value = localStorage.getItem(SPACE_KEY);
        return LINE_SPACES.includes(value) ? value : DEFAULT_LINE_SPACE;
    } catch {
        return DEFAULT_LINE_SPACE;
    }
}

function writeLineSpacing(value) {
    try {
        localStorage.setItem(SPACE_KEY, value);
    } catch {
        /* ignore */
    }
}

function breakPreview(preset) {
    if (preset.type === "rule") {
        return `<hr class="scene-rule writer-break-preview-rule" />`;
    }
    if (preset.type === "spacer") {
        return `<span class="writer-break-preview-gap">blank</span>`;
    }
    return buildSceneBreakHtml(preset.id).replace(
        'class="scene-break',
        'class="scene-break writer-break-preview'
    );
}

function fontMenuHtml() {
    return EDITOR_FONT_GROUPS.map((group) => {
        const fonts = group.fonts.map((font) => (
            `<button type="button" class="writer-menu-item writer-font-face" data-font-id="${font.id}" style="font-family:${font.stack}" title="${font.label}">${font.label}</button>`
        )).join("");
        return `<div class="writer-font-group"><p class="writer-font-group-label">${group.label}</p>${fonts}</div>`;
    }).join("");
}

function sizeMenuHtml() {
    return EDITOR_FONT_SIZES.map((s) => (
        `<button type="button" class="writer-menu-item writer-font-size" data-font-size="${s.px}">${s.px}</button>`
    )).join("");
}

function spacingMenuHtml() {
    return LINE_SPACES.map((value) => (
        `<button type="button" class="writer-menu-item writer-line-space" data-line-space="${value}">${SPACE_LABELS[value]}</button>`
    )).join("") + `<p class="writer-font-group-label">First-line indent</p>` + INDENT_SIZES.map(value => (
        `<button type="button" class="writer-menu-item" data-indent-size="${value}">${value === "1.5em" ? "Book default" : value.replace("in", " inch")}</button>`
    )).join("") + `<p class="writer-font-group-label">Space after paragraphs</p>` + PARAGRAPH_GAPS.map(value => (
        `<button type="button" class="writer-menu-item" data-paragraph-gap="${value}">${value === "preset" ? "Use spacing preset" : value.replace("pt", " pt")}</button>`
    )).join("");
}

function breakMenuHtml() {
    return SCENE_BREAK_PRESETS.map((preset) => (
        `<button type="button" class="writer-menu-item writer-break-pick" data-break-id="${preset.id}" title="${preset.name}">
            <span class="writer-break-pick-name">${preset.name}</span>
            ${breakPreview(preset)}
        </button>`
    )).join("");
}

function menuBlock(id, label, title, body) {
    return `<div class="writer-tool-menu" data-menu="${id}">
        <button type="button" class="writer-tool writer-tool--menu" data-menu-toggle="${id}" aria-expanded="false" aria-haspopup="true" title="${title}" aria-label="${label}">${label}</button>
        <div class="writer-tool-dropdown writer-tool-dropdown--${id}" hidden>${body}</div>
    </div>`;
}

function paintActive(mount, typography, activeFontId) {
    const fontId = normalizeFontId(activeFontId || typography.fontId || DEFAULT_FONT_ID);
    const size = normalizeFontSize(typography.fontSizePx || DEFAULT_FONT_SIZE_PX);
    mount.querySelectorAll(".writer-font-face").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.fontId === fontId);
    });
    mount.querySelectorAll(".writer-font-size").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.fontSize === String(size));
    });
}

export function mountToolbar({
    mount,
    editor,
    pageEl,
    onTypewriter,
    onFind,
    onTypographyChange,
    getChapterTypography
}) {
    if (!mount || !editor) return;

    const indentOn = readAutoIndent();
    editor.setAutoIndent(indentOn);
    // In-session source of truth — stays correct even where localStorage throws.
    let currentSpacing = readLineSpacing();
    if (pageEl) pageEl.dataset.writerSpace = currentSpacing;
    function setViewPreference(name, value, options) {
        if (!options.includes(value)) return;
        if (pageEl) pageEl.dataset[name] = value;
        try { localStorage.setItem(STORAGE_PREFIX + name, value); } catch { /* view remains usable */ }
    }
    for (const [name, values] of [["writerIndent", INDENT_SIZES], ["writerGap", PARAGRAPH_GAPS]]) {
        let value;
        try { value = localStorage.getItem(STORAGE_PREFIX + name); } catch { /* default */ }
        setViewPreference(name, values.includes(value) ? value : values[0], values);
    }
    void loadEditorGoogleFontBootstrap();

    const wordcount = mount.querySelector(".writer-wordcount");
    mount.innerHTML = [
        `<div class="writer-toolbar-cluster">`,
        `<button type="button" class="writer-tool" data-indent-toggle aria-pressed="${indentOn ? "true" : "false"}" title="Auto indent" aria-label="Auto indent">Indent</button>`,
        ...ACTIONS.map((action) => (
            `<button type="button" class="writer-tool" data-command="${action.command}" data-value="${action.value || ""}" title="${action.title}" aria-label="${action.title}">${action.label}</button>`
        )),
        menuBlock("font", "Font", "Font", fontMenuHtml()),
        menuBlock("size", "Size", "Text size", sizeMenuHtml()),
        menuBlock("spacing", "Spacing", "Writing view spacing — manuscript export has separate settings", spacingMenuHtml()),
        menuBlock("breaks", "Breaks", "Scene break", breakMenuHtml()),
        `<button type="button" class="writer-tool writer-tool--find" data-find-toggle title="Find" aria-label="Find">${SEARCH_ICON}</button>`,
        `<button type="button" class="writer-tool writer-tool--type" data-typewriter title="Typewriter mode" aria-label="Typewriter mode">Type</button>`,
        `</div>`,
        `<div class="writer-tool-menu writer-toolbar-more" data-menu="more" hidden>`,
        `<button type="button" class="writer-tool writer-tool--more" data-menu-toggle="more" aria-expanded="false" aria-haspopup="true" title="More" aria-label="More">${MORE_ICON}</button>`,
        `<div class="writer-tool-dropdown writer-tool-dropdown--more" hidden></div>`,
        `</div>`
    ].join("");
    if (wordcount) mount.appendChild(wordcount);
    bindToolbarOverflow(mount);

    function typography() {
        return getChapterTypography?.() || { fontId: DEFAULT_FONT_ID, fontSizePx: String(DEFAULT_FONT_SIZE_PX) };
    }

    function paintSpacing() {
        mount.querySelectorAll(".writer-line-space").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.lineSpace === currentSpacing);
        });
        for (const [attribute, name] of [["data-indent-size", "writerIndent"], ["data-paragraph-gap", "writerGap"]]) {
            mount.querySelectorAll(`[${attribute}]`).forEach(button => {
                button.classList.toggle("is-active", button.getAttribute(attribute) === pageEl?.dataset[name]);
            });
        }
    }

    function setMoreOpen(open) {
        mount.closest(".writer-main")?.classList.toggle("is-more-open", open);
    }

    function closeMenus({ keepMore = false } = {}) {
        mount.querySelectorAll(".writer-tool-dropdown").forEach((el) => {
            if (keepMore && el.classList.contains("writer-tool-dropdown--more")) return;
            el.hidden = true;
        });
        mount.querySelectorAll("[data-menu-toggle]").forEach((btn) => {
            if (keepMore && btn.dataset.menuToggle === "more") return;
            btn.setAttribute("aria-expanded", "false");
        });
        if (!keepMore) setMoreOpen(false);
    }

    function openMenu(id) {
        const wrap = mount.querySelector(`[data-menu="${id}"]`);
        const panel = wrap?.querySelector(":scope > .writer-tool-dropdown");
        const btn = wrap?.querySelector("[data-menu-toggle]");
        if (!panel) return;
        const keepMore = id !== "more" && !!wrap.closest(".writer-tool-dropdown--more");
        closeMenus({ keepMore });
        if (id === "font") void ensureAllEditorGoogleFonts();
        paintActive(mount, typography(), editor.activeFontId?.());
        paintSpacing();
        panel.hidden = false;
        btn?.setAttribute("aria-expanded", "true");
        if (id === "more") {
            setMoreOpen(true);
            placeMorePanel(btn, panel);
        }
    }

    mount.addEventListener("mousedown", (event) => {
        if (event.target.closest(".writer-tool, .writer-tool-dropdown")) event.preventDefault();
    });

    // Touch and keyboard navigation can move focus before click fires. Preserve
    // the writer's range rather than formatting wherever focus happens to land.
    mount.addEventListener("pointerdown", () => editor.rememberSelection?.());

    mount.addEventListener("click", (event) => {
        editor.restoreSelection?.();
        const indentBtn = event.target.closest("[data-indent-toggle]");
        if (indentBtn) {
            closeMenus();
            const next = indentBtn.getAttribute("aria-pressed") !== "true";
            indentBtn.setAttribute("aria-pressed", next ? "true" : "false");
            writeAutoIndent(next);
            editor.setAutoIndent(next);
            return;
        }
        if (event.target.closest("[data-typewriter]")) {
            closeMenus();
            onTypewriter?.();
            return;
        }
        if (event.target.closest("[data-find-toggle]")) {
            closeMenus();
            onFind?.();
            return;
        }
        const menuBtn = event.target.closest("[data-menu-toggle]");
        if (menuBtn) {
            const id = menuBtn.dataset.menuToggle;
            const panel = mount.querySelector(`[data-menu="${id}"]`)?.querySelector(":scope > .writer-tool-dropdown");
            if (panel && !panel.hidden) closeMenus();
            else openMenu(id);
            return;
        }
        const sizeBtn = event.target.closest("[data-font-size]");
        if (sizeBtn) {
            const fontSizePx = normalizeFontSize(sizeBtn.dataset.fontSize);
            onTypographyChange?.({ fontSizePx });
            paintActive(mount, { ...typography(), fontSizePx }, editor.activeFontId?.());
            closeMenus();
            return;
        }
        const faceBtn = event.target.closest("[data-font-id]");
        if (faceBtn) {
            const fontId = normalizeFontId(faceBtn.dataset.fontId);
            void ensureEditorGoogleFont(fontId);
            const result = editor.applyFont(fontId);
            if (result?.mode === "chapter") onTypographyChange?.({ fontId });
            paintActive(mount, typography(), result?.fontId || fontId);
            closeMenus();
            return;
        }
        const spaceBtn = event.target.closest("[data-line-space]");
        if (spaceBtn) {
            const value = spaceBtn.dataset.lineSpace;
            if (LINE_SPACES.includes(value)) {
                currentSpacing = value;
                writeLineSpacing(value);
                if (pageEl) pageEl.dataset.writerSpace = value;
                paintSpacing();
            }
            closeMenus();
            return;
        }
        const indentSize = event.target.closest("[data-indent-size]");
        const paragraphGap = event.target.closest("[data-paragraph-gap]");
        if (indentSize || paragraphGap) {
            if (indentSize) setViewPreference("writerIndent", indentSize.dataset.indentSize, INDENT_SIZES);
            if (paragraphGap) setViewPreference("writerGap", paragraphGap.dataset.paragraphGap, PARAGRAPH_GAPS);
            paintSpacing();
            closeMenus();
            return;
        }
        const breakBtn = event.target.closest("[data-break-id]");
        if (breakBtn) {
            editor.insertSceneBreak(breakBtn.dataset.breakId);
            closeMenus();
            return;
        }
        const btn = event.target.closest(".writer-tool");
        if (!btn?.dataset.command) return;
        closeMenus();
        editor.command(btn.dataset.command, btn.dataset.value || undefined);
    });

    document.addEventListener("mousedown", (event) => {
        if (mount.contains(event.target)) return;
        closeMenus();
    });

    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const open = mount.querySelector(".writer-tool-dropdown:not([hidden])");
        if (!open) return;
        event.preventDefault();
        closeMenus();
    });

    return {
        closePopover: closeMenus,
        closeMenus,
        isPopoverOpen() {
            return !!mount.querySelector(".writer-tool-dropdown:not([hidden])");
        },
        syncTypography() {
            paintActive(mount, typography(), editor.activeFontId?.());
        }
    };
}

export { fontStackForId };
